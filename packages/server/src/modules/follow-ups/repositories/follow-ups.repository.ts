import { and, desc, eq } from "drizzle-orm";
import { followUpTypes, type FollowUp, type FollowUpDetail, type FollowUpQueueItem } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { appointments, followUps, followUpEvents } from "../../../db/schema/coaching.js";
import { customers, subscriptions, subscriptionPauses } from "../../../db/schema/customers.js";
import { servicePolicies } from "../../../db/schema/catalogue.js";
import { AuditService, type AuditMetadata } from "../../auth/services/audit.service.js";
import { calculateCadence, effectiveFollowUpStatus, InvalidCadenceError, latestMeaningfulActivity, resolveCadence } from "../services/follow-up-cadence.policy.js";
import { followUpFailure, type FollowUpActor, type FollowUpCommand, type FollowUpResult, type FollowUpsRepository } from "../services/follow-ups.service.js";
type Tx = Parameters<Parameters<typeof appDb.transaction>[0]>[0];
type Subscription = typeof subscriptions.$inferSelect;

export class DrizzleFollowUpsRepository implements FollowUpsRepository {
  constructor(private readonly database: typeof appDb, private readonly options: { auditHashPepper: string }, private readonly clock: () => Date = () => new Date()) {}
  private async detail(tx: Tx, sub: Subscription, now: Date): Promise<FollowUpDetail> {
    const policyRows = await tx.select().from(servicePolicies).where(eq(servicePolicies.serviceId, sub.serviceId));
    const cadence = resolveCadence(sub.followUpFrequencyDaysOverride, policyRows, sub.variantId);
    if (!cadence) throw new InvalidCadenceError("Invalid current cadence configuration");
    const rows = await tx.select().from(followUps).where(eq(followUps.subscriptionId, sub.id)).orderBy(desc(followUps.occurredAt), followUps.id);
    // Only completed appointments contribute: scheduled/confirmed/missed/cancelled
    // and all unrelated workflows are deliberately outside this activity query.
    const completed = await tx.select({ completedAt: appointments.completedAt }).from(appointments).where(and(eq(appointments.subscriptionId, sub.id), eq(appointments.status, "completed")));
    const pauses = await tx.select({ startedAt: subscriptionPauses.startedAt, endedAt: subscriptionPauses.endedAt }).from(subscriptionPauses).where(eq(subscriptionPauses.subscriptionId, sub.id));
    const events = await tx.select({ event: followUpEvents }).from(followUpEvents).innerJoin(followUps, eq(followUps.id, followUpEvents.followUpId))
      .where(eq(followUps.subscriptionId, sub.id)).orderBy(followUpEvents.createdAt, followUpEvents.id);
    const dto: FollowUp[] = rows.map(row => {
      const type = followUpTypes.find(t => t === row.followUpType);
      if (!type || row.status !== "open" && row.status !== "done" && row.status !== "cancelled") throw new Error("Invalid follow-up history");
      return { id: row.id, followUpType: type, occurredAt: row.occurredAt.toISOString(), note: row.note, nextAction: row.nextAction, nextActionAt: row.nextActionAt?.toISOString() ?? null,
        status: row.status, effectiveStatus: effectiveFollowUpStatus(row.status, row.nextActionAt, now), completedAt: row.completedAt?.toISOString() ?? null, cancelledAt: row.cancelledAt?.toISOString() ?? null,
        events: events.filter(e => e.event.followUpId === row.id).map(({ event }) => ({ id: event.id, eventType: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus, reason: event.reason, createdAt: event.createdAt.toISOString() })) };
    });
    return { subscriptionId: sub.id, reference: sub.reference, subscriptionStatus: sub.status, frequencyDaysOverride: sub.followUpFrequencyDaysOverride, asOf: now.toISOString(),
      cadence: calculateCadence({ status: sub.status, actualStartDate: sub.actualStartDate, cadence, activity: latestMeaningfulActivity(sub.actualStartDate, completed, rows), pauses, now }), followUps: dto };
  }
  private async audit(tx: Tx, actor: FollowUpActor, subId: string, followUpId: string | null, eventType: string, metadata: AuditMetadata) {
    await new AuditService(tx, this.options).record({ actorType: "user", actorUserId: actor.userId, eventType, entityType: followUpId ? "follow_up" : "subscription", entityId: followUpId ?? subId,
      requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent, result: "success", metadata: { subscriptionId: subId, ...(followUpId ? { followUpId } : {}), ...metadata } });
  }
  async execute(id: string, command: FollowUpCommand, actor: FollowUpActor): Promise<FollowUpResult> {
    try {
      if (command.action === "read" || command.action === "queue") return await this.database.transaction(async tx => {
        // One snapshot and one authoritative instant across the queue and all related
        // activity/pause queries. Reads never materialize overdue or append history.
        const now = this.clock();
        if (command.action === "read") {
          const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id));
          return sub ? { ok: true, body: { detail: await this.detail(tx, sub, now) } } : followUpFailure("FOLLOW_UP_NOT_FOUND");
        }
        const owners = await tx.select({ sub: subscriptions, customer: { id: customers.id, fullName: customers.fullName } }).from(subscriptions)
          .innerJoin(customers, eq(customers.id, subscriptions.customerId)).where(eq(subscriptions.status, "active"));
        const items: FollowUpQueueItem[] = [];
        for (const { sub, customer } of owners) {
          const view = await this.detail(tx, sub, now);
          if (!view.cadence.cadenceEligible) continue;
          items.push({ ...view.cadence, subscriptionId: sub.id, reference: sub.reference, customer,
            openFollowUpCount: view.followUps.filter(f => f.status === "open").length, overdueNextActionCount: view.followUps.filter(f => f.effectiveStatus === "overdue").length });
        }
        const priority = { overdue: 0, due: 1, healthy: 2 };
        items.sort((a, b) => priority[a.cadenceState ?? "healthy"] - priority[b.cadenceState ?? "healthy"]
          || Date.parse(a.nextFollowUpDueAt!) - Date.parse(b.nextFollowUpDueAt!) || a.subscriptionId.localeCompare(b.subscriptionId));
        return { ok: true, body: { asOf: now.toISOString(), items } };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });

      return await this.database.transaction(async tx => {
        const initial = command.action === "complete" || command.action === "cancel" ? (await tx.select({ subscriptionId: followUps.subscriptionId }).from(followUps).where(eq(followUps.id, id)))[0] : null;
        if ((command.action === "complete" || command.action === "cancel") && !initial) return followUpFailure("FOLLOW_UP_NOT_FOUND");
        const subscriptionId = initial?.subscriptionId ?? id;
        // Parent first agrees with lifecycle and appointment writers, then the follow-up.
        const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).for("update");
        if (!sub) return followUpFailure("FOLLOW_UP_NOT_FOUND");
        if (command.action === "cadence") {
          if (!["active", "paused"].includes(sub.status)) return followUpFailure("FOLLOW_UP_CADENCE_NOT_APPLICABLE");
          const now = this.clock();
          const [updated] = await tx.update(subscriptions).set({ followUpFrequencyDaysOverride: command.frequencyDays, updatedAt: now }).where(eq(subscriptions.id, subscriptionId)).returning();
          if (!updated) throw new Error("Cadence update returned no row");
          const detail = await this.detail(tx, updated, now); // Invalid configuration/range throws and rolls back.
          await this.audit(tx, actor, subscriptionId, null, "follow_up.cadence_override_updated", { oldCadenceDays: sub.followUpFrequencyDaysOverride, newCadenceDays: command.frequencyDays, cadenceSource: detail.cadence.cadenceSource });
          return { ok: true, body: { detail } };
        }
        if (command.action === "create") {
          if (sub.status !== "active") return followUpFailure("FOLLOW_UP_SUBSCRIPTION_NOT_ACTIVE");
          const now = this.clock();
          if (command.occurredAt > now) return followUpFailure("FOLLOW_UP_OCCURRED_AT_FUTURE");
          const status = command.nextAction ? "open" : "done";
          const [created] = await tx.insert(followUps).values({ subscriptionId, followUpType: command.followUpType, occurredAt: command.occurredAt, note: command.note,
            nextAction: command.nextAction, nextActionAt: command.nextActionAt, status, completedAt: status === "done" ? command.occurredAt : null, createdByUserId: actor.userId }).returning();
          if (!created) throw new Error("Follow-up insert returned no row");
          await tx.insert(followUpEvents).values({ followUpId: created.id, eventType: "follow_up.recorded", fromStatus: null, toStatus: status, actorUserId: actor.userId, createdAt: now });
          await this.audit(tx, actor, subscriptionId, created.id, "follow_up.recorded", { followUpType: created.followUpType, fromStatus: null, toStatus: status });
        } else {
          const [row] = await tx.select().from(followUps).where(and(eq(followUps.id, id), eq(followUps.subscriptionId, subscriptionId))).for("update");
          if (!row) return followUpFailure("FOLLOW_UP_NOT_FOUND");
          if (row.status !== "open") return followUpFailure("FOLLOW_UP_TRANSITION_INVALID");
          const now = this.clock(), toStatus = command.action === "complete" ? "done" : "cancelled", eventType = command.action === "complete" ? "follow_up.completed" : "follow_up.cancelled";
          await tx.update(followUps).set(command.action === "complete" ? { status: toStatus, completedAt: now } : { status: toStatus, cancelledAt: now }).where(eq(followUps.id, id));
          await tx.insert(followUpEvents).values({ followUpId: id, eventType, fromStatus: "open", toStatus, actorUserId: actor.userId, reason: command.action === "cancel" ? command.reason : null, createdAt: now });
          await this.audit(tx, actor, subscriptionId, id, eventType, { followUpType: row.followUpType, fromStatus: "open", toStatus });
        }
        return { ok: true, body: { detail: await this.detail(tx, sub, this.clock()) } };
      });
    } catch (error) { if (error instanceof InvalidCadenceError) return followUpFailure("FOLLOW_UP_CADENCE_INVALID"); throw error; }
  }
}

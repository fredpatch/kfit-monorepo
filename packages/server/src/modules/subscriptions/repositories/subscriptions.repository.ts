import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { subscriptionCommands, type SubscriptionDetail } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { services, serviceVariants, servicePolicies } from "../../../db/schema/catalogue.js";
import { subscriptions, subscriptionPauses, subscriptionStatusHistory, subscriptionComponents } from "../../../db/schema/customers.js";
import { medicalClearanceRecords, onboardingItems } from "../../../db/schema/onboarding.js";
import { AuditService } from "../../auth/services/audit.service.js";
import { lockConsentDefinitions, readConsentEvidence } from "../../consents/repositories/consent.repository.js";
import { checklistDefinition, itemPermissions, resolveEffectivePolicy } from "../../onboarding/services/onboarding.service.js";
import { endFromDuration, transitions, validDuration } from "../services/subscription-lifecycle.policy.js";
import { failure, type LifecycleActor, type LifecycleCommand, type LifecycleResult, type SubscriptionsRepository } from "../services/subscriptions.service.js";

type Transaction = Parameters<Parameters<typeof appDb.transaction>[0]>[0];
type Subscription = typeof subscriptions.$inferSelect;
const iso = (date: Date | null) => date?.toISOString() ?? null;

async function detail(tx: Transaction, sub: Subscription): Promise<SubscriptionDetail> {
  const [service] = await tx.select().from(services).where(eq(services.id, sub.serviceId));
  const [variant] = sub.variantId ? await tx.select().from(serviceVariants).where(eq(serviceVariants.id, sub.variantId)) : [];
  const [child] = await tx.select({ id: subscriptions.id, reference: subscriptions.reference }).from(subscriptions).where(eq(subscriptions.renewedFromSubscriptionId, sub.id));
  const pauses = await tx.select().from(subscriptionPauses).where(eq(subscriptionPauses.subscriptionId, sub.id)).orderBy(subscriptionPauses.startedAt, subscriptionPauses.id);
  const history = await tx.select().from(subscriptionStatusHistory).where(eq(subscriptionStatusHistory.subscriptionId, sub.id)).orderBy(subscriptionStatusHistory.changedAt, subscriptionStatusHistory.id);
  const components = await tx.select().from(subscriptionComponents).where(eq(subscriptionComponents.subscriptionId, sub.id)).orderBy(subscriptionComponents.id);
  return {
    id: sub.id, reference: sub.reference, customerId: sub.customerId, serviceId: sub.serviceId, serviceName: service?.name ?? "",
    variantId: sub.variantId, variantName: variant?.name ?? null, status: sub.status, agreedPriceXaf: sub.agreedPriceXaf, currency: sub.currency,
    plannedStartDate: iso(sub.plannedStartDate), actualStartDate: iso(sub.actualStartDate), plannedEndDate: iso(sub.plannedEndDate), actualEndDate: iso(sub.actualEndDate),
    durationValueSnapshot: sub.durationValueSnapshot, durationUnitSnapshot: sub.durationUnitSnapshot, cancelledAt: iso(sub.cancelledAt), completedAt: iso(sub.completedAt),
    renewedFromSubscriptionId: sub.renewedFromSubscriptionId, renewalChild: child ?? null,
    pauses: pauses.map(p => ({ id: p.id, startedAt: p.startedAt.toISOString(), endedAt: iso(p.endedAt), reason: p.reason, originalEndDate: iso(p.originalEndDate), revisedEndDate: iso(p.revisedEndDate) })),
    history: history.map(h => ({ id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, reason: h.reason, changedAt: h.changedAt.toISOString() })),
    components: components.map(c => ({ id: c.id, componentType: c.componentType, labelSnapshot: c.labelSnapshot, quantityEntitled: c.quantityEntitled, quantityConsumed: c.quantityConsumed, quantityOwedByCoach: c.quantityOwedByCoach })),
    availableCommands: subscriptionCommands.filter(action => transitions[action].includes(sub.status) && (action !== "renew" || !child)),
  };
}

async function activationAllowed(tx: Transaction, sub: Subscription): Promise<boolean> {
  // Match catalogue/definition lock order used by authoritative onboarding writers.
  const [service] = await tx.select().from(services).where(eq(services.id, sub.serviceId)).for("share");
  if (!service) return false;
  if (sub.variantId) {
    const [variant] = await tx.select().from(serviceVariants).where(and(eq(serviceVariants.id, sub.variantId), eq(serviceVariants.serviceId, sub.serviceId))).for("share");
    if (!variant) return false;
  }
  const policies = await tx.select().from(servicePolicies).where(eq(servicePolicies.serviceId, sub.serviceId));
  const policy = resolveEffectivePolicy(policies, sub.variantId);
  if (policy.status !== "ok") return false;
  await lockConsentDefinitions(tx);
  const evidence = await readConsentEvidence(tx, sub.id);
  if (!evidence.current || !evidence.bundle.satisfied) return false;
  const items = await tx.select().from(onboardingItems).where(eq(onboardingItems.subscriptionId, sub.id));
  if (!checklistDefinition(policy.questionnaireRequired).every(required => items.some(item => item.itemType === required.itemType && item.isBlocking))) return false;
  if (items.some(item => item.isBlocking && item.status !== "completed" && !(item.status === "waived" && itemPermissions(item.itemType).canWaive && item.waivedAt && item.waiverReason?.trim()))) return false;
  const medical = await tx.select({ id: medicalClearanceRecords.id }).from(medicalClearanceRecords).where(and(eq(medicalClearanceRecords.subscriptionId, sub.id), inArray(medicalClearanceRecords.status, ["required", "pending", "awaiting_document", "under_review"])));
  return medical.length === 0;
}

export class DrizzleSubscriptionsRepository implements SubscriptionsRepository {
  constructor(private readonly database: typeof appDb, private readonly options: { auditHashPepper: string }) {}
  async execute(id: string, command: LifecycleCommand, actor: LifecycleActor): Promise<LifecycleResult> {
    return this.database.transaction(async tx => {
      const query = tx.select().from(subscriptions).where(eq(subscriptions.id, id));
      // Shared read lock produces a coherent detail while mutations serialize on this row.
      const [sub] = await query.for(command.action === "read" ? "share" : "update");
      if (!sub) return failure("SUBSCRIPTION_NOT_FOUND");
      if (command.action === "read") return { status: "ok", subscription: await detail(tx, sub) };
      if (!transitions[command.action].includes(sub.status)) return failure("SUBSCRIPTION_TRANSITION_INVALID");
      if (command.action === "activate") {
        if (sub.actualStartDate) return failure("SUBSCRIPTION_ALREADY_STARTED");
        if (!await activationAllowed(tx, sub)) return failure("SUBSCRIPTION_BLOCKED");
      }
      const pauses = await tx.select().from(subscriptionPauses).where(eq(subscriptionPauses.subscriptionId, id));
      const open = pauses.filter(p => p.endedAt === null);
      const components = await tx.select().from(subscriptionComponents).where(eq(subscriptionComponents.subscriptionId, id));
      const now = new Date(); // authoritative time after all blocking locks
      const update: Partial<typeof subscriptions.$inferInsert> = { updatedAt: now };
      let toStatus: string;
      let event: string;
      switch (command.action) {
        case "activate": {
          const duration = { value: sub.durationValueSnapshot, unit: sub.durationUnitSnapshot };
          if (!validDuration(duration)) return failure("SUBSCRIPTION_DURATION_INVALID");
          let end: Date | null;
          try { end = endFromDuration(now, duration); } catch { return failure("SUBSCRIPTION_DURATION_INVALID"); }
          Object.assign(update, { actualStartDate: now, plannedEndDate: end, capacityReservedUntil: null });
          toStatus = "active"; event = "subscription.activated"; break;
        }
        case "pause":
          if (open.length) return failure("SUBSCRIPTION_PAUSE_ALREADY_OPEN");
          if (!command.reason?.trim()) return failure("SUBSCRIPTION_INVALID_INPUT");
          await tx.insert(subscriptionPauses).values({ subscriptionId: id, startedAt: now, reason: command.reason, originalEndDate: sub.plannedEndDate, revisedEndDate: null, createdByUserId: actor.userId });
          toStatus = "paused"; event = "subscription.paused"; break;
        case "resume": {
          if (open.length !== 1) return failure("SUBSCRIPTION_PAUSE_NOT_FOUND");
          const pause = open[0]!;
          const end = command.revisedEndDate ?? null;
          if (sub.plannedEndDate && !end || end && (end <= now || pause.originalEndDate && end < pause.originalEndDate)) return failure("SUBSCRIPTION_RESUME_DATE_INVALID");
          await tx.update(subscriptionPauses).set({ endedAt: now, revisedEndDate: end }).where(eq(subscriptionPauses.id, pause.id));
          if (end) update.plannedEndDate = end;
          toStatus = "active"; event = "subscription.resumed"; break;
        }
        case "completion-due":
          if ((!sub.plannedEndDate || sub.plannedEndDate > now) && !command.reason?.trim()) return failure("SUBSCRIPTION_COMPLETION_REASON_REQUIRED");
          toStatus = "completion_due"; event = "subscription.completion_due"; break;
        case "complete":
          if (command.overrideOutstandingComponents && !command.reason?.trim()) return failure("SUBSCRIPTION_COMPLETION_REASON_REQUIRED");
          if (components.some(c => c.quantityOwedByCoach > 0) && !command.overrideOutstandingComponents) return failure("SUBSCRIPTION_COMPONENTS_OUTSTANDING");
          Object.assign(update, { actualEndDate: now, completedAt: now });
          toStatus = "completed"; event = "subscription.completed"; break;
        case "resume-active": {
          if (!command.reason?.trim()) return failure("SUBSCRIPTION_INVALID_INPUT");
          const end = command.revisedEndDate;
          if (end && (end <= now || sub.plannedEndDate && end < sub.plannedEndDate)) return failure("SUBSCRIPTION_RESUME_DATE_INVALID");
          if (end) update.plannedEndDate = end;
          toStatus = "active"; event = "subscription.resumed"; break;
        }
        case "cancel":
          if (!command.reason?.trim()) return failure("SUBSCRIPTION_INVALID_INPUT");
          if (sub.status === "paused") {
            if (open.length !== 1) return failure("SUBSCRIPTION_PAUSE_NOT_FOUND");
            await tx.update(subscriptionPauses).set({ endedAt: now }).where(eq(subscriptionPauses.id, open[0]!.id));
          }
          update.cancelledAt = now; toStatus = "cancelled"; event = "subscription.cancelled"; break;
        case "renew": {
          const [existing] = await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.renewedFromSubscriptionId, id));
          if (existing) return failure("SUBSCRIPTION_RENEWAL_ALREADY_EXISTS");
          if (!command.plannedStartDate || !Number.isFinite(command.plannedStartDate.getTime())) return failure("SUBSCRIPTION_INVALID_INPUT");
          if (!validDuration({ value: sub.durationValueSnapshot, unit: sub.durationUnitSnapshot })) return failure("SUBSCRIPTION_DURATION_INVALID");
          const [child] = await tx.insert(subscriptions).values({
            reference: `SUB-${randomUUID().toUpperCase()}`, customerId: sub.customerId, serviceId: sub.serviceId, variantId: sub.variantId,
            sourceRequestId: null, renewedFromSubscriptionId: id, status: "onboarding", agreedPriceXaf: sub.agreedPriceXaf, currency: sub.currency,
            durationValueSnapshot: sub.durationValueSnapshot, durationUnitSnapshot: sub.durationUnitSnapshot, plannedStartDate: command.plannedStartDate,
            createdByUserId: actor.userId, createdAt: now, updatedAt: now,
          }).returning();
          if (!child) throw new Error("Renewal insert returned no row");
          if (components.length) await tx.insert(subscriptionComponents).values(components.map(c => ({ subscriptionId: child.id,
            sourceServiceComponentId: c.sourceServiceComponentId, componentType: c.componentType, labelSnapshot: c.labelSnapshot, quantityEntitled: c.quantityEntitled,
            quantityConsumed: 0, quantityOwedByCoach: 0, createdAt: now, updatedAt: now })));
          await tx.insert(subscriptionStatusHistory).values({ subscriptionId: child.id, fromStatus: null, toStatus: "onboarding", changedAt: now, changedByUserId: actor.userId });
          await new AuditService(tx, this.options).record({ actorType: "user", actorUserId: actor.userId, requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
            eventType: "subscription.renewed", entityType: "subscription", entityId: id, result: "success",
            metadata: { subscriptionId: id, renewalSubscriptionId: child.id, fromStatus: sub.status, toStatus: "onboarding" } });
          return { status: "ok", subscription: await detail(tx, sub) };
        }
      }
      update.status = toStatus;
      const [updated] = await tx.update(subscriptions).set(update).where(eq(subscriptions.id, id)).returning();
      if (!updated) throw new Error("Lifecycle update returned no row");
      await tx.insert(subscriptionStatusHistory).values({ subscriptionId: id, fromStatus: sub.status, toStatus, reason: command.reason || null, changedAt: now, changedByUserId: actor.userId });
      await new AuditService(tx, this.options).record({ actorType: "user", actorUserId: actor.userId, requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
        eventType: event, entityType: "subscription", entityId: id, result: "success", metadata: { subscriptionId: id, fromStatus: sub.status, toStatus, occurredAt: now.toISOString(), completionOverride: command.action === "complete" && command.overrideOutstandingComponents === true } });
      return { status: "ok", subscription: await detail(tx, updated) };
    }, { isolationLevel: "read committed" });
  }
}

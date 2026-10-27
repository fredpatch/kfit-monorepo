import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  appointmentActions,
  type AppointmentDetail,
  type AppointmentErrorCode,
  type PublicAppointmentDocument,
} from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import {
  appointments,
  appointmentEvents,
} from "../../../db/schema/coaching.js";
import {
  subscriptions,
  subscriptionComponents,
  componentEvents,
} from "../../../db/schema/customers.js";
import {
  services,
  serviceVariants,
  servicePolicies,
} from "../../../db/schema/catalogue.js";
import {
  secureAccessTokens,
  externalAccessEvents,
} from "../../../db/schema/documents.js";
import {
  AuditService,
  hashAuditContext,
  type AuditMetadata,
} from "../../auth/services/audit.service.js";
import {
  appointmentFailure,
  type AppointmentActor,
  type AppointmentCommand,
  type AppointmentResult,
  type AppointmentsRepository,
} from "../services/appointments.service.js";
import {
  accessFailureResult,
  assertCustomerWritable,
} from "../../privacy/repositories/subject-freeze.js";
import {
  appointmentTokenScope,
  appointmentTransitions,
  consumptiveEvents,
  isLateCancellation,
  publicActions,
  resolveAppointmentPolicy,
  validateAppointmentToken,
} from "../services/appointment.policy.js";

type Tx = Parameters<Parameters<typeof appDb.transaction>[0]>[0];
type Appointment = typeof appointments.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;
export const hashAppointmentToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
class ExpiredAppointmentAccess extends Error {}
const componentDto = (c: typeof subscriptionComponents.$inferSelect) => ({
  id: c.id,
  labelSnapshot: c.labelSnapshot,
  quantityEntitled: c.quantityEntitled,
  quantityConsumed: c.quantityConsumed,
  quantityOwedByCoach: c.quantityOwedByCoach,
});

export class DrizzleAppointmentsRepository implements AppointmentsRepository {
  constructor(
    private readonly database: typeof appDb,
    private readonly options: { auditHashPepper: string },
  ) {}
  private async audit(
    tx: Tx,
    actor: AppointmentActor,
    app: Appointment,
    eventType: string,
    metadata: AuditMetadata,
  ) {
    await new AuditService(tx, this.options).record({
      actorType: actor.userId ? "user" : "anonymous",
      actorUserId: actor.userId,
      eventType,
      entityType: "appointment",
      entityId: app.id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      result: "success",
      metadata: {
        appointmentId: app.id,
        subscriptionId: app.subscriptionId,
        componentId: app.componentId,
        ...metadata,
      },
    });
  }
  private async event(
    tx: Tx,
    app: Appointment,
    actor: AppointmentActor,
    eventType: string,
    fromStatus: string | null,
    toStatus: string,
    now: Date,
    reason: string | null = null,
  ) {
    await tx.insert(appointmentEvents).values({
      appointmentId: app.id,
      eventType,
      fromStatus,
      toStatus,
      actorType: actor.userId ? "coach" : "customer",
      actorUserId: actor.userId,
      reason,
      createdAt: now,
    });
  }
  private async revoke(tx: Tx, id: string, now: Date, exceptTokenId?: string) {
    await tx
      .update(secureAccessTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(
            secureAccessTokens.resourceType,
            appointmentTokenScope.resourceType,
          ),
          eq(secureAccessTokens.action, appointmentTokenScope.action),
          eq(secureAccessTokens.resourceId, id),
          isNull(secureAccessTokens.revokedAt),
          isNull(secureAccessTokens.usedAt),
          exceptTokenId ? ne(secureAccessTokens.id, exceptTokenId) : undefined,
        ),
      );
  }
  private async publicDocument(
    tx: Tx,
    app: Appointment,
  ): Promise<PublicAppointmentDocument> {
    const [owner] = await tx
      .select({ name: services.name })
      .from(services)
      .innerJoin(subscriptions, eq(subscriptions.serviceId, services.id))
      .where(eq(subscriptions.id, app.subscriptionId));
    return {
      serviceLabel: owner?.name ?? "Rendez-vous",
      scheduledStart: app.scheduledStart.toISOString(),
      scheduledEnd: app.scheduledEnd.toISOString(),
      locationOrChannel: app.locationOrChannel,
      availableActions: publicActions(app.status),
    };
  }
  private async detail(tx: Tx, app: Appointment): Promise<AppointmentDetail> {
    const document = await this.publicDocument(tx, app);
    const [component] = app.componentId
      ? await tx
          .select()
          .from(subscriptionComponents)
          .where(eq(subscriptionComponents.id, app.componentId))
      : [];
    const [replacement] = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.rescheduledFromAppointmentId, app.id));
    const events = await tx
      .select()
      .from(appointmentEvents)
      .where(eq(appointmentEvents.appointmentId, app.id))
      .orderBy(appointmentEvents.createdAt, appointmentEvents.id);
    const accounting = await tx
      .select()
      .from(componentEvents)
      .where(eq(componentEvents.relatedAppointmentId, app.id));
    const consumed = accounting.some((e) =>
        consumptiveEvents.includes(e.eventType),
      ),
      restored = accounting.some((e) => e.eventType === "restoration");
    const links = await tx
      .select()
      .from(secureAccessTokens)
      .where(
        and(
          eq(
            secureAccessTokens.resourceType,
            appointmentTokenScope.resourceType,
          ),
          eq(secureAccessTokens.action, appointmentTokenScope.action),
          eq(secureAccessTokens.resourceId, app.id),
        ),
      )
      .orderBy(secureAccessTokens.createdAt);
    const [subscription] = await tx
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.id, app.subscriptionId));
    return {
      id: app.id,
      subscriptionId: app.subscriptionId,
      serviceName: document.serviceLabel,
      scheduledStart: document.scheduledStart,
      scheduledEnd: document.scheduledEnd,
      locationOrChannel: app.locationOrChannel,
      status: app.status,
      customerResponseStatus: app.customerResponseStatus,
      rescheduleNote: app.rescheduleNote,
      completedAt: app.completedAt?.toISOString() ?? null,
      cancelledAt: app.cancelledAt?.toISOString() ?? null,
      cancelledByType: app.cancelledByType,
      rescheduledFromAppointmentId: app.rescheduledFromAppointmentId,
      replacementAppointmentId: replacement?.id ?? null,
      component: component ? componentDto(component) : null,
      policy: {
        lateCancelNoticeHours: app.lateCancelNoticeHoursSnapshot,
        lateCancelConsumesComponent: app.lateCancelConsumesComponentSnapshot,
        missedConsumesComponent: app.missedConsumesComponentSnapshot,
      },
      consumed,
      restored,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actorType: e.actorType,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
      responseLinks: links.map((t) => ({
        id: t.id,
        expiresAt: t.expiresAt.toISOString(),
        state: t.revokedAt
          ? "revoked"
          : t.usedAt || t.useCount
            ? "consumed"
            : t.expiresAt <= new Date()
              ? "expired"
              : "available",
      })),
      availableActions: appointmentActions.filter((action) =>
        action === "restore-component"
          ? consumed &&
            !restored &&
            ["completed", "missed", "cancelled"].includes(app.status)
          : action === "response-link"
            ? publicActions(app.status).length > 0
            : appointmentTransitions[action].includes(app.status) &&
              (action !== "reschedule" || subscription?.status === "active"),
      ),
    };
  }
  private async duplicate(
    tx: Tx,
    subId: string,
    componentId: string | null,
    start: Date,
    end: Date,
  ) {
    const [existing] = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.subscriptionId, subId),
          componentId
            ? eq(appointments.componentId, componentId)
            : isNull(appointments.componentId),
          eq(appointments.scheduledStart, start),
          eq(appointments.scheduledEnd, end),
        ),
      );
    return !!existing;
  }
  async execute(
    id: string,
    command: AppointmentCommand,
    actor: AppointmentActor,
  ): Promise<AppointmentResult> {
    return this.database.transaction(async (tx) => {
      if (command.action === "list" || command.action === "schedule") {
        if (command.action === "schedule")
          await assertCustomerWritable(tx, { subscriptionId: id });
        const [sub] = await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, id))
          .for(command.action === "list" ? "share" : "update");
        if (!sub) return appointmentFailure("APPOINTMENT_NOT_FOUND");
        if (command.action === "list") {
          const rows = await tx
            .select()
            .from(appointments)
            .where(eq(appointments.subscriptionId, id))
            .orderBy(appointments.scheduledStart, appointments.id);
          const components = await tx
            .select()
            .from(subscriptionComponents)
            .where(eq(subscriptionComponents.subscriptionId, id));
          const details: AppointmentDetail[] = [];
          for (const row of rows) details.push(await this.detail(tx, row));
          return {
            ok: true,
            body: {
              subscriptionId: id,
              subscriptionStatus: sub.status,
              components: components.map(componentDto),
              appointments: details,
            },
          };
        }
        if (sub.status !== "active")
          return appointmentFailure("APPOINTMENT_SUBSCRIPTION_NOT_ACTIVE");
        if (command.componentId) {
          const [c] = await tx
            .select()
            .from(subscriptionComponents)
            .where(eq(subscriptionComponents.id, command.componentId))
            .for("update");
          if (!c || c.subscriptionId !== id)
            return appointmentFailure("APPOINTMENT_COMPONENT_INVALID");
          if (c.quantityConsumed >= c.quantityEntitled)
            return appointmentFailure("APPOINTMENT_COMPONENT_EXHAUSTED");
        }
        if (
          await this.duplicate(
            tx,
            id,
            command.componentId,
            command.start,
            command.end,
          )
        )
          return appointmentFailure("APPOINTMENT_DUPLICATE_SLOT");
        const [service] = await tx
          .select()
          .from(services)
          .where(eq(services.id, sub.serviceId))
          .for("share");
        if (!service) return appointmentFailure("APPOINTMENT_POLICY_INVALID");
        if (sub.variantId)
          await tx
            .select()
            .from(serviceVariants)
            .where(eq(serviceVariants.id, sub.variantId))
            .for("share");
        const policies = await tx
          .select()
          .from(servicePolicies)
          .where(eq(servicePolicies.serviceId, sub.serviceId))
          .for("share");
        const policy = resolveAppointmentPolicy(policies, sub.variantId);
        if (!policy) return appointmentFailure("APPOINTMENT_POLICY_INVALID");
        const now = new Date();
        const [app] = await tx
          .insert(appointments)
          .values({
            subscriptionId: id,
            componentId: command.componentId,
            scheduledStart: command.start,
            scheduledEnd: command.end,
            locationOrChannel: command.location,
            lateCancelNoticeHoursSnapshot: policy.lateCancelNoticeHours,
            lateCancelConsumesComponentSnapshot:
              policy.lateCancelConsumesComponent,
            missedConsumesComponentSnapshot: policy.missedConsumesComponent,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!app) throw new Error("Appointment insert returned no row");
        await this.event(
          tx,
          app,
          actor,
          "appointment.created",
          null,
          "scheduled",
          now,
        );
        await this.audit(tx, actor, app, "appointment.created", {
          fromStatus: null,
          toStatus: "scheduled",
        });
        return { ok: true, body: { appointment: await this.detail(tx, app) } };
      }
      const [initial] = await tx
        .select({ subscriptionId: appointments.subscriptionId })
        .from(appointments)
        .where(eq(appointments.id, id));
      if (!initial) return appointmentFailure("APPOINTMENT_NOT_FOUND");
      if (command.action !== "read")
        await assertCustomerWritable(tx, {
          subscriptionId: initial.subscriptionId,
        });
      // Every writer takes the parent first, including lifecycle commands. Components/tokens
      // are locked only after the parent and appointment, never in the reverse order.
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, initial.subscriptionId))
        .for(command.action === "read" ? "share" : "update");
      const [app] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, id))
        .for(command.action === "read" ? "share" : "update");
      if (!sub || !app) return appointmentFailure("APPOINTMENT_NOT_FOUND");
      if (command.action === "read")
        return { ok: true, body: { appointment: await this.detail(tx, app) } };
      return this.mutate(tx, sub, app, command, actor);
    });
  }
  private async mutate(
    tx: Tx,
    sub: Subscription,
    app: Appointment,
    command: AppointmentCommand,
    actor: AppointmentActor,
    publicTokenId?: string,
  ): Promise<AppointmentResult> {
    if (["read", "list", "schedule"].includes(command.action))
      return appointmentFailure("APPOINTMENT_INVALID_INPUT");
    const [component] = app.componentId
      ? await tx
          .select()
          .from(subscriptionComponents)
          .where(eq(subscriptionComponents.id, app.componentId))
          .for("update")
      : [];
    if (app.componentId && (!component || component.subscriptionId !== sub.id))
      return appointmentFailure("APPOINTMENT_COMPONENT_INVALID");
    const accounting = await tx
      .select()
      .from(componentEvents)
      .where(eq(componentEvents.relatedAppointmentId, app.id));
    const consumed = accounting.filter((e) =>
      consumptiveEvents.includes(e.eventType),
    );
    const now = new Date();
    if (command.action === "response-link") {
      if (!publicActions(app.status).length)
        return appointmentFailure("APPOINTMENT_TRANSITION_INVALID");
      if (command.expiresAt <= now)
        return appointmentFailure("APPOINTMENT_INVALID_INPUT");
      const token = randomBytes(32).toString("base64url");
      await this.revoke(tx, app.id, now);
      await tx.insert(secureAccessTokens).values({
        ...appointmentTokenScope,
        resourceId: app.id,
        tokenHash: hashAppointmentToken(token),
        expiresAt: command.expiresAt,
        maxUses: 1,
        createdAt: now,
        updatedAt: now,
      });
      await this.audit(tx, actor, app, "appointment.response_link_created", {
        expiresAt: command.expiresAt.toISOString(),
      });
      return {
        ok: true,
        body: { token, expiresAt: command.expiresAt.toISOString() },
      };
    }
    if (command.action === "restore-component") {
      if (!command.reason.trim())
        return appointmentFailure("APPOINTMENT_INVALID_INPUT");
      if (
        !component ||
        consumed.length !== 1 ||
        consumed[0]?.subscriptionComponentId !== component.id ||
        consumed[0]?.quantity !== 1 ||
        !["cancelled", "missed", "completed"].includes(app.status)
      )
        return appointmentFailure("APPOINTMENT_COMPONENT_NOT_CONSUMED");
      if (accounting.some((e) => e.eventType === "restoration"))
        return appointmentFailure("APPOINTMENT_COMPONENT_ALREADY_RESTORED");
      if (component.quantityConsumed < 1)
        return appointmentFailure("APPOINTMENT_COMPONENT_NOT_CONSUMED");
      await tx
        .update(subscriptionComponents)
        .set({
          quantityConsumed: component.quantityConsumed - 1,
          updatedAt: now,
        })
        .where(eq(subscriptionComponents.id, component.id));
      await tx.insert(componentEvents).values({
        subscriptionComponentId: component.id,
        relatedAppointmentId: app.id,
        eventType: "restoration",
        quantity: 1,
        reason: command.reason,
        createdByUserId: actor.userId,
        createdAt: now,
      });
      await this.event(
        tx,
        app,
        actor,
        "appointment.component_restored",
        app.status,
        app.status,
        now,
        command.reason,
      );
      await this.audit(tx, actor, app, "appointment.component_restored", {
        fromStatus: app.status,
        toStatus: app.status,
        componentConsumed: false,
      });
      return { ok: true, body: { appointment: await this.detail(tx, app) } };
    }
    const transition = command.action === "decline" ? "cancel" : command.action;
    if (
      transition === "schedule" ||
      transition === "list" ||
      transition === "read"
    )
      return appointmentFailure("APPOINTMENT_INVALID_INPUT");
    if (!appointmentTransitions[transition].includes(app.status))
      return appointmentFailure("APPOINTMENT_TRANSITION_INVALID");
    if (command.action === "reschedule") {
      if (sub.status !== "active")
        return appointmentFailure("APPOINTMENT_SUBSCRIPTION_NOT_ACTIVE");
      const [replacement] = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(eq(appointments.rescheduledFromAppointmentId, app.id));
      if (replacement)
        return appointmentFailure("APPOINTMENT_REPLACEMENT_EXISTS");
      if (
        await this.duplicate(
          tx,
          sub.id,
          app.componentId,
          command.start,
          command.end,
        )
      )
        return appointmentFailure("APPOINTMENT_DUPLICATE_SLOT");
      await this.revoke(tx, app.id, now);
      const [child] = await tx
        .insert(appointments)
        .values({
          subscriptionId: sub.id,
          componentId: app.componentId,
          scheduledStart: command.start,
          scheduledEnd: command.end,
          locationOrChannel:
            command.location === undefined
              ? app.locationOrChannel
              : command.location,
          rescheduledFromAppointmentId: app.id,
          lateCancelNoticeHoursSnapshot: app.lateCancelNoticeHoursSnapshot,
          lateCancelConsumesComponentSnapshot:
            app.lateCancelConsumesComponentSnapshot,
          missedConsumesComponentSnapshot: app.missedConsumesComponentSnapshot,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!child) throw new Error("Replacement insert returned no row");
      const [source] = await tx
        .update(appointments)
        .set({ status: "rescheduled", updatedAt: now })
        .where(eq(appointments.id, app.id))
        .returning();
      if (!source) throw new Error("Appointment update returned no row");
      await this.event(
        tx,
        app,
        actor,
        "appointment.rescheduled",
        app.status,
        "rescheduled",
        now,
      );
      await this.event(
        tx,
        child,
        actor,
        "appointment.created",
        null,
        "scheduled",
        now,
      );
      await this.audit(tx, actor, app, "appointment.rescheduled", {
        fromStatus: app.status,
        toStatus: "rescheduled",
        replacementAppointmentId: child.id,
      });
      await this.audit(tx, actor, child, "appointment.created", {
        fromStatus: null,
        toStatus: "scheduled",
        rescheduledFromAppointmentId: app.id,
      });
      return { ok: true, body: { appointment: await this.detail(tx, source) } };
    }
    let toStatus: string,
      event: string,
      consume: string | null = null,
      reason: string | null = null;
    let late = false;
    const changes: Partial<typeof appointments.$inferInsert> = {
      updatedAt: now,
    };
    switch (command.action) {
      case "confirm":
        toStatus = "confirmed";
        event = "appointment.confirmed";
        changes.customerResponseStatus = "confirmed";
        break;
      case "request_reschedule":
        toStatus = "reschedule_requested";
        event = "appointment.reschedule_requested";
        changes.customerResponseStatus = "reschedule_requested";
        changes.rescheduleNote = command.note;
        break;
      case "decline":
        late = isLateCancellation(
          now,
          app.scheduledStart,
          app.lateCancelNoticeHoursSnapshot,
        );
        if (late && app.lateCancelConsumesComponentSnapshot)
          consume = "late_customer_cancel";
        toStatus = "cancelled";
        event = "appointment.cancelled";
        Object.assign(changes, {
          customerResponseStatus: "declined",
          cancelledAt: now,
          cancelledByType: "customer",
        });
        break;
      case "cancel":
        if (!command.reason.trim())
          return appointmentFailure("APPOINTMENT_INVALID_INPUT");
        toStatus = "cancelled";
        event = "appointment.cancelled";
        reason = command.reason;
        Object.assign(changes, { cancelledAt: now, cancelledByType: "coach" });
        break;
      case "missed":
        if (app.scheduledStart >= now)
          return appointmentFailure("APPOINTMENT_TOO_EARLY");
        toStatus = "missed";
        event = "appointment.missed";
        if (app.missedConsumesComponentSnapshot) consume = "missed";
        break;
      case "complete":
        if (
          app.scheduledEnd > now &&
          (!command.override || !command.reason?.trim())
        )
          return appointmentFailure("APPOINTMENT_TOO_EARLY");
        toStatus = "completed";
        event = "appointment.completed";
        changes.completedAt = now;
        consume = "appointment_completed";
        reason = command.override ? command.reason : null;
        break;
      default:
        return appointmentFailure("APPOINTMENT_INVALID_INPUT");
    }
    if (consume && component) {
      if (consumed.length)
        return appointmentFailure("APPOINTMENT_TRANSITION_INVALID");
      if (component.quantityConsumed >= component.quantityEntitled)
        return appointmentFailure("APPOINTMENT_COMPONENT_EXHAUSTED");
      await tx
        .update(subscriptionComponents)
        .set({
          quantityConsumed: component.quantityConsumed + 1,
          updatedAt: now,
        })
        .where(eq(subscriptionComponents.id, component.id));
      await tx.insert(componentEvents).values({
        subscriptionComponentId: component.id,
        relatedAppointmentId: app.id,
        eventType: consume,
        quantity: 1,
        createdByUserId: actor.userId,
        createdAt: now,
      });
    }
    if (
      ["completed", "missed", "cancelled", "reschedule_requested"].includes(
        toStatus,
      )
    )
      await this.revoke(tx, app.id, now, publicTokenId);
    const [updated] = await tx
      .update(appointments)
      .set({ ...changes, status: toStatus })
      .where(eq(appointments.id, app.id))
      .returning();
    if (!updated) throw new Error("Appointment update returned no row");
    await this.event(tx, app, actor, event, app.status, toStatus, now, reason);
    await this.audit(tx, actor, app, event, {
      fromStatus: app.status,
      toStatus,
      actorType: actor.userId ? "coach" : "customer",
      lateCancellation: late,
      componentConsumed: !!consume && !!component,
    });
    return { ok: true, body: { appointment: await this.detail(tx, updated) } };
  }
  async publicAccess(
    rawToken: string,
    command: AppointmentCommand | null,
    actor: AppointmentActor,
    rejectedInput = false,
  ): Promise<AppointmentResult> {
    let tokenId: string | null = null;
    const event = (target: Pick<Tx, "insert">, result: string) =>
      target.insert(externalAccessEvents).values({
        secureAccessTokenId: tokenId,
        eventType:
          command || rejectedInput ? "appointment.respond" : "appointment.view",
        result,
        ipHash: hashAuditContext(actor.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(
          actor.userAgent,
          this.options.auditHashPepper,
        ),
      });
    try {
      return await this.database.transaction(async (tx) => {
        const [initial] = /^[A-Za-z0-9_-]{43}$/.test(rawToken)
          ? await tx
              .select()
              .from(secureAccessTokens)
              .where(
                eq(
                  secureAccessTokens.tokenHash,
                  hashAppointmentToken(rawToken),
                ),
              )
          : [];
        tokenId = initial?.id ?? null;
        const reject = async (error: AppointmentErrorCode) => {
          await event(tx, error);
          return appointmentFailure(error);
        };
        if (rejectedInput) return reject("APPOINTMENT_INVALID_INPUT");
        if (
          !initial ||
          initial.resourceType !== appointmentTokenScope.resourceType ||
          initial.action !== appointmentTokenScope.action
        )
          return reject("APPOINTMENT_TOKEN_INVALID");
        const [owner] = await tx
          .select({ subscriptionId: appointments.subscriptionId })
          .from(appointments)
          .where(eq(appointments.id, initial.resourceId));
        if (!owner) return reject("APPOINTMENT_TOKEN_INVALID");
        if (command)
          await assertCustomerWritable(tx, {
            subscriptionId: owner.subscriptionId,
          });
        const [sub] = await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, owner.subscriptionId))
          .for("update");
        const [app] = await tx
          .select()
          .from(appointments)
          .where(eq(appointments.id, initial.resourceId))
          .for("update");
        const [token] = await tx
          .select()
          .from(secureAccessTokens)
          .where(eq(secureAccessTokens.id, initial.id))
          .for("update");
        const invalid = token
          ? validateAppointmentToken(token)
          : "APPOINTMENT_TOKEN_INVALID";
        if (!sub || !app || !token || invalid)
          return reject(invalid ?? "APPOINTMENT_TOKEN_INVALID");
        if (!command) {
          await event(tx, "success");
          return {
            ok: true,
            body: { appointment: await this.publicDocument(tx, app) },
          };
        }
        if (
          !["confirm", "decline", "request_reschedule"].includes(command.action)
        )
          return reject("APPOINTMENT_INVALID_INPUT");
        const result = await this.mutate(
          tx,
          sub,
          app,
          command,
          { ...actor, userId: null },
          token.id,
        );
        if (!result.ok) {
          await event(tx, result.error);
          return result;
        }
        // A lock/audit wait may cross expiry; expiry at commit must roll back every side effect.
        const consumed = await tx
          .update(secureAccessTokens)
          .set({ usedAt: new Date(), useCount: 1, updatedAt: new Date() })
          .where(
            and(
              eq(secureAccessTokens.id, token.id),
              gt(secureAccessTokens.expiresAt, sql`clock_timestamp()`),
            ),
          )
          .returning({ id: secureAccessTokens.id });
        if (consumed.length !== 1) throw new ExpiredAppointmentAccess();
        await event(tx, "success");
        const [updated] = await tx
          .select()
          .from(appointments)
          .where(eq(appointments.id, app.id));
        if (!updated) throw new Error("Appointment disappeared");
        return {
          ok: true,
          body: {
            appointment: await this.publicDocument(tx, updated),
            submitted: true,
          },
        };
      });
    } catch (error) {
      await event(
        this.database,
        error instanceof ExpiredAppointmentAccess
          ? "APPOINTMENT_TOKEN_EXPIRED"
          : accessFailureResult(error, "APPOINTMENT_ROUTE_UNEXPECTED_FAILURE"),
      );
      if (error instanceof ExpiredAppointmentAccess)
        return appointmentFailure("APPOINTMENT_TOKEN_EXPIRED");
      throw error;
    }
  }
}

import { and, count, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { AdminArchivedCustomer, AdminCustomer, AdminCustomerDetailResponse } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { componentEvents, customers, subscriptionComponents, subscriptionPauses, subscriptions } from "../../../db/schema/customers.js";
import { servicePolicies, serviceVariants, services } from "../../../db/schema/catalogue.js";
import { appointmentEvents, appointments, followUps } from "../../../db/schema/coaching.js";
import { secureAccessTokens } from "../../../db/schema/documents.js";
import { retentionHolds } from "../../../db/schema/operations.js";
import { customerArchivable, subjectUnarchivable } from "../../privacy/services/privacy.policy.js";
import { consumptiveEvents } from "../../appointments/services/appointment.policy.js";
import { resolveCadence } from "../../follow-ups/services/follow-up-cadence.policy.js";
import type { AnalyticsSource } from "../services/customer-analytics.policy.js";
import type { OverviewSource } from "../services/customer-overview.policy.js";
import { AuditService } from "../../auth/services/audit.service.js";
import type { CustomerActorContext, CustomerDetailVisibility, CustomersRepository, NormalizedCustomerInput } from "../services/customers.service.js";

const active = and(isNull(customers.archivedAt), isNull(customers.anonymizedAt));
const fields = {
  id: customers.id, fullName: customers.fullName, whatsapp: customers.whatsapp,
  email: customers.email, city: customers.city, country: customers.country,
  preferredContactChannel: customers.preferredContactChannel,
  prospectId: customers.prospectId, createdAt: customers.createdAt,
};
type CustomerRow = Omit<AdminCustomer, "createdAt"> & { createdAt: Date };
function toDto(row: CustomerRow): AdminCustomer {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
// Match the shared Sprint 3 normalization, including already stored formatted numbers.
function phoneMatches(whatsapp: string) {
  return eq(sql<string>`regexp_replace(${customers.whatsapp}, '[^0-9+]', '', 'g')`, whatsapp);
}

export function activeCustomerWhatsappMatches(whatsapp: string) {
  return and(active, phoneMatches(whatsapp));
}

/** S7.3b D1/D2: active customer-scope holds per customer (document-scope holds stay API-only, D6). */
async function activeHoldCounts(database: Pick<typeof appDb, "select">, customerIds: string[]): Promise<Map<string, number>> {
  if (customerIds.length === 0) return new Map();
  const rows = await database.select({ customerId: retentionHolds.scopeId, holds: count() }).from(retentionHolds)
    .where(and(eq(retentionHolds.scopeType, "customer"), eq(retentionHolds.status, "active"), inArray(retentionHolds.scopeId, customerIds)))
    .groupBy(retentionHolds.scopeId);
  return new Map(rows.map((row) => [row.customerId, row.holds]));
}

export async function lockCustomerWhatsapp(transaction: Pick<typeof appDb, "execute">, whatsapp: string): Promise<void> {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'customer-whatsapp:' + whatsapp}, 0))`);
}

export class DrizzleCustomersRepository implements CustomersRepository {
  constructor(private readonly database: typeof appDb, private readonly options: { auditHashPepper: string }) {}

  async listActive(): Promise<AdminCustomer[]> {
    return (await this.database.select(fields).from(customers).where(active).orderBy(desc(customers.createdAt), customers.id)).map(toDto);
  }

  async getDetail(customerId: string, visibility: CustomerDetailVisibility): Promise<AdminCustomerDetailResponse | null> {
    const [row] = await this.database.select({ ...fields, archivedAt: customers.archivedAt, anonymizedAt: customers.anonymizedAt })
      .from(customers).where(visibility === "active" ? and(active, eq(customers.id, customerId)) : eq(customers.id, customerId)).limit(1);
    if (!row) return null;
    const { archivedAt, anonymizedAt, ...customer } = row;
    const rows = await this.database
      .select({
        id: subscriptions.id, reference: subscriptions.reference, status: subscriptions.status,
        serviceId: subscriptions.serviceId, serviceName: services.name, serviceSlug: services.slug,
        variantId: subscriptions.variantId, variantName: serviceVariants.name, agreedPriceXaf: subscriptions.agreedPriceXaf,
        plannedStartDate: subscriptions.plannedStartDate, actualStartDate: subscriptions.actualStartDate,
        plannedEndDate: subscriptions.plannedEndDate, actualEndDate: subscriptions.actualEndDate,
        renewedFromSubscriptionId: subscriptions.renewedFromSubscriptionId, createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(services, eq(services.id, subscriptions.serviceId))
      .leftJoin(serviceVariants, eq(serviceVariants.id, subscriptions.variantId))
      .where(eq(subscriptions.customerId, customerId))
      .orderBy(desc(subscriptions.createdAt), subscriptions.id);
    const iso = (value: Date | null) => (value ? value.toISOString() : null);
    const holds = (await activeHoldCounts(this.database, [customerId])).get(customerId) ?? 0;
    return {
      // S7.3b D1: an anonymized customer keeps only the stored pseudonym; the WhatsApp placeholder is never shown as contact.
      customer: anonymizedAt ? { ...toDto(customer), whatsapp: null, email: null } : toDto(customer),
      subscriptions: rows.map((row) => ({
        ...row,
        plannedStartDate: iso(row.plannedStartDate), actualStartDate: iso(row.actualStartDate),
        plannedEndDate: iso(row.plannedEndDate), actualEndDate: iso(row.actualEndDate),
        createdAt: row.createdAt.toISOString(),
      })),
      privacy: {
        archivedAt: iso(archivedAt), anonymizedAt: iso(anonymizedAt),
        archivable: customerArchivable(archivedAt, rows.map((subscription) => subscription.status)),
        unarchivable: subjectUnarchivable(archivedAt, anonymizedAt), activeHolds: holds,
      },
    };
  }

  async listArchived(): Promise<AdminArchivedCustomer[]> {
    const rows = await this.database.select({ id: customers.id, displayName: customers.fullName, archivedAt: customers.archivedAt, anonymizedAt: customers.anonymizedAt })
      .from(customers).where(isNotNull(customers.archivedAt)).orderBy(desc(customers.archivedAt), customers.id);
    const holds = await activeHoldCounts(this.database, rows.map((row) => row.id));
    return rows.map((row) => ({
      id: row.id, displayName: row.displayName, archivedAt: row.archivedAt!.toISOString(), anonymizedAt: row.anonymizedAt?.toISOString() ?? null,
      activeHolds: holds.get(row.id) ?? 0,
    }));
  }

  /** Read-only snapshot for the clients overview (UX-5). Batched queries, no per-customer loop. */
  async getOverviewSource(now: Date): Promise<OverviewSource> {
    return this.database.transaction(async (tx) => {
      const list = (await tx.select(fields).from(customers).where(active).orderBy(desc(customers.createdAt), customers.id)).map(toDto);
      if (list.length === 0) return { customers: [], subscriptions: [], completedAppointments: [], followUps: [], upcomingAppointments: [] };
      const subs = await tx
        .select({ sub: subscriptions, serviceName: services.name, serviceSlug: services.slug, variantName: serviceVariants.name })
        .from(subscriptions)
        .innerJoin(customers, eq(customers.id, subscriptions.customerId))
        .innerJoin(services, eq(services.id, subscriptions.serviceId))
        .leftJoin(serviceVariants, eq(serviceVariants.id, subscriptions.variantId))
        .where(active);
      const subIds = subs.map((row) => row.sub.id);
      if (subIds.length === 0) return { customers: list, subscriptions: [], completedAppointments: [], followUps: [], upcomingAppointments: [] };
      const policies = await tx.select({ serviceId: servicePolicies.serviceId, variantId: servicePolicies.variantId, followUpFrequencyDays: servicePolicies.followUpFrequencyDays })
        .from(servicePolicies).where(inArray(servicePolicies.serviceId, [...new Set(subs.map((row) => row.sub.serviceId))]));
      const pauses = await tx.select({ subscriptionId: subscriptionPauses.subscriptionId, startedAt: subscriptionPauses.startedAt, endedAt: subscriptionPauses.endedAt })
        .from(subscriptionPauses).where(inArray(subscriptionPauses.subscriptionId, subIds));
      const completedAppointments = await tx.select({ subscriptionId: appointments.subscriptionId, completedAt: appointments.completedAt })
        .from(appointments).where(and(inArray(appointments.subscriptionId, subIds), eq(appointments.status, "completed")));
      const follow = await tx.select({ subscriptionId: followUps.subscriptionId, occurredAt: followUps.occurredAt, completedAt: followUps.completedAt, status: followUps.status })
        .from(followUps).where(inArray(followUps.subscriptionId, subIds));
      const upcomingAppointments = await tx.select({ id: appointments.id, subscriptionId: appointments.subscriptionId, scheduledStart: appointments.scheduledStart, scheduledEnd: appointments.scheduledEnd, status: appointments.status })
        .from(appointments).where(and(inArray(appointments.subscriptionId, subIds), inArray(appointments.status, ["scheduled", "confirmed", "reschedule_requested"]), gte(appointments.scheduledEnd, now)));
      return {
        customers: list,
        subscriptions: subs.map(({ sub, serviceName, serviceSlug, variantName }) => ({
          id: sub.id, customerId: sub.customerId, reference: sub.reference, status: sub.status, serviceName, serviceSlug, variantName: variantName ?? null,
          createdAt: sub.createdAt, actualStartDate: sub.actualStartDate,
          cadence: resolveCadence(sub.followUpFrequencyDaysOverride, policies.filter((p) => p.serviceId === sub.serviceId), sub.variantId),
          pauses: pauses.filter((p) => p.subscriptionId === sub.id).map((p) => ({ startedAt: p.startedAt, endedAt: p.endedAt })),
        })),
        completedAppointments,
        followUps: follow,
        upcomingAppointments,
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  /** Read-only snapshot for the client analytics (UX-4c). One read-only transaction so all rows agree. */
  async getAnalyticsSource(customerId: string): Promise<AnalyticsSource | null> {
    return this.database.transaction(async (tx) => {
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), active)).limit(1);
      if (!customer) return null;
      const subs = await tx
        .select({ sub: subscriptions, serviceName: services.name, serviceSlug: services.slug, variantName: serviceVariants.name })
        .from(subscriptions)
        .innerJoin(services, eq(services.id, subscriptions.serviceId))
        .leftJoin(serviceVariants, eq(serviceVariants.id, subscriptions.variantId))
        .where(eq(subscriptions.customerId, customerId));
      const subIds = subs.map((row) => row.sub.id);
      const empty = { customerId, subscriptions: [], appointments: [], followUps: [], links: [], rescheduleRequests: [] } satisfies AnalyticsSource;
      if (subIds.length === 0) return empty;

      const serviceIds = [...new Set(subs.map((row) => row.sub.serviceId))];
      const policies = await tx.select({ serviceId: servicePolicies.serviceId, variantId: servicePolicies.variantId, followUpFrequencyDays: servicePolicies.followUpFrequencyDays })
        .from(servicePolicies).where(inArray(servicePolicies.serviceId, serviceIds));
      const pauses = await tx.select({ subscriptionId: subscriptionPauses.subscriptionId, startedAt: subscriptionPauses.startedAt, endedAt: subscriptionPauses.endedAt })
        .from(subscriptionPauses).where(inArray(subscriptionPauses.subscriptionId, subIds));
      const components = await tx.select({ id: subscriptionComponents.id, subscriptionId: subscriptionComponents.subscriptionId, entitled: subscriptionComponents.quantityEntitled, consumed: subscriptionComponents.quantityConsumed })
        .from(subscriptionComponents).where(inArray(subscriptionComponents.subscriptionId, subIds));
      const componentIds = components.map((c) => c.id);
      const consumption = componentIds.length
        ? await tx.select({ componentId: componentEvents.subscriptionComponentId, eventType: componentEvents.eventType, quantity: componentEvents.quantity, at: componentEvents.createdAt })
          .from(componentEvents).where(inArray(componentEvents.subscriptionComponentId, componentIds))
        : [];
      const apps = await tx.select({ id: appointments.id, subscriptionId: appointments.subscriptionId, scheduledStart: appointments.scheduledStart, status: appointments.status, completedAt: appointments.completedAt })
        .from(appointments).where(inArray(appointments.subscriptionId, subIds));
      const appIds = apps.map((a) => a.id);
      const follow = await tx.select({ subscriptionId: followUps.subscriptionId, occurredAt: followUps.occurredAt, completedAt: followUps.completedAt, status: followUps.status })
        .from(followUps).where(inArray(followUps.subscriptionId, subIds));
      const links = await tx.select({ createdAt: secureAccessTokens.createdAt, usedAt: secureAccessTokens.usedAt }).from(secureAccessTokens).where(or(
        and(eq(secureAccessTokens.resourceType, "subscription"), inArray(secureAccessTokens.resourceId, subIds)),
        appIds.length ? and(eq(secureAccessTokens.resourceType, "appointment"), inArray(secureAccessTokens.resourceId, appIds)) : undefined,
      ));
      const requests = appIds.length
        ? await tx.select({ at: appointmentEvents.createdAt }).from(appointmentEvents).where(and(inArray(appointmentEvents.appointmentId, appIds), eq(appointmentEvents.toStatus, "reschedule_requested")))
        : [];

      const subscriptionOfComponent = new Map(components.map((c) => [c.id, c.subscriptionId]));
      return {
        customerId,
        subscriptions: subs.map(({ sub, serviceName, serviceSlug, variantName }) => ({
          id: sub.id, reference: sub.reference, status: sub.status, serviceName, serviceSlug, variantName: variantName ?? null,
          createdAt: sub.createdAt, plannedStartDate: sub.plannedStartDate, actualStartDate: sub.actualStartDate,
          plannedEndDate: sub.plannedEndDate, actualEndDate: sub.actualEndDate, renewedFromSubscriptionId: sub.renewedFromSubscriptionId,
          // Invalid cadence configuration → no cadence analytics (the follow-up screen reports the configuration error).
          cadenceDays: resolveCadence(sub.followUpFrequencyDaysOverride, policies.filter((p) => p.serviceId === sub.serviceId), sub.variantId)?.days ?? null,
          pauses: pauses.filter((p) => p.subscriptionId === sub.id).map((p) => ({ startedAt: p.startedAt, endedAt: p.endedAt })),
          components: components.filter((c) => c.subscriptionId === sub.id).map((c) => ({ entitled: c.entitled, consumed: c.consumed })),
          consumption: consumption
            .filter((e) => subscriptionOfComponent.get(e.componentId) === sub.id && (consumptiveEvents.includes(e.eventType) || e.eventType === "restoration"))
            .map((e) => ({ at: e.at, delta: e.eventType === "restoration" ? -e.quantity : e.quantity })),
        })),
        appointments: apps.map(({ id: _id, ...a }) => a),
        followUps: follow,
        links,
        rescheduleRequests: requests.map((r) => r.at),
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async searchActive(whatsapp: string): Promise<AdminCustomer[]> {
    return (await this.database.select(fields).from(customers).where(activeCustomerWhatsappMatches(whatsapp)).orderBy(customers.id)).map(toDto);
  }

  async createManual(input: NormalizedCustomerInput, actor: CustomerActorContext) {
    return this.database.transaction(async (tx) => {
      // Serialize S4.1 creates for this collision key without adding a DB constraint.
      // Future customer writers must participate in the same locking protocol.
      await lockCustomerWhatsapp(tx, input.whatsapp);
      const [existing] = await tx.select({ id: customers.id }).from(customers).where(activeCustomerWhatsappMatches(input.whatsapp)).limit(1);
      if (existing) return { status: "duplicate" } as const;
      const [row] = await tx.insert(customers).values({ ...input, prospectId: null }).returning(fields);
      if (!row) throw new Error("Customer insert did not return a row");
      await new AuditService(tx, this.options).record({
        actorType: "user", actorUserId: actor.userId, eventType: "customer.created",
        entityType: "customer", entityId: row.id, result: "success",
        requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
        metadata: { source: "manual" },
      });
      return { status: "ok", customer: toDto(row) } as const;
    }, { isolationLevel: "read committed" });
  }
}

import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm";
import type { AgendaAppointment } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { appointments } from "../../../db/schema/coaching.js";
import { customers, subscriptionComponents, subscriptions } from "../../../db/schema/customers.js";
import { services, serviceVariants } from "../../../db/schema/catalogue.js";
import { serviceRequests } from "../../../db/schema/prospects.js";
import type { TodayRepository } from "../services/today.service.js";

/** Read-only queries for the agenda and « Aujourd'hui » (UX-9). */
export class DrizzleTodayRepository implements TodayRepository {
  constructor(private readonly database: typeof appDb) {}

  async listAppointments(from: Date, to: Date, statuses: string[] | null): Promise<AgendaAppointment[]> {
    const rows = await this.database
      .select({
        id: appointments.id, subscriptionId: appointments.subscriptionId, customerId: customers.id, fullName: customers.fullName,
        serviceName: services.name, serviceSlug: services.slug, variantName: serviceVariants.name, componentLabel: subscriptionComponents.labelSnapshot,
        scheduledStart: appointments.scheduledStart, scheduledEnd: appointments.scheduledEnd, status: appointments.status,
        customerResponseStatus: appointments.customerResponseStatus, locationOrChannel: appointments.locationOrChannel,
      })
      .from(appointments)
      .innerJoin(subscriptions, eq(subscriptions.id, appointments.subscriptionId))
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .innerJoin(services, eq(services.id, subscriptions.serviceId))
      .leftJoin(serviceVariants, eq(serviceVariants.id, subscriptions.variantId))
      .leftJoin(subscriptionComponents, eq(subscriptionComponents.id, appointments.componentId))
      .where(and(gte(appointments.scheduledStart, from), lt(appointments.scheduledStart, to), statuses ? inArray(appointments.status, statuses) : undefined))
      .orderBy(asc(appointments.scheduledStart), asc(appointments.id));
    return rows.map((r) => ({
      id: r.id, subscriptionId: r.subscriptionId, customer: { id: r.customerId, fullName: r.fullName }, serviceName: r.serviceName, serviceSlug: r.serviceSlug,
      variantName: r.variantName ?? null, componentLabel: r.componentLabel ?? null, scheduledStart: r.scheduledStart.toISOString(), scheduledEnd: r.scheduledEnd.toISOString(),
      status: r.status, customerResponseStatus: r.customerResponseStatus, locationOrChannel: r.locationOrChannel,
    }));
  }

  async countRequestsSubmittedSince(since: Date): Promise<number> {
    const [row] = await this.database.select({ value: count() }).from(serviceRequests).where(gte(serviceRequests.submittedAt, since));
    return Number(row?.value ?? 0);
  }

  async countCompletedAppointmentsSince(since: Date): Promise<number> {
    const [row] = await this.database.select({ value: count() }).from(appointments).where(and(eq(appointments.status, "completed"), gte(appointments.completedAt, since)));
    return Number(row?.value ?? 0);
  }

  async listSubscriptionsByStatus(statuses: string[]) {
    const rows = await this.database
      .select({ id: subscriptions.id, status: subscriptions.status, customerId: customers.id, customerName: customers.fullName, serviceName: services.name, variantName: serviceVariants.name, plannedEndDate: subscriptions.plannedEndDate })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .innerJoin(services, eq(services.id, subscriptions.serviceId))
      .leftJoin(serviceVariants, eq(serviceVariants.id, subscriptions.variantId))
      .where(inArray(subscriptions.status, statuses));
    return rows.map((r) => ({ ...r, offer: `${r.serviceName}${r.variantName ? ` · ${r.variantName}` : ""}`, plannedEndDate: r.plannedEndDate?.toISOString() ?? null }));
  }
}

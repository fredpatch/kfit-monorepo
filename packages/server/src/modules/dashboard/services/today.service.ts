import {
  addBusinessDays, businessDateKey, businessDayStartFromKey, startOfBusinessDay, startOfBusinessWeek,
  type AdminCustomerOverviewResponse, type AdminServiceRequestSummary, type AgendaAppointment, type AgendaResponse,
  type CatalogueAdminServicesOverviewResponse, type FollowUpQueueResponse, type OnboardingDetail, type TodayResponse,
} from "@kfit/shared";
import { buildTodayTasks, clientsByOffer, type FinanceCollectionsInput } from "./today.policy.js";

export type DashboardActor = { userId: string; requestId: string; ipAddress: string | null; userAgent: string | null };
export interface TodayRepository {
  listAppointments(from: Date, to: Date, statuses: string[] | null): Promise<AgendaAppointment[]>;
  countRequestsSubmittedSince(since: Date): Promise<number>;
  countCompletedAppointmentsSince(since: Date): Promise<number>;
  listSubscriptionsByStatus(statuses: string[]): Promise<Array<{ id: string; status: string; customerId: string; customerName: string; offer: string; plannedEndDate: string | null }>>;
}
/** Existing module services, reused so every state is computed once, by its owner. */
export type TodaySources = {
  followUpQueue(actor: DashboardActor): Promise<FollowUpQueueResponse>;
  customerOverview(): Promise<AdminCustomerOverviewResponse>;
  catalogueOverview(): Promise<CatalogueAdminServicesOverviewResponse>;
  requests(): Promise<AdminServiceRequestSummary[]>;
  onboarding(subscriptionId: string, actor: DashboardActor): Promise<OnboardingDetail | null>;
  /** POL-01 D5: overdue installments and pending proofs, from the dashboard collections snapshot (one reader for tasks and alerts). */
  collections(now: Date): Promise<FinanceCollectionsInput>;
};
export type AgendaResult = { status: "ok"; response: AgendaResponse } | { status: "invalid"; reason: string };

const maxAgendaDays = 62;
const appointmentStatuses = ["scheduled", "confirmed", "reschedule_requested", "rescheduled", "completed", "cancelled", "missed"];

export class TodayService {
  constructor(private readonly repository: TodayRepository, private readonly sources: TodaySources, private readonly clock: () => Date = () => new Date()) {}

  /** Agenda across subscriptions. du / au are business days (inclusive), Africa/Libreville. */
  async agenda(query: { du?: unknown; au?: unknown; statut?: unknown }): Promise<AgendaResult> {
    const today = businessDateKey(this.clock());
    const fromKey = query.du === undefined ? today : query.du;
    const toKey = query.au === undefined ? fromKey : query.au;
    if (typeof fromKey !== "string" || typeof toKey !== "string") return { status: "invalid", reason: "date_invalid" };
    const from = businessDayStartFromKey(fromKey);
    const lastDay = businessDayStartFromKey(toKey);
    if (!from || !lastDay) return { status: "invalid", reason: "date_invalid" };
    const to = addBusinessDays(lastDay, 1);
    if (to <= from) return { status: "invalid", reason: "range_invalid" };
    if ((to.getTime() - from.getTime()) / 86_400_000 > maxAgendaDays + 0.5) return { status: "invalid", reason: "range_too_long" };
    let statuses: string[] | null = null;
    if (query.statut !== undefined) {
      if (typeof query.statut !== "string") return { status: "invalid", reason: "status_invalid" };
      statuses = query.statut.split(",").map((s) => s.trim()).filter(Boolean);
      if (!statuses.length || statuses.some((s) => !appointmentStatuses.includes(s))) return { status: "invalid", reason: "status_invalid" };
    }
    return { status: "ok", response: { from: from.toISOString(), to: to.toISOString(), appointments: await this.repository.listAppointments(from, to, statuses) } };
  }

  async today(actor: DashboardActor): Promise<TodayResponse> {
    const now = this.clock();
    const dayStart = startOfBusinessDay(now);
    const dayEnd = addBusinessDays(dayStart, 1);
    const weekStart = startOfBusinessWeek(now);

    const [queue, customerOverview, catalogue, requests, open, appointments, newRequestsThisWeek, sessionsWeek, sessionsToday, collections] = await Promise.all([
      this.sources.followUpQueue(actor),
      this.sources.customerOverview(),
      this.sources.catalogueOverview(),
      this.sources.requests(),
      this.repository.listSubscriptionsByStatus(["onboarding", "completion_due", "active", "paused"]),
      this.repository.listAppointments(dayStart, dayEnd, ["scheduled", "confirmed", "reschedule_requested", "completed", "missed"]),
      this.repository.countRequestsSubmittedSince(weekStart),
      this.repository.countCompletedAppointmentsSince(weekStart),
      this.repository.countCompletedAppointmentsSince(dayStart),
      this.sources.collections(now),
    ]);
    // Onboarding states come from the onboarding module itself (few subscriptions are in preparation at once).
    const preparing = open.filter((s) => s.status === "onboarding");
    const details = await Promise.all(preparing.map((s) => this.sources.onboarding(s.id, actor)));

    const tasks = buildTodayTasks({
      now,
      endOfDay: new Date(dayEnd.getTime() - 1),
      followUps: queue.items,
      offerOfSubscription: new Map(open.map((s) => [s.id, s.offer])),
      requests,
      preparations: preparing.map((s, i) => ({ subscriptionId: s.id, customerId: s.customerId, customerName: s.customerName, offer: s.offer, detail: details[i] ?? null })),
      collections,
      completions: open.filter((s) => s.status === "completion_due").map((s) => ({ subscriptionId: s.id, customerId: s.customerId, customerName: s.customerName, offer: s.offer, plannedEndDate: s.plannedEndDate })),
    });
    const overdue = queue.items.filter((f) => f.cadenceState === "overdue");

    return {
      asOf: now.toISOString(),
      businessDate: businessDateKey(now),
      tasks,
      kpis: {
        activeClients: customerOverview.counts.active,
        followUpsOverdue: overdue.length,
        oldestOverdueDays: overdue.length ? Math.max(...overdue.map((f) => f.overdueByDays ?? 0)) : null,
        newRequestsThisWeek,
        requestsToContact: requests.filter((r) => r.status === "submitted").length,
        sessionsCompletedThisWeek: sessionsWeek,
        sessionsCompletedToday: sessionsToday,
      },
      appointments,
      clientsByOffer: clientsByOffer(customerOverview),
      capacity: catalogue.services
        .filter((s) => s.publishedAt && s.isPublic && !s.archivedAt && s.availabilityStatus !== "archived")
        .map((s) => ({ serviceId: s.id, name: s.name, slug: s.slug, occupied: s.occupancy.occupied, limit: s.capacityMode === "limited" ? s.capacityLimit : null, waitlist: s.waitlist.active, availabilityStatus: s.availabilityStatus })),
    };
  }
}

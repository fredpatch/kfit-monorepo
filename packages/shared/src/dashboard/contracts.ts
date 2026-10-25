/*
 * « Aujourd'hui » (UX-9, board 02) and the cross-subscription agenda. Read-only.
 * Rules validated by Fred on 2026-10-22; business time = Africa/Libreville (time/business-time.ts).
 */
export const dashboardApiRoutes = {
  /** ?du=YYYY-MM-DD&au=YYYY-MM-DD (business days, inclusive, ≤ 62 days) &statut=a,b */
  appointments: "/admin/appointments",
  today: "/admin/today",
  analytics: "/admin/dashboard/analytics",
  alerts: "/admin/dashboard/alerts",
} as const;
export const dashboardErrorCodes = ["DASHBOARD_INVALID_INPUT", "DASHBOARD_ADMIN_FORBIDDEN", "DASHBOARD_ROUTE_UNEXPECTED_FAILURE"] as const;
export type DashboardErrorCode = (typeof dashboardErrorCodes)[number];

export const dashboardPeriods = ["4w", "8w", "12m"] as const;
export type DashboardPeriod = (typeof dashboardPeriods)[number];
export type DashboardHistoricalPoint = { start: string; end: string } & (
  { availability: "complete"; value: number } | { availability: "unavailable"; value: null }
);
export type DashboardDelta = {
  current: number; previous: number; absoluteChange: number; percentageChange: number | null;
  direction: "up" | "down" | "flat"; favourable: boolean | null;
};
export type DashboardKpiTrend = { points: DashboardHistoricalPoint[]; delta: DashboardDelta | null };
export type DashboardFinanceSummary = { collectedXaf: number; dueXaf: number; futureXaf: number; overdueXaf: number; outstandingXaf: number };
export type DashboardAnalyticsResponse = {
  asOf: string; businessDate: string; periode: DashboardPeriod;
  trends: Record<"activeClients" | "followUpsOverdue" | "newRequests" | "sessionsCompleted", DashboardKpiTrend>;
  requests: {
    buckets: Array<{ start: string; end: string; count: number; isCurrent: boolean }>;
    totalRequests: number;
    funnel: { received: number; contacted: number; qualified: number; converted: number };
    conversionRate: number | null;
  };
  finance: DashboardFinanceSummary;
};
export const dashboardAlertKinds = ["follow_up_overdue", "request_to_contact", "installment_overdue", "payment_proof_pending", "quote_action_required", "preparation_blocked", "completion_due"] as const;
export type DashboardAlertKind = (typeof dashboardAlertKinds)[number];
export type DashboardAlert = {
  kind: DashboardAlertKind; severity: "warning" | "info";
  customerId: string | null; customerDisplayName: string; subscriptionId: string | null;
  requestId: string | null; resourceId: string | null;
  title: string; summary: string; referenceAt: string | null; deepLink: string;
};
export type DashboardAlertsResponse = { asOf: string; alerts: DashboardAlert[] };

export type AgendaAppointment = {
  id: string;
  subscriptionId: string;
  customer: { id: string; fullName: string };
  serviceName: string;
  serviceSlug: string;
  variantName: string | null;
  componentLabel: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  customerResponseStatus: string;
  locationOrChannel: string | null;
};
export type AgendaResponse = { from: string; to: string; appointments: AgendaAppointment[] };

/** « À traiter » line kinds, in the validated priority order (POL-01 D5 adds the two finance kinds). */
export const todayTaskKinds = [
  "follow_up_overdue",
  "installment_overdue",
  "follow_up_due",
  "payment_proof_pending",
  "request_new",
  "request_follow_up",
  "preparation_expired",
  "preparation_ready",
  "preparation_waiting",
  "completion_due",
] as const;
export type TodayTaskKind = (typeof todayTaskKinds)[number];
export type TodayTask = {
  kind: TodayTaskKind;
  customerId: string | null;
  name: string;
  subscriptionId: string | null;
  requestId: string | null;
  offer: string;
  /** Reference instant: last activity, submission, next action, reservation end or planned end. */
  at: string | null;
  /** Days overdue for follow-ups and installments; null otherwise. */
  days: number | null;
  /** First missing required preparation item. */
  item: string | null;
  /** POL-01 D5: the installment or payment proof the finance tasks point to. */
  resourceId?: string;
  /** POL-01 D6: amount still due on an overdue installment. */
  amountXaf?: number;
};
export type TodayKpis = {
  activeClients: number;
  followUpsOverdue: number;
  oldestOverdueDays: number | null;
  newRequestsThisWeek: number;
  requestsToContact: number;
  sessionsCompletedThisWeek: number;
  sessionsCompletedToday: number;
};
export type TodayResponse = {
  asOf: string;
  businessDate: string;
  tasks: TodayTask[];
  kpis: TodayKpis;
  appointments: AgendaAppointment[];
  /** Active clients grouped by the offer of their current subscription (UX-5 rule). */
  clientsByOffer: Array<{ serviceName: string; serviceSlug: string; count: number }>;
  /** Published, visible offers with their occupancy (UX-7 rule). */
  capacity: Array<{ serviceId: string; name: string; slug: string; occupied: number; limit: number | null; waitlist: number; availabilityStatus: string }>;
};
/** POL-01 D6: numbers behind the « Aujourd'hui » header sentence. */
export function todayHeaderCounts(tasks: ReadonlyArray<Pick<TodayTask, "kind">>): { total: number; followUpsOverdue: number; installmentsOverdue: number } {
  return { total: tasks.length, followUpsOverdue: tasks.filter((t) => t.kind === "follow_up_overdue").length, installmentsOverdue: tasks.filter((t) => t.kind === "installment_overdue").length };
}

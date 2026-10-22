/*
 * « Aujourd'hui » (UX-9, board 02) and the cross-subscription agenda. Read-only.
 * Rules validated by Fred on 2026-10-22; business time = Africa/Libreville (time/business-time.ts).
 */
export const dashboardApiRoutes = {
  /** ?du=YYYY-MM-DD&au=YYYY-MM-DD (business days, inclusive, ≤ 62 days) &statut=a,b */
  appointments: "/admin/appointments",
  today: "/admin/today",
} as const;
export const dashboardErrorCodes = ["DASHBOARD_INVALID_INPUT", "DASHBOARD_ADMIN_FORBIDDEN", "DASHBOARD_ROUTE_UNEXPECTED_FAILURE"] as const;
export type DashboardErrorCode = (typeof dashboardErrorCodes)[number];

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

/** « À traiter » line kinds, in the validated priority order. */
export const todayTaskKinds = [
  "follow_up_overdue",
  "follow_up_due",
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
  /** Days overdue for follow-ups; null otherwise. */
  days: number | null;
  /** First missing required preparation item. */
  item: string | null;
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

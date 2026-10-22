export const adminCustomersApiRoutes = {
  list: "/admin/customers",
  search: "/admin/customers/search",
  create: "/admin/customers",
  detail: "/admin/customers/:customerId",
  analytics: "/admin/customers/:customerId/analytics",
} as const;

export const customerErrorCodes = [
  "CUSTOMER_INVALID_INPUT",
  "CUSTOMER_DUPLICATE_WHATSAPP",
  "CUSTOMER_ADMIN_FORBIDDEN",
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type CustomerErrorCode = (typeof customerErrorCodes)[number];

export type AdminCustomer = {
  id: string;
  fullName: string;
  whatsapp: string;
  email: string | null;
  city: string | null;
  country: string | null;
  preferredContactChannel: string;
  prospectId: string | null;
  createdAt: string;
};

export type CreateCustomerInput = {
  fullName?: unknown;
  whatsapp?: unknown;
  email?: unknown;
  city?: unknown;
  country?: unknown;
  preferredContactChannel?: unknown;
};
export type AdminCustomersResponse = { customers: AdminCustomer[] };
export type CreateCustomerResponse = { customer: AdminCustomer };
export type CustomerErrorResponse = { error: CustomerErrorCode; reason?: string };

/** Subscription line on the client profile (UX-4). Read-only summary; details come from the per-subscription endpoints. */
export type AdminCustomerSubscriptionSummary = {
  id: string;
  reference: string;
  status: string;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  variantId: string | null;
  variantName: string | null;
  agreedPriceXaf: number;
  plannedStartDate: string | null;
  actualStartDate: string | null;
  plannedEndDate: string | null;
  actualEndDate: string | null;
  renewedFromSubscriptionId: string | null;
  createdAt: string;
};
export type AdminCustomerDetailResponse = { customer: AdminCustomer; subscriptions: AdminCustomerSubscriptionSummary[] };

/* ------------------------------------------------------------------ */
/* Client analytics (UX-4c, board 03b). Read-only, computed on demand. */
/* Calculation rules validated by Fred on 2026-10-22 — see the        */
/* customer-analytics policy on the server for the exact formulas.    */
/* ------------------------------------------------------------------ */

/** « 30 jours » · « Abonnement en cours » · « Depuis le début ». */
export const customerAnalyticsPeriods = ["30j", "abonnement", "tout"] as const;
export type CustomerAnalyticsPeriod = (typeof customerAnalyticsPeriods)[number];

export type CustomerAnalyticsAttendance = {
  /** Completed appointments. */
  honored: number;
  /** Missed appointments (customer absent). */
  missed: number;
  /** Rescheduled appointments — shown, excluded from the rate. */
  rescheduled: number;
  /** honored / (honored + missed); null when both are 0. */
  rate: number | null;
};

export type CustomerAnalyticsWeek = { weekStart: string; honored: number; rescheduled: number; missed: number };

export type CustomerAnalyticsCadence = {
  subscriptionId: string;
  cadenceDays: number;
  /** Share of measured days where days-since-contact ≤ cadence; null when no measured day. */
  inCadenceRate: number | null;
  /** Current overdue days (0 when within cadence); null when not measured today. */
  overdueByDays: number | null;
  /** One point per day (UTC). null = not measured that day (paused, not started or ended). */
  series: Array<{ date: string; daysSinceContact: number | null }>;
};

export type CustomerAnalyticsPace = {
  subscriptionId: string;
  entitled: number;
  realized: number;
  /** Linear expectation today: entitled × elapsed active days ÷ total active days. */
  expected: number;
  elapsedDays: number;
  totalDays: number;
  /** realized < floor(expected). */
  behind: boolean;
  startDate: string;
  endDate: string;
  /** Cumulative realized services over time (step points). */
  series: Array<{ date: string; realized: number }>;
};

export type CustomerAnalyticsLinks = {
  sent: number;
  used: number;
  /** Median hours between sending a link and its first use; null when no link used. */
  medianHoursToUse: number | null;
  rescheduleRequests: number;
};

export type CustomerAnalyticsJourneyLine = {
  subscriptionId: string;
  reference: string;
  serviceName: string;
  serviceSlug: string;
  variantName: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  entitled: number;
  consumed: number;
  attendanceRate: number | null;
  renewedFromSubscriptionId: string | null;
};

export type CustomerAnalytics = {
  customerId: string;
  period: CustomerAnalyticsPeriod;
  periodStart: string;
  periodEnd: string;
  /** Subscription used for cadence and pace (selected, else the current one, else the latest). */
  focusSubscriptionId: string | null;
  attendance: CustomerAnalyticsAttendance;
  weeklyAttendance: CustomerAnalyticsWeek[];
  /** Null when the focus subscription has no cadence or never started. */
  cadence: CustomerAnalyticsCadence | null;
  /** Null when the focus subscription has no start, no planned end or no services. */
  pace: CustomerAnalyticsPace | null;
  links: CustomerAnalyticsLinks;
  journey: CustomerAnalyticsJourneyLine[];
};
export type CustomerAnalyticsResponse = { analytics: CustomerAnalytics };

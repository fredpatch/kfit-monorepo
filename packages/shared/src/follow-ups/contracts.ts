export const followUpTypes = [
  "check_in",
  "progress_review",
  "coaching_contact",
  "other",
] as const;
export type FollowUpType = (typeof followUpTypes)[number];
export const followUpApiRoutes = {
  list: "/admin/subscriptions/:subscriptionId/follow-ups",
  queue: "/admin/follow-ups/queue",
  complete: "/admin/follow-ups/:followUpId/complete",
  cancel: "/admin/follow-ups/:followUpId/cancel",
  cadence: "/admin/subscriptions/:subscriptionId/follow-up-cadence",
} as const;
export const followUpErrorCodes = [
  "FOLLOW_UP_NOT_FOUND",
  "FOLLOW_UP_INVALID_INPUT",
  "FOLLOW_UP_SUBSCRIPTION_NOT_ACTIVE",
  "FOLLOW_UP_TRANSITION_INVALID",
  "FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED",
  "FOLLOW_UP_OCCURRED_AT_FUTURE",
  "FOLLOW_UP_NEXT_ACTION_DATE_INVALID",
  "FOLLOW_UP_CADENCE_INVALID",
  "FOLLOW_UP_CADENCE_NOT_APPLICABLE",
  "FOLLOW_UP_ADMIN_FORBIDDEN",
  "FOLLOW_UP_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type FollowUpErrorCode = (typeof followUpErrorCodes)[number];
export type CadenceSource = "override" | "variant" | "service" | "none";
export type CadenceState = "healthy" | "due" | "overdue";
export type MeaningfulActivityType =
  | "activation"
  | "appointment_completed"
  | "follow_up_recorded"
  | "follow_up_completed";
export type CreateFollowUpInput = {
  followUpType: FollowUpType;
  occurredAt: string;
  note?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
};
export type CancelFollowUpInput = { reason: string };
export type FollowUpCadenceInput = { frequencyDays: number | null };
export type FollowUpCadence = {
  effectiveCadenceDays: number | null;
  cadenceSource: CadenceSource;
  monitoringDisabled: boolean;
  cadenceEligible: boolean;
  clockFrozen: boolean;
  latestMeaningfulActivityAt: string | null;
  latestActivityType: MeaningfulActivityType | null;
  nextFollowUpDueAt: string | null;
  cadenceState: CadenceState | null;
  overdueByDays: number | null;
  activeElapsedMs: number | null;
};
export type FollowUp = {
  id: string;
  followUpType: FollowUpType;
  occurredAt: string;
  note: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  status: "open" | "done" | "cancelled";
  effectiveStatus: "open" | "due" | "overdue" | "done" | "cancelled";
  completedAt: string | null;
  cancelledAt: string | null;
  events: Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    createdAt: string;
  }>;
};
export type FollowUpDetail = {
  subscriptionId: string;
  reference: string;
  subscriptionStatus: string;
  frequencyDaysOverride: number | null;
  asOf: string;
  cadence: FollowUpCadence;
  followUps: FollowUp[];
};
export type FollowUpResponse = { detail: FollowUpDetail };
export type FollowUpQueueItem = FollowUpCadence & {
  subscriptionId: string;
  reference: string;
  customer: { id: string; fullName: string };
  openFollowUpCount: number;
  overdueNextActionCount: number;
};
export type FollowUpQueueResponse = {
  asOf: string;
  items: FollowUpQueueItem[];
};

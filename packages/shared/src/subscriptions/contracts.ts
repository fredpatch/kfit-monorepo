export const subscriptionCommands = ["activate", "pause", "resume", "completion-due", "complete", "resume-active", "cancel", "renew"] as const;
export type SubscriptionCommand = (typeof subscriptionCommands)[number];
export const subscriptionApiRoutes = {
  detail: "/admin/subscriptions/:subscriptionId",
  activate: "/admin/subscriptions/:subscriptionId/activate",
  pause: "/admin/subscriptions/:subscriptionId/pause",
  resume: "/admin/subscriptions/:subscriptionId/resume",
  "completion-due": "/admin/subscriptions/:subscriptionId/completion-due",
  complete: "/admin/subscriptions/:subscriptionId/complete",
  "resume-active": "/admin/subscriptions/:subscriptionId/resume-active",
  cancel: "/admin/subscriptions/:subscriptionId/cancel",
  renew: "/admin/subscriptions/:subscriptionId/renew",
} as const;
export const subscriptionErrorCodes = [
  "SUBSCRIPTION_NOT_FOUND", "SUBSCRIPTION_INVALID_INPUT", "SUBSCRIPTION_TRANSITION_INVALID", "SUBSCRIPTION_BLOCKED",
  "SUBSCRIPTION_ALREADY_STARTED", "SUBSCRIPTION_PAUSE_ALREADY_OPEN", "SUBSCRIPTION_PAUSE_NOT_FOUND",
  "SUBSCRIPTION_RESUME_DATE_INVALID", "SUBSCRIPTION_COMPLETION_REASON_REQUIRED", "SUBSCRIPTION_COMPONENTS_OUTSTANDING",
  "SUBSCRIPTION_RENEWAL_ALREADY_EXISTS", "SUBSCRIPTION_DURATION_INVALID", "SUBSCRIPTION_ADMIN_FORBIDDEN", "SUBSCRIPTION_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type SubscriptionErrorCode = (typeof subscriptionErrorCodes)[number];
export type ActivateSubscriptionInput = Record<string, never>;
export type PauseSubscriptionInput = { reason: string };
export type ResumeSubscriptionInput = { revisedEndDate?: string | null };
export type CompletionDueSubscriptionInput = { reason?: string };
export type CompleteSubscriptionInput = { overrideOutstandingComponents: boolean; overrideReason?: string };
export type ResumeActiveSubscriptionInput = { reason: string; revisedEndDate?: string | null };
export type CancelSubscriptionInput = { reason: string };
export type RenewSubscriptionInput = { plannedStartDate: string };
export type SubscriptionInput = ActivateSubscriptionInput | PauseSubscriptionInput | ResumeSubscriptionInput | CompletionDueSubscriptionInput
  | CompleteSubscriptionInput | ResumeActiveSubscriptionInput | CancelSubscriptionInput | RenewSubscriptionInput;
export type SubscriptionDetail = {
  id: string; reference: string; customerId: string; serviceId: string; serviceName: string; variantId: string | null; variantName: string | null;
  status: string; agreedPriceXaf: number; currency: string;
  plannedStartDate: string | null; actualStartDate: string | null; plannedEndDate: string | null; actualEndDate: string | null;
  durationValueSnapshot: number | null; durationUnitSnapshot: string | null; cancelledAt: string | null; completedAt: string | null;
  renewedFromSubscriptionId: string | null; renewalChild: { id: string; reference: string } | null;
  pauses: Array<{ id: string; startedAt: string; endedAt: string | null; reason: string; originalEndDate: string | null; revisedEndDate: string | null }>;
  history: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; changedAt: string }>;
  components: Array<{ id: string; componentType: string; labelSnapshot: string; quantityEntitled: number; quantityConsumed: number; quantityOwedByCoach: number }>;
  availableCommands: SubscriptionCommand[];
};
export type SubscriptionResponse = { subscription: SubscriptionDetail };

export const onboardingApiRoutes = {
  detail: "/admin/subscriptions/:subscriptionId/onboarding",
  initialize: "/admin/subscriptions/:subscriptionId/onboarding/initialize",
  complete: "/admin/subscriptions/:subscriptionId/onboarding/items/:itemId/complete",
  waive: "/admin/subscriptions/:subscriptionId/onboarding/items/:itemId/waive",
  reservation: "/admin/subscriptions/:subscriptionId/onboarding/capacity-reservation",
  ready: "/admin/subscriptions/:subscriptionId/onboarding/ready",
} as const;

export const onboardingErrorCodes = [
  "ONBOARDING_INVALID_INPUT", "ONBOARDING_NOT_FOUND", "ONBOARDING_ADMIN_FORBIDDEN", "ONBOARDING_INVALID_STATE",
  "ONBOARDING_ITEM_NOT_FOUND", "ONBOARDING_ITEM_FORBIDDEN", "ONBOARDING_ITEM_RESOLVED", "ONBOARDING_REASON_REQUIRED",
  "ONBOARDING_BLOCKED", "ONBOARDING_START_DATE_REQUIRED", "ONBOARDING_POLICY_INVALID", "ONBOARDING_CAPACITY_REQUIRED",
  "ONBOARDING_CAPACITY_EXHAUSTED", "ONBOARDING_CAPACITY_INVALID", "ONBOARDING_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type OnboardingErrorCode = (typeof onboardingErrorCodes)[number];
export type OnboardingState = "blocked" | "ready" | "stalled";
export type OnboardingOwner = "system" | "coach" | "consent" | "questionnaire" | "medical" | "external";
export type OnboardingItem = {
  id: string; itemType: string; label: string; status: string; isBlocking: boolean;
  completedAt: string | null; waivedAt: string | null; waiverReason: string | null;
  owner: OnboardingOwner; canComplete: boolean; canWaive: boolean;
};
export type OnboardingDetail = {
  subscription: { id: string; reference: string; status: string; plannedStartDate: string | null; capacityReservedUntil: string | null };
  service: { id: string; name: string; variantId: string | null; variantName: string | null };
  policy: { source: "variant" | "service" | "none"; questionnaireRequired: boolean };
  capacity: { mode: "unlimited" | "limited"; limit: number | null; scope: "service" | "variant"; occupied: number; expired: boolean; valid: boolean };
  initialized: boolean; onboardingState: OnboardingState; canReady: boolean; items: OnboardingItem[];
};
export type OnboardingResponse = { onboarding: OnboardingDetail };
export type WaiveOnboardingInput = { reason?: unknown };
export type CapacityReservationInput = { capacityReservedUntil?: unknown };

/**
 * Client-level status derived from subscriptions (board 04). Rule validated by Fred on 2026-10-22:
 * - « Cliente active » if at least one subscription is active;
 * - otherwise the most advanced open subscription: completion_due > paused > ready_to_start
 *   > awaiting_payment > medical_clearance_required > onboarding;
 * - « Ancienne cliente » if every subscription is completed or cancelled;
 * - « Prospect converti » if the client has no subscription.
 * Single source for the server overview and the client profile.
 */
export const openSubscriptionPriority = ["active", "completion_due", "paused", "ready_to_start", "awaiting_payment", "medical_clearance_required", "onboarding"] as const;
export type OpenSubscriptionStatus = (typeof openSubscriptionPriority)[number];
export const clientStatusKeys = [...openSubscriptionPriority, "former", "none"] as const;
export type ClientStatusKey = (typeof clientStatusKeys)[number];

export function deriveClientStatusKey(subscriptions: ReadonlyArray<{ status: string }>): ClientStatusKey {
  if (subscriptions.length === 0) return "none";
  for (const status of openSubscriptionPriority) if (subscriptions.some((s) => s.status === status)) return status;
  return "former";
}

/** Subscription shown by default (profile, list « Abonnement en cours »): the most advanced open one, else the first given (callers pass newest first). */
export function pickDefaultSubscription<T extends { status: string }>(subscriptions: ReadonlyArray<T>): T | undefined {
  for (const status of openSubscriptionPriority) {
    const match = subscriptions.find((s) => s.status === status);
    if (match) return match;
  }
  return subscriptions[0];
}

export function isOpenSubscription(status: string): boolean {
  return (openSubscriptionPriority as readonly string[]).includes(status);
}

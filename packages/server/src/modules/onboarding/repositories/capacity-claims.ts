import { and, eq, gt, inArray, or } from "drizzle-orm";
import { subscriptions } from "../../../db/schema/customers.js";

/**
 * Subscriptions that hold a capacity place (S4 rule). Single source for the onboarding
 * reservation check and the catalogue occupancy view (UX-7), so both always agree:
 * ready to start, active, paused, end review — plus « onboarding » with a reservation still valid at `now`.
 */
export const capacityClaimStatuses = ["ready_to_start", "active", "paused", "completion_due"] as const;

export function capacityClaimCondition(now: Date) {
  return or(inArray(subscriptions.status, [...capacityClaimStatuses]), and(eq(subscriptions.status, "onboarding"), gt(subscriptions.capacityReservedUntil, now)));
}

import type { AdminCustomerSubscriptionSummary } from "@kfit/shared";
import type { StatusDescriptor } from "./status-map.js";

/**
 * Client-level status derived from subscriptions (board 04).
 * Rule proposed in the backlog task « Liste clients enrichie + statut client dérivé » — pending Fred's validation:
 * - Actif if at least one subscription is active
 * - otherwise the most advanced open subscription: Revue de fin > En pause > Prêt à démarrer > En préparation
 * - Ancien client if every subscription is completed or cancelled
 * - Prospect converti if the client has no subscription
 */
const openPriority = ["active", "completion_due", "paused", "ready_to_start", "awaiting_payment", "medical_clearance_required", "onboarding"] as const;

const clientLabels: Record<(typeof openPriority)[number] | "former" | "none", StatusDescriptor> = {
  active: { label: "Cliente active", tone: "success" },
  completion_due: { label: "Revue de fin", tone: "warning" },
  paused: { label: "En pause", tone: "warning" },
  ready_to_start: { label: "Prête à démarrer", tone: "waitlist" },
  awaiting_payment: { label: "En attente de paiement", tone: "warning" },
  medical_clearance_required: { label: "Validation médicale requise", tone: "warning" },
  onboarding: { label: "En préparation", tone: "info" },
  former: { label: "Ancienne cliente", tone: "neutral" },
  none: { label: "Prospect converti", tone: "info" },
};

export function deriveClientStatus(subscriptions: Pick<AdminCustomerSubscriptionSummary, "status">[]): StatusDescriptor {
  if (subscriptions.length === 0) return clientLabels.none;
  for (const status of openPriority) if (subscriptions.some((s) => s.status === status)) return clientLabels[status];
  return clientLabels.former;
}

/** Default subscription shown on the profile: the most advanced open one, else the newest. */
export function defaultSubscription<T extends Pick<AdminCustomerSubscriptionSummary, "status">>(subscriptions: T[]): T | undefined {
  for (const status of openPriority) {
    const match = subscriptions.find((s) => s.status === status);
    if (match) return match;
  }
  return subscriptions[0];
}

import {
  deriveClientStatusKey,
  pickDefaultSubscription,
  type AdminCustomerSubscriptionSummary,
  type ClientStatusKey,
} from "@kfit/shared";
import type { StatusDescriptor } from "./status-map.js";

/**
 * Client-level status (board 04). The rule lives in @kfit/shared (validated by Fred on 2026-10-22)
 * so the clients list (server overview) and the profile header never drift apart; this file only holds wording.
 */
export const clientStatus: Record<ClientStatusKey, StatusDescriptor> = {
  active: { label: "Cliente active", tone: "success" },
  completion_due: { label: "Revue de fin", tone: "warning" },
  paused: { label: "En pause", tone: "warning" },
  ready_to_start: { label: "Prête à démarrer", tone: "waitlist" },
  awaiting_payment: { label: "En attente de paiement", tone: "warning" },
  medical_clearance_required: {
    label: "Validation médicale requise",
    tone: "warning",
  },
  onboarding: { label: "En préparation", tone: "info" },
  former: { label: "Ancienne cliente", tone: "neutral" },
  none: { label: "Prospect converti", tone: "info" },
};

export function deriveClientStatus(
  subscriptions: Pick<AdminCustomerSubscriptionSummary, "status">[],
): StatusDescriptor {
  return clientStatus[deriveClientStatusKey(subscriptions)];
}

/** Default subscription shown on the profile: the most advanced open one, else the newest. */
export function defaultSubscription<
  T extends Pick<AdminCustomerSubscriptionSummary, "status">,
>(subscriptions: T[]): T | undefined {
  return pickDefaultSubscription(subscriptions);
}

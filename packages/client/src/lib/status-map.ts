import type { CadenceState, GoalStatus, ServiceRequestStatus, WaitlistEntryStatus } from "@kfit/shared";

/**
 * Single source of truth for status wording and colour (board 01).
 * Rule: one status = one French label + one tone, on every screen.
 * Tones are reserved for statuses and never reused as chart series colours.
 */
export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral" | "waitlist";

export type StatusDescriptor = { label: string; tone: StatusTone };

/* Server enums not yet exported by @kfit/shared (mirror of packages/server/src/db/enums.ts). */
export type SubscriptionStatus =
  | "onboarding"
  | "awaiting_payment"
  | "medical_clearance_required"
  | "ready_to_start"
  | "active"
  | "paused"
  | "completion_due"
  | "completed"
  | "cancelled";
export type AppointmentStatus = "scheduled" | "confirmed" | "reschedule_requested" | "rescheduled" | "completed" | "cancelled" | "missed";
export type CustomerAppointmentResponse = "pending" | "confirmed" | "declined" | "reschedule_requested";
export type FollowUpEffectiveStatus = "open" | "due" | "overdue" | "done" | "cancelled";

export const requestStatus: Record<ServiceRequestStatus, StatusDescriptor> = {
  submitted: { label: "Nouvelle", tone: "info" },
  contacting: { label: "Contact en cours", tone: "warning" },
  qualification_in_progress: { label: "Qualification", tone: "waitlist" },
  qualified: { label: "Qualifiée", tone: "success" },
  qualified_with_conditions: { label: "Qualifiée avec conditions", tone: "success" },
  waitlisted: { label: "Liste d'attente", tone: "waitlist" },
  rejected: { label: "Rejetée", tone: "danger" },
  abandoned: { label: "Abandonnée", tone: "neutral" },
  converted: { label: "Convertie", tone: "success" },
  closed_duplicate: { label: "Doublon clôturé", tone: "neutral" },
};

export const subscriptionStatus: Record<SubscriptionStatus, StatusDescriptor> = {
  onboarding: { label: "En préparation", tone: "info" },
  awaiting_payment: { label: "En attente de paiement", tone: "warning" },
  medical_clearance_required: { label: "Validation médicale requise", tone: "warning" },
  ready_to_start: { label: "Prêt à démarrer", tone: "waitlist" },
  active: { label: "Actif", tone: "success" },
  paused: { label: "En pause", tone: "warning" },
  completion_due: { label: "Revue de fin", tone: "warning" },
  completed: { label: "Terminé", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "danger" },
};

export const appointmentStatus: Record<AppointmentStatus, StatusDescriptor> = {
  scheduled: { label: "Planifié", tone: "info" },
  confirmed: { label: "Confirmé", tone: "success" },
  reschedule_requested: { label: "Report demandé", tone: "warning" },
  rescheduled: { label: "Reporté", tone: "neutral" },
  completed: { label: "Terminé", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "neutral" },
  missed: { label: "Absent", tone: "danger" },
};

export const customerAppointmentResponse: Record<CustomerAppointmentResponse, StatusDescriptor> = {
  pending: { label: "Réponse en attente", tone: "neutral" },
  confirmed: { label: "Confirmé par la cliente", tone: "success" },
  declined: { label: "Décliné", tone: "danger" },
  reschedule_requested: { label: "Report demandé", tone: "warning" },
};

export const cadenceState: Record<CadenceState, StatusDescriptor> = {
  healthy: { label: "À jour", tone: "success" },
  due: { label: "À faire", tone: "warning" },
  overdue: { label: "En retard", tone: "danger" },
};

export const followUpStatus: Record<FollowUpEffectiveStatus, StatusDescriptor> = {
  open: { label: "Ouvert", tone: "info" },
  due: { label: "À faire", tone: "warning" },
  overdue: { label: "En retard", tone: "danger" },
  done: { label: "Fait", tone: "success" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const goalStatus: Record<GoalStatus, StatusDescriptor> = {
  active: { label: "Actif", tone: "info" },
  paused: { label: "En pause", tone: "warning" },
  achieved: { label: "Atteint", tone: "success" },
  partially_achieved: { label: "Partiellement atteint", tone: "warning" },
  not_achieved: { label: "Non atteint", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const waitlistEntryStatus: Record<WaitlistEntryStatus, StatusDescriptor> = {
  active: { label: "En attente", tone: "waitlist" },
  contacted: { label: "Contactée", tone: "info" },
  promoted: { label: "Place attribuée", tone: "success" },
  withdrawn: { label: "Retirée", tone: "neutral" },
  expired: { label: "Expirée", tone: "neutral" },
};

const unknownStatus: StatusDescriptor = { label: "État à vérifier", tone: "neutral" };

/** Safe lookup for API values typed as plain strings. */
export function describeStatus<K extends string>(map: Record<K, StatusDescriptor>, value: string | null | undefined): StatusDescriptor {
  if (value && Object.prototype.hasOwnProperty.call(map, value)) return map[value as K];
  return unknownStatus;
}

/** "En retard · 4 j" style label for overdue cadence. */
export function overdueLabel(days: number | null | undefined): string {
  return days && days > 0 ? `En retard · ${days} j` : cadenceState.overdue.label;
}

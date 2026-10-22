import type { ContactAttemptChannel, ContactAttemptDirection, ContactAttemptOutcome, QualificationReviewOutcome, ServiceRequestStatus, WaitlistEntryStatus } from "@kfit/shared";

/** French wording for the requests screen (board 05). Status labels/tones live in lib/status-map (requestStatus). */
export const channelLabels: Record<ContactAttemptChannel, string> = { whatsapp: "WhatsApp", phone_call: "Appel", sms: "SMS", email: "E-mail", other: "Autre" };
export const directionLabels: Record<ContactAttemptDirection, string> = { outbound: "Sortant", inbound: "Entrant" };
export const outcomeLabels: Record<ContactAttemptOutcome, string> = {
  reached: "Joint",
  no_answer: "Sans réponse",
  callback_requested: "Rappel demandé",
  not_interested: "Pas intéressé",
  invalid_contact: "Contact invalide",
  other: "Autre",
};
export const qualificationOutcomeLabels: Record<QualificationReviewOutcome, string> = {
  qualified: "Qualifiée",
  qualified_with_conditions: "Qualifiée avec conditions",
  rejected: "Rejetée",
};
export const waitlistEntryStatusLabels: Record<WaitlistEntryStatus, string> = { active: "En attente", contacted: "Contactée", promoted: "Promue", withdrawn: "Retirée", expired: "Expirée" };

/** Labels for the server-allowed transitions (adminRequestAllowedTransitions in @kfit/shared). */
export const transitionLabels: Partial<Record<ServiceRequestStatus, string>> = {
  contacting: "Démarrer le contact",
  qualification_in_progress: "Passer en qualification",
  abandoned: "Abandonner la demande",
};

/*
 * Queue views (board 05). UI grouping only — filtering is client-side in V1 (backlog: « À traiter » server-side).
 * « À traiter » = every request still waiting for a coach action.
 */
export const requestViews = ["todo", "submitted", "contacting", "qualification", "waitlisted", "closed"] as const;
export type RequestView = (typeof requestViews)[number];
export const requestViewLabels: Record<RequestView, string> = {
  todo: "À traiter",
  submitted: "Nouvelles",
  contacting: "Contact en cours",
  qualification: "Qualification",
  waitlisted: "Liste d'attente",
  closed: "Clôturées",
};
export const requestViewStatuses: Record<RequestView, readonly ServiceRequestStatus[]> = {
  todo: ["submitted", "contacting", "qualification_in_progress", "qualified", "qualified_with_conditions"],
  submitted: ["submitted"],
  contacting: ["contacting"],
  qualification: ["qualification_in_progress", "qualified", "qualified_with_conditions"],
  waitlisted: ["waitlisted"],
  closed: ["rejected", "abandoned", "converted", "closed_duplicate"],
};

/** Progress steps shown on the detail (board 05). */
export const requestSteps = [
  { label: "Nouvelle", statuses: ["submitted"] },
  { label: "Contact", statuses: ["contacting"] },
  { label: "Qualification", statuses: ["qualification_in_progress", "abandoned"] },
  { label: "Décision", statuses: ["qualified", "qualified_with_conditions", "rejected", "waitlisted", "closed_duplicate"] },
  { label: "Convertie", statuses: ["converted"] },
] as const;

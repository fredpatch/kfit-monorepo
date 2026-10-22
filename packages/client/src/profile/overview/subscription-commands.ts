import type { SubscriptionCommand, SubscriptionDetail } from "@kfit/shared";

/**
 * Coach decisions on a subscription. The server decides which commands are available
 * (availableCommands); this file only holds wording and which inputs each command takes —
 * the same rules as the former lifecycle screen, unchanged.
 */
export const commandLabels: Record<SubscriptionCommand, string> = {
  activate: "Démarrer",
  pause: "Mettre en pause",
  resume: "Reprendre",
  "completion-due": "Ouvrir la revue de fin",
  "resume-active": "Prolonger / reprendre après revue",
  complete: "Terminer",
  cancel: "Annuler l'abonnement",
  renew: "Renouveler",
};

export const commandDescriptions: Record<SubscriptionCommand, string> = {
  activate: "L'abonnement passe à « Actif » et la cadence de suivi démarre.",
  pause: "Les séances et la cadence de suivi sont suspendues jusqu'à la reprise.",
  resume: "L'abonnement redevient actif. Tu peux ajuster la date de fin.",
  "completion-due": "Ouvre la revue de fin pour décider de terminer, prolonger ou renouveler.",
  "resume-active": "Reprend l'abonnement après la revue de fin, avec une nouvelle date de fin si besoin.",
  complete: "Clôture l'abonnement. Les prestations non consommées restent visibles dans l'historique.",
  cancel: "Arrête définitivement l'abonnement. Cette décision est enregistrée et ne peut pas être annulée.",
  renew: "Crée un nouvel abonnement lié, qui démarrera à la date choisie.",
};

/** One visible primary action; the rest go in « ⋯ ». Cancel is never primary. */
const primaryOrder: SubscriptionCommand[] = ["activate", "resume", "complete", "renew", "resume-active", "completion-due", "pause"];

export function splitCommands(available: SubscriptionCommand[]): { primary: SubscriptionCommand | null; secondary: SubscriptionCommand[] } {
  const primary = primaryOrder.find((c) => available.includes(c)) ?? null;
  return { primary, secondary: available.filter((c) => c !== primary) };
}

/** Reason is required for pause, cancel, resume-active, early completion review, and completion with outstanding services. */
export function reasonRequired(command: SubscriptionCommand, view: SubscriptionDetail, overrideOutstanding: boolean): boolean {
  if (command === "pause" || command === "cancel" || command === "resume-active") return true;
  if (command === "complete") return overrideOutstanding;
  if (command === "completion-due") return !view.plannedEndDate || new Date(view.plannedEndDate).getTime() > Date.now();
  return false;
}

export function outstandingComponents(view: SubscriptionDetail): number {
  return view.components.reduce((sum, c) => sum + Math.max(0, c.quantityEntitled - c.quantityConsumed), 0);
}

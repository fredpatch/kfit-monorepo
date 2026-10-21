import type { CadenceSource, CadenceState, FollowUpType, MeaningfulActivityType } from "@kfit/shared";
export const cadenceSources: Record<CadenceSource, string> = { override: "Personnalisée pour cet abonnement", variant: "Option du service", service: "Service", none: "Aucune cadence configurée" };
export const cadenceStates: Record<CadenceState, string> = { healthy: "À suivre", due: "À échéance", overdue: "En retard" };
export const activityTypes: Record<MeaningfulActivityType, string> = { activation: "Démarrage", appointment_completed: "Rendez-vous terminé", follow_up_recorded: "Suivi enregistré", follow_up_completed: "Action de suivi terminée" };
export const followUpTypeLabels: Record<FollowUpType, string> = { check_in: "Point de suivi", progress_review: "Bilan de progression", coaching_contact: "Contact de coaching", other: "Autre" };
export const followUpStatuses: Record<string, string> = { open: "Action ouverte", due: "Action à échéance", overdue: "Action en retard", done: "Terminé", cancelled: "Annulé" };
export const followUpDate = (value: string | null) => value ? new Date(value).toLocaleString("fr-FR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "Non définie";

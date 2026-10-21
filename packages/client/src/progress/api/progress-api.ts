import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, progressApiRoutes, type CreateGoalInput, type CreateMeasurementInput, type GoalAction,
  type GoalCommandInput, type ConfirmGoalOutcomeInput, type GoalsResponse, type ProgressResponse, type ProgressErrorCode } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
http.interceptors.request.use(config => {
  if (requiresCsrfHeader(config.method)) { const headers = AxiosHeaders.from(config.headers), token = buildCsrfHeaders(config.method)[authCsrfHeaderName]; if (token) headers.set(authCsrfHeaderName, token); config.headers = headers; }
  return config;
});
const path = (route: string, id: string) => route.replace(":subscriptionId", encodeURIComponent(id)).replace(":goalId", encodeURIComponent(id));
export const progressApi = {
  async progress(id: string) { return (await http.get<ProgressResponse>(path(progressApiRoutes.progress, id))).data; },
  async goals(id: string) { return (await http.get<GoalsResponse>(path(progressApiRoutes.goals, id))).data; },
  async measure(id: string, input: CreateMeasurementInput) { return (await http.post<ProgressResponse>(path(progressApiRoutes.measurements, id), input)).data; },
  async createGoal(id: string, input: CreateGoalInput) { return (await http.post<GoalsResponse>(path(progressApiRoutes.goals, id), input)).data; },
  async command(id: string, action: GoalAction, input: GoalCommandInput | ConfirmGoalOutcomeInput) {
    const route = action === "confirm-outcome" ? progressApiRoutes.confirmOutcome : progressApiRoutes[action];
    return (await http.post<GoalsResponse>(path(route, id), input)).data;
  },
};
const messages: Record<ProgressErrorCode, string> = {
  PROGRESS_INVALID_INPUT: "Vérifie la date et les mesures : au moins une valeur positive, deux décimales au maximum, sans date future.",
  PROGRESS_SUBSCRIPTION_NOT_ELIGIBLE: "L’abonnement doit être actif ou en pause pour enregistrer une mesure.",
  PROGRESS_HEALTH_CONSENT_REQUIRED: "Le consentement actuel aux données de santé doit être accordé avant toute nouvelle mesure.",
  PROGRESS_MEASUREMENT_DUPLICATE: "Cette mesure est déjà enregistrée. L’historique a été actualisé.",
  PROGRESS_MEASUREMENT_NOT_FOUND: "Cet abonnement ou cette mesure est introuvable.", GOAL_NOT_FOUND: "Cet abonnement ou cet objectif est introuvable.",
  GOAL_INVALID_INPUT: "Vérifie les informations de l’objectif.", GOAL_SUBSCRIPTION_NOT_ELIGIBLE: "Un objectif se crée uniquement pour un abonnement actif ou en pause.",
  GOAL_METRIC_INVALID: "Choisis une mesure prise en charge.", GOAL_NUMERIC_FIELDS_INCOMPLETE: "Renseigne ensemble la valeur de départ, la cible et l’unité.",
  GOAL_TARGET_INVALID: "Vérifie les valeurs de départ et cible. Pour une mesure, elles doivent être positives et différentes.",
  GOAL_TARGET_DATE_INVALID: "L’échéance de création doit être une date future valide.", GOAL_TRANSITION_INVALID: "Cette décision n’est plus disponible. Les objectifs ont été actualisés.",
  GOAL_OUTCOME_REASON_REQUIRED: "Un motif est obligatoire pour annuler ou confirmer un résultat différent de la suggestion, y compris sans suggestion.",
  PROGRESS_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.", PROGRESS_ROUTE_UNEXPECTED_FAILURE: "L’action n’a pas pu être confirmée. Actualise la progression avant de réessayer.",
};
export function progressErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data.error : undefined;
  if (code === "AUTH_SESSION_REQUIRED") return "Ta session a expiré. Reconnecte-toi.";
  if (code === "AUTH_CSRF_INVALID" || code === "AUTH_ORIGIN_INVALID") return "La vérification de sécurité a échoué. Recharge la page.";
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code as ProgressErrorCode] : "Impossible de charger la progression. Réessaie dans un instant.";
}

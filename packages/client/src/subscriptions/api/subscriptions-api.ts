import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, subscriptionApiRoutes, type SubscriptionCommand, type SubscriptionInput, type SubscriptionResponse, type SubscriptionErrorCode } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
http.interceptors.request.use(config => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers), token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token); config.headers = headers;
  } return config;
});
const route = (path: string, id: string) => path.replace(":subscriptionId", encodeURIComponent(id));
export const subscriptionsApi = {
  async get(id: string) { return (await http.get<SubscriptionResponse>(route(subscriptionApiRoutes.detail, id))).data; },
  async command(id: string, action: SubscriptionCommand, input: SubscriptionInput) { return (await http.post<SubscriptionResponse>(route(subscriptionApiRoutes[action], id), input)).data; },
};
const messages: Record<SubscriptionErrorCode, string> = {
  SUBSCRIPTION_NOT_FOUND: "Cet abonnement est introuvable.", SUBSCRIPTION_INVALID_INPUT: "Vérifie les informations saisies et renseigne le motif demandé.",
  SUBSCRIPTION_TRANSITION_INVALID: "Cette action n’est plus disponible dans l’état actuel. La fiche a été actualisée.",
  SUBSCRIPTION_BLOCKED: "Des exigences de préparation, d’acceptation ou de validation médicale restent bloquantes. Ouvre l’onboarding pour les vérifier.",
  SUBSCRIPTION_ALREADY_STARTED: "Une date de démarrage existe déjà. Vérifie l’historique.", SUBSCRIPTION_PAUSE_ALREADY_OPEN: "Une pause est déjà ouverte.",
  SUBSCRIPTION_PAUSE_NOT_FOUND: "La pause ouverte est introuvable ou incohérente. Vérifie l’historique avant de poursuivre.",
  SUBSCRIPTION_RESUME_DATE_INVALID: "Choisis une date de fin future, au moins égale à la fin initiale. Pour reprendre une pause avec fin prévue, cette date est obligatoire.",
  SUBSCRIPTION_COMPLETION_REASON_REQUIRED: "Un motif non vide est obligatoire pour cette décision.",
  SUBSCRIPTION_COMPONENTS_OUTSTANDING: "Des prestations restent dues par le coach. Résous ce solde ou confirme explicitement une dérogation motivée.",
  SUBSCRIPTION_RENEWAL_ALREADY_EXISTS: "Un renouvellement existe déjà. Ouvre l’abonnement lié.", SUBSCRIPTION_DURATION_INVALID: "La durée enregistrée est incohérente. Fais vérifier cet abonnement avant de poursuivre.",
  SUBSCRIPTION_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.", SUBSCRIPTION_ROUTE_UNEXPECTED_FAILURE: "L’action n’a pas pu être confirmée. Actualise la fiche avant de réessayer.",
};
export function subscriptionErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data.error : undefined;
  if (code === "AUTH_SESSION_REQUIRED") return "Ta session a expiré. Reconnecte-toi.";
  if (code === "AUTH_ORIGIN_INVALID" || code === "AUTH_CSRF_INVALID") return "La vérification de sécurité a échoué. Recharge la page.";
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code as SubscriptionErrorCode] : "Impossible de charger l’abonnement. Réessaie dans un instant.";
}

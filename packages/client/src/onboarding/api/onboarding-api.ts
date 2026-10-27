import axios, { AxiosHeaders } from "axios";
import {
  onboardingApiRoutes,
  authCsrfHeaderName,
  type OnboardingResponse,
  type OnboardingErrorCode,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import { commonApiErrorMessage } from "../../lib/api-error-messages.js";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: { accept: "application/json" },
});
http.interceptors.request.use((config) => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers);
    const token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});
function route(path: string, subscriptionId: string, itemId = "") {
  return path
    .replace(":subscriptionId", encodeURIComponent(subscriptionId))
    .replace(":itemId", encodeURIComponent(itemId));
}
export const onboardingApi = {
  async get(id: string) {
    return (
      await http.get<OnboardingResponse>(route(onboardingApiRoutes.detail, id))
    ).data;
  },
  async initialize(id: string) {
    return (
      await http.post<OnboardingResponse>(
        route(onboardingApiRoutes.initialize, id),
        {},
      )
    ).data;
  },
  async complete(id: string, itemId: string) {
    return (
      await http.post<OnboardingResponse>(
        route(onboardingApiRoutes.complete, id, itemId),
        {},
      )
    ).data;
  },
  async waive(id: string, itemId: string, reason: string) {
    return (
      await http.post<OnboardingResponse>(
        route(onboardingApiRoutes.waive, id, itemId),
        { reason },
      )
    ).data;
  },
  async reserve(id: string, capacityReservedUntil: string) {
    return (
      await http.put<OnboardingResponse>(
        route(onboardingApiRoutes.reservation, id),
        { capacityReservedUntil },
      )
    ).data;
  },
  async ready(id: string) {
    return (
      await http.post<OnboardingResponse>(
        route(onboardingApiRoutes.ready, id),
        {},
      )
    ).data;
  },
};
const messages: Record<OnboardingErrorCode, string> = {
  ONBOARDING_INVALID_INPUT:
    "Vérifie les informations saisies et la date de réservation.",
  ONBOARDING_NOT_FOUND: "Cet abonnement est introuvable.",
  ONBOARDING_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.",
  ONBOARDING_INVALID_STATE:
    "Cette action n’est pas autorisée dans l’état actuel de l’abonnement.",
  ONBOARDING_ITEM_NOT_FOUND:
    "Cette exigence est introuvable sur cet abonnement.",
  ONBOARDING_ITEM_FORBIDDEN:
    "Cette exigence doit être validée par son parcours dédié.",
  ONBOARDING_ITEM_RESOLVED:
    "Cette exigence a déjà été traitée. Actualise la checklist.",
  ONBOARDING_REASON_REQUIRED: "Un motif de dispense non vide est obligatoire.",
  ONBOARDING_BLOCKED: "Des exigences bloquantes restent à satisfaire.",
  ONBOARDING_START_DATE_REQUIRED:
    "La date de début prévue doit être confirmée.",
  ONBOARDING_POLICY_INVALID:
    "Les règles du service sont incohérentes. Vérifie sa configuration.",
  ONBOARDING_CAPACITY_REQUIRED:
    "Définis ou prolonge la réservation avant de confirmer le démarrage.",
  ONBOARDING_CAPACITY_EXHAUSTED:
    "La capacité disponible est épuisée. Aucune place supplémentaire n’a été réservée.",
  ONBOARDING_CAPACITY_INVALID:
    "Vérifie la capacité du service et choisis une échéance future.",
  ONBOARDING_ROUTE_UNEXPECTED_FAILURE:
    "Impossible d’effectuer cette action. Actualise la fiche avant de réessayer.",
};
export function onboardingErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error)
    ? error.response?.data.error
    : undefined;
  const common = commonApiErrorMessage(code);
  if (common) return common;
  if (typeof code === "string" && Object.hasOwn(messages, code))
    return messages[code as OnboardingErrorCode];
  return "Impossible de charger l’onboarding. Réessaie dans un instant.";
}

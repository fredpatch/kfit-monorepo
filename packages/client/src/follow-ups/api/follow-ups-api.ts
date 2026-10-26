import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, followUpApiRoutes, type CreateFollowUpInput, type FollowUpErrorCode, type FollowUpQueueResponse, type FollowUpResponse } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import { commonApiErrorMessage } from "../../lib/api-error-messages.js";
const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
http.interceptors.request.use(config => { if (requiresCsrfHeader(config.method)) { const headers = AxiosHeaders.from(config.headers), token = buildCsrfHeaders(config.method)[authCsrfHeaderName]; if (token) headers.set(authCsrfHeaderName, token); config.headers = headers; } return config; });
const path = (route: string, id: string) => route.replace(":subscriptionId", encodeURIComponent(id)).replace(":followUpId", encodeURIComponent(id));
export const followUpsApi = {
  async list(id: string) { return (await http.get<FollowUpResponse>(path(followUpApiRoutes.list, id))).data; },
  async queue() { return (await http.get<FollowUpQueueResponse>(followUpApiRoutes.queue)).data; },
  async create(id: string, input: CreateFollowUpInput) { return (await http.post<FollowUpResponse>(path(followUpApiRoutes.list, id), input)).data; },
  async complete(id: string) { return (await http.post<FollowUpResponse>(path(followUpApiRoutes.complete, id), {})).data; },
  async cancel(id: string, reason: string) { return (await http.post<FollowUpResponse>(path(followUpApiRoutes.cancel, id), { reason })).data; },
  async cadence(id: string, frequencyDays: number | null) { return (await http.put<FollowUpResponse>(path(followUpApiRoutes.cadence, id), { frequencyDays })).data; },
};
const messages: Record<FollowUpErrorCode, string> = {
  FOLLOW_UP_NOT_FOUND: "Ce suivi ou cet abonnement est introuvable.", FOLLOW_UP_INVALID_INPUT: "Vérifie le type de suivi, les dates et les informations saisies.",
  FOLLOW_UP_SUBSCRIPTION_NOT_ACTIVE: "L’abonnement doit être actif pour enregistrer un suivi.", FOLLOW_UP_TRANSITION_INVALID: "Cette action a déjà été traitée. Les suivis ont été actualisés.",
  FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED: "Une prochaine action non vide et sa date doivent être renseignées ensemble.", FOLLOW_UP_OCCURRED_AT_FUTURE: "La date du suivi ne peut pas être dans le futur.",
  FOLLOW_UP_NEXT_ACTION_DATE_INVALID: "La date de la prochaine action doit être valide et postérieure à celle du suivi.", FOLLOW_UP_CADENCE_INVALID: "La cadence doit être un nombre entier positif de jours, avec une échéance calculable. Vérifie aussi la configuration du service.",
  FOLLOW_UP_CADENCE_NOT_APPLICABLE: "La cadence personnalisée peut être modifiée uniquement pour un abonnement actif ou en pause.", FOLLOW_UP_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.",
  FOLLOW_UP_ROUTE_UNEXPECTED_FAILURE: "L’action n’a pas pu être confirmée. Actualise les suivis avant de réessayer.",
};
export function followUpErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data.error : undefined;
  const common = commonApiErrorMessage(code);
  if (common) return common;
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code as FollowUpErrorCode] : "Impossible de charger les suivis. Réessaie dans un instant.";
}

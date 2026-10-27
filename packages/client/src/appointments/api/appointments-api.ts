import axios, { AxiosHeaders } from "axios";
import {
  appointmentApiRoutes,
  authCsrfHeaderName,
  type AppointmentAction,
  type AppointmentDetailResponse,
  type AppointmentErrorCode,
  type AppointmentListResponse,
  type AppointmentResponseLinkResponse,
  type PublicAppointmentResponse,
  type PublicAppointmentResponseInput,
  type ScheduleAppointmentInput,
  type RescheduleAppointmentInput,
  type CompleteAppointmentInput,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import {
  commonApiErrorMessage,
  type ApiErrorAudience,
} from "../../lib/api-error-messages.js";
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: { accept: "application/json" },
});
http.interceptors.request.use((config) => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers),
      token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});
const path = (route: string, id: string) =>
  route
    .replace(":subscriptionId", encodeURIComponent(id))
    .replace(":appointmentId", encodeURIComponent(id));
export const appointmentsApi = {
  async list(id: string) {
    return (
      await http.get<AppointmentListResponse>(
        path(appointmentApiRoutes.list, id),
      )
    ).data;
  },
  async schedule(id: string, input: ScheduleAppointmentInput) {
    return (
      await http.post<AppointmentDetailResponse>(
        path(appointmentApiRoutes.list, id),
        input,
      )
    ).data;
  },
  async command(
    id: string,
    action: Exclude<AppointmentAction, "response-link">,
    input:
      | RescheduleAppointmentInput
      | CompleteAppointmentInput
      | { reason: string }
      | Record<string, never>,
  ) {
    return (
      await http.post<AppointmentDetailResponse>(
        path(appointmentApiRoutes[action], id),
        input,
      )
    ).data;
  },
  async link(id: string, expiresAt: string) {
    return (
      await http.post<AppointmentResponseLinkResponse>(
        path(appointmentApiRoutes["response-link"], id),
        { expiresAt },
      )
    ).data;
  },
  async publicGet(token: string) {
    return (
      await http.get<PublicAppointmentResponse>(
        appointmentApiRoutes.public.replace(
          ":token",
          encodeURIComponent(token),
        ),
      )
    ).data;
  },
  async publicSubmit(token: string, input: PublicAppointmentResponseInput) {
    return (
      await http.post<PublicAppointmentResponse>(
        appointmentApiRoutes.public.replace(
          ":token",
          encodeURIComponent(token),
        ),
        input,
      )
    ).data;
  },
};
const messages: Record<AppointmentErrorCode, string> = {
  APPOINTMENT_NOT_FOUND: "Ce rendez-vous ou cet abonnement est introuvable.",
  APPOINTMENT_INVALID_INPUT:
    "Vérifie les dates, le motif et les informations saisies.",
  APPOINTMENT_TRANSITION_INVALID:
    "Cette action n’est plus disponible dans l’état actuel. Actualise les rendez-vous.",
  APPOINTMENT_SUBSCRIPTION_NOT_ACTIVE:
    "L’abonnement doit être actif pour planifier ou reporter un rendez-vous.",
  APPOINTMENT_COMPONENT_INVALID:
    "La prestation sélectionnée n’appartient pas à cet abonnement.",
  APPOINTMENT_COMPONENT_EXHAUSTED:
    "Le nombre de séances convenues est épuisé. Aucune séance supplémentaire n’a été consommée.",
  APPOINTMENT_DUPLICATE_SLOT:
    "Ce créneau existe déjà pour cet abonnement et cette prestation.",
  APPOINTMENT_TOO_EARLY:
    "Le rendez-vous n’a pas encore atteint l’heure requise. Une fin anticipée nécessite une dérogation motivée.",
  APPOINTMENT_REPLACEMENT_EXISTS:
    "Ce rendez-vous possède déjà un remplacement.",
  APPOINTMENT_COMPONENT_NOT_CONSUMED:
    "Aucune séance consommée ne peut être restaurée pour ce rendez-vous.",
  APPOINTMENT_COMPONENT_ALREADY_RESTORED: "La séance a déjà été restaurée.",
  APPOINTMENT_TOKEN_INVALID:
    "Ce lien est invalide. Demande un nouveau lien au coach.",
  APPOINTMENT_TOKEN_EXPIRED:
    "Ce lien a expiré. Demande un nouveau lien au coach.",
  APPOINTMENT_TOKEN_REVOKED:
    "Ce lien a été remplacé ou révoqué. Utilise le dernier lien fourni par le coach.",
  APPOINTMENT_TOKEN_CONSUMED:
    "Une réponse a déjà été enregistrée avec ce lien. Contacte le coach pour un nouveau changement.",
  APPOINTMENT_POLICY_INVALID:
    "La politique d’annulation du service est incohérente. Vérifie sa configuration.",
  APPOINTMENT_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.",
  APPOINTMENT_RATE_LIMITED:
    "Trop de tentatives. Patiente une minute avant de réessayer.",
  APPOINTMENT_ROUTE_UNEXPECTED_FAILURE:
    "L’action n’a pas pu être confirmée. Actualise avant de réessayer.",
};
export function appointmentErrorMessage(
  error: unknown,
  audience: ApiErrorAudience = "admin",
): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error)
    ? error.response?.data.error
    : undefined;
  const common = commonApiErrorMessage(code, audience);
  if (common) return common;
  return typeof code === "string" && Object.hasOwn(messages, code)
    ? messages[code as AppointmentErrorCode]
    : "Impossible de charger les rendez-vous. Réessaie dans un instant.";
}

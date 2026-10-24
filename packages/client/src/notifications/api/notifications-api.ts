import axios, { AxiosHeaders } from "axios";
import {
  authCsrfHeaderName,
  notificationApiRoutes,
  type NotificationErrorCode,
  type NotificationListResponse,
  type NotificationListView,
  type NotificationReadAllResponse,
  type NotificationReadResponse,
  type NotificationSettings,
  type NotificationSettingsResponse,
  type NotificationUnreadCountResponse,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
http.interceptors.request.use((config) => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers), token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});

/** S7.2 in-app notifications. The server only ever returns the session user's own rows. */
export const notificationsApi = {
  async list(view: NotificationListView, cursor?: string | null): Promise<NotificationListResponse> {
    return (await http.get<NotificationListResponse>(notificationApiRoutes.list, { params: { vue: view, ...(cursor ? { curseur: cursor } : {}) } })).data;
  },
  async unreadCount(): Promise<NotificationUnreadCountResponse> {
    return (await http.get<NotificationUnreadCountResponse>(notificationApiRoutes.unreadCount)).data;
  },
  async read(id: string): Promise<NotificationReadResponse> {
    return (await http.post<NotificationReadResponse>(notificationApiRoutes.read.replace(":notificationId", encodeURIComponent(id)), {})).data;
  },
  async readAll(): Promise<NotificationReadAllResponse> {
    return (await http.post<NotificationReadAllResponse>(notificationApiRoutes.readAll, {})).data;
  },
  async settings(): Promise<NotificationSettingsResponse> {
    return (await http.get<NotificationSettingsResponse>(notificationApiRoutes.settings)).data;
  },
  async updateSettings(settings: Partial<NotificationSettings>): Promise<NotificationSettingsResponse> {
    return (await http.put<NotificationSettingsResponse>(notificationApiRoutes.settings, { settings })).data;
  },
};

export const notificationKeys = {
  all: ["notifications"] as const,
  unread: ["notifications", "unread-count"] as const,
  list: (view: NotificationListView) => ["notifications", "list", view] as const,
  settings: ["notifications", "settings"] as const,
};

const messages: Record<NotificationErrorCode, string> = {
  NOTIFICATION_INVALID_INPUT: "La demande est invalide. Actualise la page.",
  NOTIFICATION_NOT_FOUND: "Cette notification est introuvable. La liste a été actualisée.",
  NOTIFICATION_ADMIN_FORBIDDEN: "Cet espace est réservé à l'administrateur.",
  NOTIFICATION_SETTINGS_INVALID: "Un réglage est invalide. Vérifie les valeurs saisies.",
  NOTIFICATION_ROUTE_UNEXPECTED_FAILURE: "L'action n'a pas pu être confirmée. Réessaie dans un instant.",
};

export function notificationErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data?.error : undefined;
  if (code === "AUTH_SESSION_REQUIRED") return "Ta session a expiré. Reconnecte-toi.";
  if (code === "AUTH_CSRF_INVALID" || code === "AUTH_ORIGIN_INVALID") return "La session de sécurité a expiré. Actualise la page.";
  return typeof code === "string" && code in messages ? messages[code as NotificationErrorCode] : "Impossible de charger les notifications. Réessaie dans un instant.";
}

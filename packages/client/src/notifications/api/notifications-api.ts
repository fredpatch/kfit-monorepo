import {
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
import { apiErrorCode, apiHttpClient } from "../../shared/api/http-client.js";
import { commonApiErrorMessage } from "../../lib/api-error-messages.js";

/** S7.2 in-app notifications. The server only ever returns the session user's own rows. */
export const notificationsApi = {
  async list(
    view: NotificationListView,
    cursor?: string | null,
  ): Promise<NotificationListResponse> {
    return (
      await apiHttpClient.getNotificationListResponse>(notificationApiRoutes.list, {
        params: { vue: view, ...(cursor ? { curseur: cursor } : {}) },
      })
    ).data;
  },
  async unreadCount(): Promise<NotificationUnreadCountResponse> {
    return (
      await apiHttpClient.getNotificationUnreadCountResponse>(
        notificationApiRoutes.unreadCount,
      )
    ).data;
  },
  async read(id: string): Promise<NotificationReadResponse> {
    return (
      await apiHttpClient.postNotificationReadResponse>(
        notificationApiRoutes.read.replace(
          ":notificationId",
          encodeURIComponent(id),
        ),
        {},
      )
    ).data;
  },
  async readAll(): Promise<NotificationReadAllResponse> {
    return (
      await apiHttpClient.postNotificationReadAllResponse>(
        notificationApiRoutes.readAll,
        {},
      )
    ).data;
  },
  async settings(): Promise<NotificationSettingsResponse> {
    return (
      await apiHttpClient.getNotificationSettingsResponse>(
        notificationApiRoutes.settings,
      )
    ).data;
  },
  async updateSettings(
    settings: Partial<NotificationSettings>,
  ): Promise<NotificationSettingsResponse> {
    return (
      await apiHttpClient.putNotificationSettingsResponse>(
        notificationApiRoutes.settings,
        { settings },
      )
    ).data;
  },
};

export const notificationKeys = {
  all: ["notifications"] as const,
  unread: ["notifications", "unread-count"] as const,
  list: (view: NotificationListView) =>
    ["notifications", "list", view] as const,
  settings: ["notifications", "settings"] as const,
};

const messages: Record<NotificationErrorCode, string> = {
  NOTIFICATION_INVALID_INPUT: "La demande est invalide. Actualise la page.",
  NOTIFICATION_NOT_FOUND:
    "Cette notification est introuvable. La liste a été actualisée.",
  NOTIFICATION_ADMIN_FORBIDDEN: "Cet espace est réservé à l'administrateur.",
  NOTIFICATION_SETTINGS_INVALID:
    "Un réglage est invalide. Vérifie les valeurs saisies.",
  NOTIFICATION_ROUTE_UNEXPECTED_FAILURE:
    "L'action n'a pas pu être confirmée. Réessaie dans un instant.",
};

export function notificationErrorMessage(error: unknown): string {
  const code = apiErrorCode(error);
  const common = commonApiErrorMessage(code);
  if (common) return common;
  return typeof code === "string" && code in messages
    ? messages[code as NotificationErrorCode]
    : "Impossible de charger les notifications. Réessaie dans un instant.";
}

import {
  notificationListViews,
  parseNotificationSettingsUpdate,
  type NotificationErrorCode,
  type NotificationListView,
} from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type {
  AuthHttpRequestContext,
  HttpJsonResponse,
} from "../../auth/types/auth.http.types.js";
import type { DrizzleNotificationsRepository } from "../repositories/notifications.repository.js";

export type NotificationAction =
  | "list"
  | "unread_count"
  | "read"
  | "read_all"
  | "settings_get"
  | "settings_put";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (
  status: number,
  error: NotificationErrorCode,
): HttpJsonResponse => ({ status, body: { error } });

function parseCursor(
  raw: unknown,
): { at: Date; id: string } | null | "invalid" {
  if (raw === undefined) return null;
  if (typeof raw !== "string" || raw.length > 200) return "invalid";
  const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const at = new Date(iso ?? "");
  return Number.isFinite(at.getTime()) && id && uuidPattern.test(id)
    ? { at, id }
    : "invalid";
}

/** Admin-only (same workspace rule as the dashboard). A user only ever sees and marks their own notifications. */
export class NotificationsController {
  constructor(
    private readonly repository: Pick<
      DrizzleNotificationsRepository,
      | "list"
      | "counts"
      | "markRead"
      | "markAllRead"
      | "settings"
      | "updateSettings"
    >,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async handle(
    context: AuthHttpRequestContext,
    action: NotificationAction,
    input: {
      id?: string | undefined;
      query?: Record<string, unknown>;
      body?: unknown;
    },
  ): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin"))
      return fail(403, "NOTIFICATION_ADMIN_FORBIDDEN");
    const actor = {
      userId: auth.session.userId,
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    };
    switch (action) {
      case "list": {
        const query = input.query ?? {};
        if (Object.keys(query).some((k) => k !== "vue" && k !== "curseur"))
          return fail(400, "NOTIFICATION_INVALID_INPUT");
        const view = (query.vue ?? "active") as NotificationListView;
        if (!notificationListViews.includes(view))
          return fail(400, "NOTIFICATION_INVALID_INPUT");
        const cursor = parseCursor(query.curseur);
        if (cursor === "invalid" || (cursor && view === "active"))
          return fail(400, "NOTIFICATION_INVALID_INPUT");
        const page = await this.repository.list(
          auth.session.userId,
          view,
          cursor,
          30,
        );
        return { status: 200, body: { view, ...page } };
      }
      case "unread_count":
        return {
          status: 200,
          body: await this.repository.counts(auth.session.userId),
        };
      case "read": {
        if (!input.id || !uuidPattern.test(input.id) || !emptyBody(input.body))
          return fail(400, "NOTIFICATION_INVALID_INPUT");
        const item = await this.repository.markRead(
          input.id,
          actor,
          this.clock(),
        );
        return item
          ? { status: 200, body: { notification: item } }
          : fail(404, "NOTIFICATION_NOT_FOUND");
      }
      case "read_all":
        if (!emptyBody(input.body))
          return fail(400, "NOTIFICATION_INVALID_INPUT");
        return {
          status: 200,
          body: {
            updated: await this.repository.markAllRead(actor, this.clock()),
          },
        };
      case "settings_get": {
        const { settings, updatedAt } = await this.repository.settings();
        return {
          status: 200,
          body: { settings, updatedAt: updatedAt?.toISOString() ?? null },
        };
      }
      case "settings_put": {
        const update = parseNotificationSettingsUpdate(input.body);
        if (!update) return fail(400, "NOTIFICATION_SETTINGS_INVALID");
        const { settings, updatedAt } = await this.repository.updateSettings(
          update,
          actor,
          this.clock(),
        );
        return {
          status: 200,
          body: { settings, updatedAt: updatedAt?.toISOString() ?? null },
        };
      }
    }
  }
}

function emptyBody(body: unknown) {
  return (
    body === undefined ||
    (typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      Object.keys(body).length === 0)
  );
}

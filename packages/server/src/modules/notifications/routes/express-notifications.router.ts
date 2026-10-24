import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { notificationApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { NotificationAction, NotificationsController } from "../controllers/notifications.controller.js";

// audit_events.request_id is a uuid column: a free-form X-Request-Id would make audited writes fail, so it is only reused when valid.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createExpressNotificationsRouter(deps: { controller: NotificationsController; resolveSession: ExpressAuthSessionResolver }) {
  const router = Router();
  const handle = (action: NotificationAction) => async (request: Request, response: Response) => {
    response.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    try {
      const headers: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
      const context: AuthHttpRequestContext = { requestId: uuidPattern.test(headers["x-request-id"] ?? "") ? headers["x-request-id"]! : randomUUID(), method: request.method as AuthHttpRequestContext["method"], path: request.path, headers,
        cookies: parseCookieHeader(headers.cookie), ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null, session: await deps.resolveSession(request) };
      const guard = request.method === "GET" ? null : requireSameOrigin(context) ?? requireCsrf(context);
      const result = guard ?? await deps.controller.handle(context, action, {
        id: typeof request.params.notificationId === "string" ? request.params.notificationId : undefined,
        query: request.query as Record<string, unknown>, body: request.body,
      });
      response.status(result.status).json(result.body);
    } catch {
      response.status(500).json({ error: "NOTIFICATION_ROUTE_UNEXPECTED_FAILURE" });
    }
  };
  router.get(notificationApiRoutes.list, handle("list"));
  router.get(notificationApiRoutes.unreadCount, handle("unread_count"));
  router.post(notificationApiRoutes.readAll, handle("read_all"));
  router.post(notificationApiRoutes.read, handle("read"));
  router.get(notificationApiRoutes.settings, handle("settings_get"));
  router.put(notificationApiRoutes.settings, handle("settings_put"));
  return router;
}

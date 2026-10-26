import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { subscriptionApiRoutes, subscriptionCommands } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { SubscriptionsController } from "../controllers/subscriptions.controller.js";
import type { LifecycleCommand } from "../services/subscriptions.service.js";

export function createExpressSubscriptionsRouter(deps: { controller: SubscriptionsController; resolveSession: ExpressAuthSessionResolver }) {
  const router = Router();
  function handle(action: LifecycleCommand["action"]) {
    return async (request: Request, response: Response) => {
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
        const context: AuthHttpRequestContext = {
          requestId: headers["x-request-id"] ?? randomUUID(), method: request.method as AuthHttpRequestContext["method"], path: request.path,
          headers, cookies: parseCookieHeader(headers.cookie), session: await deps.resolveSession(request), ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null,
        };
        const guard = requireSameOrigin(context) ?? (action === "read" ? null : requireCsrf(context));
        const id = typeof request.params.subscriptionId === "string" ? request.params.subscriptionId : "";
        const result = guard ?? await deps.controller.execute(context, id, action, action === "read" ? {} : request.body ?? {});
        response.status(result.status).json(result.body);
      } catch (error) { if (!respondIfSubjectArchived(response, error)) response.status(500).json({ error: "SUBSCRIPTION_ROUTE_UNEXPECTED_FAILURE" }); }
    };
  }
  router.get(subscriptionApiRoutes.detail, handle("read"));
  for (const action of subscriptionCommands) router.post(subscriptionApiRoutes[action], handle(action));
  return router;
}

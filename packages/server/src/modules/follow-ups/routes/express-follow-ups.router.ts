import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { followUpApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import {
  requireCsrf,
  requireSameOrigin,
} from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { FollowUpsController } from "../controllers/follow-ups.controller.js";
import type { FollowUpCommand } from "../services/follow-ups.service.js";
export function createExpressFollowUpsRouter(deps: {
  controller: FollowUpsController;
  resolveSession: ExpressAuthSessionResolver;
}) {
  const router = Router();
  function handle(action: FollowUpCommand["action"]) {
    return async (request: Request, response: Response) => {
      response.set("Cache-Control", "no-store");
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers))
          headers[key] = Array.isArray(value) ? value[0] : value;
        const context: AuthHttpRequestContext = {
          requestId: randomUUID(),
          method: request.method as AuthHttpRequestContext["method"],
          path: request.path,
          headers,
          cookies: parseCookieHeader(headers.cookie),
          session: await deps.resolveSession(request),
          ipAddress: request.ip ?? null,
          userAgent: headers["user-agent"] ?? null,
        };
        const guard =
          requireSameOrigin(context) ??
          (request.method === "GET" ? null : requireCsrf(context));
        const param =
          action === "complete" || action === "cancel"
            ? request.params.followUpId
            : request.params.subscriptionId;
        const result =
          guard ??
          (await deps.controller.execute(
            context,
            typeof param === "string" ? param : "",
            action,
            request.method === "GET" ? {} : (request.body ?? {}),
          ));
        response.status(result.status).json(result.body);
      } catch (error) {
        if (!respondIfSubjectArchived(response, error))
          response
            .status(500)
            .json({ error: "FOLLOW_UP_ROUTE_UNEXPECTED_FAILURE" });
      }
    };
  }
  router.get(followUpApiRoutes.queue, handle("queue"));
  router.get(followUpApiRoutes.list, handle("read"));
  router.post(followUpApiRoutes.list, handle("create"));
  router.post(followUpApiRoutes.complete, handle("complete"));
  router.post(followUpApiRoutes.cancel, handle("cancel"));
  router.put(followUpApiRoutes.cadence, handle("cadence"));
  return router;
}

import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { progressApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { ProgressController } from "../controllers/progress.controller.js";
import type { ProgressCommand } from "../services/progress.service.js";
export function createExpressProgressRouter(deps: { controller: ProgressController; resolveSession: ExpressAuthSessionResolver }) {
  const router = Router();
  function handle(action: ProgressCommand["action"]) {
    return async (request: Request, response: Response) => {
      response.set("Cache-Control", "no-store");
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
        const context: AuthHttpRequestContext = { requestId: randomUUID(), method: request.method as AuthHttpRequestContext["method"], path: request.path, headers,
          cookies: parseCookieHeader(headers.cookie), session: await deps.resolveSession(request), ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null };
        const guard = requireSameOrigin(context) ?? (request.method === "GET" ? null : requireCsrf(context));
        const param = request.params.goalId ?? request.params.subscriptionId;
        const result = guard ?? await deps.controller.execute(context, typeof param === "string" ? param : "", action, request.method === "GET" ? {} : request.body ?? {});
        response.status(result.status).json(result.body);
      } catch (error) { if (!respondIfSubjectArchived(response, error)) response.status(500).json({ error: "PROGRESS_ROUTE_UNEXPECTED_FAILURE" }); }
    };
  }
  router.get(progressApiRoutes.progress, handle("progress"));
  router.post(progressApiRoutes.measurements, handle("measurement"));
  router.get(progressApiRoutes.goals, handle("goals")); router.post(progressApiRoutes.goals, handle("create-goal"));
  router.post(progressApiRoutes.pause, handle("pause")); router.post(progressApiRoutes.resume, handle("resume"));
  router.post(progressApiRoutes.cancel, handle("cancel")); router.post(progressApiRoutes.confirmOutcome, handle("confirm-outcome"));
  return router;
}

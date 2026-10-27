import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { supervisionApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import {
  requireCsrf,
  requireSameOrigin,
} from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type {
  SupervisionAction,
  SupervisionController,
} from "../controllers/supervision.controller.js";
import { logger } from "../../../logging/logger.js";

// audit_events.request_id is a uuid column: only a valid X-Request-Id is reused.
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O1: GET without CSRF; POST with same-origin and CSRF. */
export function createExpressSupervisionRouter(deps: {
  controller: SupervisionController;
  resolveSession: ExpressAuthSessionResolver;
}) {
  const router = Router();
  const handle =
    (action: SupervisionAction) =>
    async (request: Request, response: Response) => {
      response.set({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers))
          headers[key] = Array.isArray(value) ? value[0] : value;
        const context: AuthHttpRequestContext = {
          requestId: uuidPattern.test(headers["x-request-id"] ?? "")
            ? headers["x-request-id"]!
            : randomUUID(),
          method: request.method as AuthHttpRequestContext["method"],
          path: request.path,
          headers,
          cookies: parseCookieHeader(headers.cookie),
          ipAddress: request.ip ?? null,
          userAgent: headers["user-agent"] ?? null,
          session: await deps.resolveSession(request),
        };
        const guard =
          request.method === "GET"
            ? null
            : (requireSameOrigin(context) ?? requireCsrf(context));
        const result =
          guard ??
          (await deps.controller.handle(context, action, {
            jobKey:
              typeof request.params.jobKey === "string"
                ? request.params.jobKey
                : undefined,
            query: request.query as Record<string, unknown>,
          }));
        response.status(result.status).json(result.body);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "no code";
        logger.error(
          `supervision ${action} failed: ${error instanceof Error ? error.name : typeof error} (${code})`,
        );
        response
          .status(500)
          .json({ error: "SUPERVISION_ROUTE_UNEXPECTED_FAILURE" });
      }
    };
  router.get(supervisionApiRoutes.overview, handle("overview"));
  router.get(supervisionApiRoutes.status, handle("status"));
  router.get(supervisionApiRoutes.security, handle("security"));
  // Registered before :jobKey/run so « privacy.purge/simulate » is never read as a job key.
  router.post(supervisionApiRoutes.simulatePurge, handle("simulate_purge"));
  router.post(supervisionApiRoutes.runJob, handle("run_job"));
  return router;
}

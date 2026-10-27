import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { devToolsApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import {
  requireCsrf,
  requireSameOrigin,
} from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type {
  DevToolsAction,
  DevToolsController,
} from "../controllers/dev-tools.controller.js";
import { logger } from "../../../logging/logger.js";

// audit_events.request_id is a uuid column: a free-form X-Request-Id would make audited writes fail, so it is only reused when valid.
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** TEST-01 D4: mounted by dev-app.ts only. */
export function createExpressDevToolsRouter(deps: {
  controller: DevToolsController;
  resolveSession: ExpressAuthSessionResolver;
}) {
  const router = Router();
  const handle =
    (action: DevToolsAction) =>
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
            body: request.body,
          }));
        response.status(result.status).json(result.body);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "no code";
        logger.error(
          `dev tools ${action} failed: ${error instanceof Error ? error.name : typeof error} (${code})`,
        );
        response
          .status(500)
          .json({ error: "DEV_TOOLS_ROUTE_UNEXPECTED_FAILURE" });
      }
    };
  router.get(devToolsApiRoutes.testData, handle("test_data_analyse"));
  router.post(devToolsApiRoutes.testDataPurge, handle("test_data_purge"));
  return router;
}

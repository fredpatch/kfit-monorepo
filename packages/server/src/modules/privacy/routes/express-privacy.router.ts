import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { privacyApiRoutes } from "@kfit/shared";
import { logger } from "../../../logging/logger.js";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { PrivacyAction, PrivacyController } from "../controllers/privacy.controller.js";

// audit_events.request_id is a uuid column: a free-form X-Request-Id would make audited writes fail, so it is only reused when valid.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createExpressPrivacyRouter(deps: { controller: PrivacyController; resolveSession: ExpressAuthSessionResolver }) {
  const router = Router();
  const handle = (action: PrivacyAction, param?: string) => async (request: Request, response: Response) => {
    response.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    try {
      const headers: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
      const context: AuthHttpRequestContext = { requestId: uuidPattern.test(headers["x-request-id"] ?? "") ? headers["x-request-id"]! : randomUUID(), method: request.method as AuthHttpRequestContext["method"], path: request.path, headers,
        cookies: parseCookieHeader(headers.cookie), ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null, session: await deps.resolveSession(request) };
      const guard = request.method === "GET" ? null : requireSameOrigin(context) ?? requireCsrf(context);
      const id = param ? request.params[param] : undefined;
      const result = guard ?? await deps.controller.handle(context, action, { id: typeof id === "string" ? id : undefined, query: request.query as Record<string, unknown>, body: request.body });
      response.status(result.status).json(result.body);
    } catch (error) {
      // Error type and pg SQLSTATE only: messages can carry names, notes or health data; the typed confirmation is never logged (D9).
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "no code";
      logger.error(`privacy ${action} failed: ${error instanceof Error ? error.name : typeof error} (${code})`);
      response.status(500).json({ error: "PRIVACY_ROUTE_UNEXPECTED_FAILURE" });
    }
  };
  router.post(privacyApiRoutes.archiveCustomer, handle("archive_customer", "customerId"));
  router.post(privacyApiRoutes.archiveProspect, handle("archive_prospect", "prospectId"));
  router.post(privacyApiRoutes.anonymizeCustomer, handle("anonymize_customer", "customerId"));
  router.post(privacyApiRoutes.anonymizeProspect, handle("anonymize_prospect", "prospectId"));
  router.get(privacyApiRoutes.holds, handle("holds_list"));
  router.post(privacyApiRoutes.holds, handle("hold_create"));
  router.post(privacyApiRoutes.releaseHold, handle("hold_release", "holdId"));
  return router;
}

import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { consentApiRoutes, consentDefinitionApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { ConsentController } from "../controllers/consent.controller.js";
import type { ConsentCommand, ConsentDefinitionCommand } from "../services/consent.service.js";
type DefinitionAction = ConsentDefinitionCommand["action"];
const definitionActions: readonly DefinitionAction[] = ["definitions_list", "definition_read", "definition_create", "definition_update", "definition_delete", "definition_impact", "definition_publish"];
const isDefinitionAction = (action: string): action is DefinitionAction => definitionActions.some(known => known === action);

export function createExpressConsentRouter(deps: { controller: ConsentController; resolveSession: ExpressAuthSessionResolver; rateLimiter?: IpRateLimiter }) {
  const router = Router();
  const limiter = deps.rateLimiter ?? new IpRateLimiter({ windowMs: 60_000, maxPerWindow: 30 });
  const parameter = (request: Request, name: string) => typeof request.params[name] === "string" ? request.params[name] : "";
  function handle(action: ConsentCommand["action"] | DefinitionAction | "public_read" | "public_submit") {
    return async (request: Request, res: Response) => {
      res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
        const isPublic = action === "public_read" || action === "public_submit";
        const context: AuthHttpRequestContext = { requestId: randomUUID(), method: request.method as AuthHttpRequestContext["method"], path: isPublic ? "/public/consents/[redacted]" : request.path,
          headers, cookies: parseCookieHeader(headers.cookie), session: isPublic ? null : await deps.resolveSession(request), ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null };
        if (isPublic && !limiter.allow(request.ip ?? "unknown")) { res.status(429).json({ error: "CONSENT_RATE_LIMITED" }); return; }
        const guard = request.method === "GET" ? null : requireSameOrigin(context) ?? (isPublic ? null : requireCsrf(context));
        const result = guard ?? (isPublic
          ? await deps.controller.publicAccess(parameter(request, "token"), request.body, action === "public_submit", { userId: null, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null })
          : isDefinitionAction(action) ? await deps.controller.definitions(context, action, request.body ?? {}, parameter(request, "definitionId"))
          : await deps.controller.execute(context, parameter(request, "subscriptionId"), action, request.body ?? {}, parameter(request, action === "revoke" ? "consentType" : "tokenId")));
        res.status(result.status).json(result.body);
      } catch { res.status(500).json({ error: "CONSENT_ROUTE_UNEXPECTED_FAILURE" }); }
    };
  }
  router.get(consentApiRoutes.detail, handle("read"));
  router.post(consentApiRoutes.link, handle("issue"));
  router.post(consentApiRoutes.revokeLink, handle("revoke_link"));
  router.post(consentApiRoutes.capture, handle("capture"));
  router.post(consentApiRoutes.optionalLink, handle("issue_optional"));
  router.post(consentApiRoutes.optionalCapture, handle("capture_optional"));
  router.get(consentDefinitionApiRoutes.list, handle("definitions_list"));
  router.post(consentDefinitionApiRoutes.list, handle("definition_create"));
  router.get(consentDefinitionApiRoutes.detail, handle("definition_read"));
  router.patch(consentDefinitionApiRoutes.detail, handle("definition_update"));
  router.delete(consentDefinitionApiRoutes.detail, handle("definition_delete"));
  router.get(consentDefinitionApiRoutes.publishImpact, handle("definition_impact"));
  router.post(consentDefinitionApiRoutes.publish, handle("definition_publish"));
  router.post(consentApiRoutes.revoke, handle("revoke"));
  router.get(consentApiRoutes.public, handle("public_read"));
  router.post(consentApiRoutes.public, handle("public_submit"));
  return router;
}

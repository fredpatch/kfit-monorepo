import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { questionnaireApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { QuestionnaireController } from "../controllers/questionnaire.controller.js";
import type { QuestionnaireCommand, TemplateCommand } from "../services/questionnaire.service.js";
export function createExpressQuestionnaireRouter(deps: { controller: QuestionnaireController; resolveSession: ExpressAuthSessionResolver; rateLimiter?: IpRateLimiter }) {
  const router = Router(); const limiter = deps.rateLimiter ?? new IpRateLimiter({ windowMs: 60000, maxPerWindow: 30 });
  const param = (request: Request, key: string) => typeof request.params[key] === "string" ? request.params[key] : "";
  function handle(action: QuestionnaireCommand["action"] | TemplateCommand["action"] | "public_read" | "public_submit") {
    return async (request: Request, res: Response) => {
      res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
        const isPublic = action === "public_read" || action === "public_submit";
        const context: AuthHttpRequestContext = { requestId: randomUUID(), method: request.method as AuthHttpRequestContext["method"], path: isPublic ? "/public/questionnaires/[redacted]" : request.path,
          headers, cookies: parseCookieHeader(headers.cookie), session: isPublic ? null : await deps.resolveSession(request), ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null };
        if (isPublic && !limiter.allow(request.ip ?? "unknown")) { res.status(429).json({ error: "QUESTIONNAIRE_RATE_LIMITED" }); return; }
        const guard = request.method === "GET" ? null : requireSameOrigin(context) ?? (isPublic ? null : requireCsrf(context));
        const result = guard ?? (isPublic ? await deps.controller.publicAccess(param(request, "token"), request.body, action === "public_submit", { userId: null, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null })
          : await deps.controller.admin(context, action, request.body ?? {}, param(request, "subscriptionId"), param(request, action === "revoke_link" ? "tokenId" : action === "view_answers" ? "submissionId" : "templateId")));
        res.status(result.status).json(result.body);
      } catch (error) { if (!respondIfSubjectArchived(res, error)) res.status(500).json({ error: "QUESTIONNAIRE_ROUTE_UNEXPECTED_FAILURE" }); }
    };
  }
  router.get(questionnaireApiRoutes.templates, handle("list")); router.post(questionnaireApiRoutes.templates, handle("create"));
  router.get(questionnaireApiRoutes.assignments, handle("assignment_list")); router.post(questionnaireApiRoutes.assignments, handle("assignment_set"));
  router.post(questionnaireApiRoutes.publish, handle("publish")); router.post(questionnaireApiRoutes.newVersion, handle("new_version"));
  router.get(questionnaireApiRoutes.detail, handle("read")); router.get(questionnaireApiRoutes.revisionAnswers, handle("view_answers")); router.post(questionnaireApiRoutes.coachSubmit, handle("submit"));
  router.post(questionnaireApiRoutes.link, handle("issue")); router.post(questionnaireApiRoutes.revokeLink, handle("revoke_link"));
  router.get(questionnaireApiRoutes.public, handle("public_read")); router.post(questionnaireApiRoutes.public, handle("public_submit"));
  return router;
}

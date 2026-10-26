import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { quoteApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { QuotesController } from "../controllers/quotes.controller.js";
import type { QuoteAction } from "../services/quotes.service.js";

export function createExpressQuotesRouter(deps: { controller: QuotesController; resolveSession: ExpressAuthSessionResolver; rateLimiter?: IpRateLimiter; onRateLimited?: (() => void) | undefined }) {
  const router = Router(), limiter = deps.rateLimiter ?? new IpRateLimiter({ windowMs: 60000, maxPerWindow: 30, onRefused: deps.onRateLimited });
  function handle(action: QuoteAction, isPublic = false) {
    return async (req: Request, res: Response) => {
      res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
      if (isPublic && !limiter.allow(req.ip ?? "unknown")) { res.status(429).json({ error: "QUOTE_RATE_LIMITED" }); return; }
      try {
        const headers: Record<string, string | undefined> = {}; for (const [key, value] of Object.entries(req.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
        const context: AuthHttpRequestContext = { requestId: randomUUID(), method: req.method as AuthHttpRequestContext["method"], path: isPublic ? "/public/quotes/[redacted]" : req.path,
          headers, cookies: parseCookieHeader(headers.cookie), session: isPublic ? null : await deps.resolveSession(req), ipAddress: req.ip ?? null, userAgent: headers["user-agent"] ?? null };
        const guard = requireSameOrigin(context) ?? (!isPublic && req.method !== "GET" ? requireCsrf(context) : null);
        if (guard) { res.status(guard.status).json(guard.body); return; }
        const id = req.params.subscriptionId ?? req.params.quoteId ?? req.params.versionId ?? req.params.tokenId ?? req.params.token;
        const result = await deps.controller.execute(context, typeof id === "string" ? id : "", action, req.method === "GET" ? {} : req.body ?? {});
        if ("binary" in result) res.status(result.status).set({ "Content-Type": result.binary.mimeType, "Content-Disposition": `attachment; filename="${result.binary.filename.replace(/[\r\n"]/g, "_")}"` }).send(result.binary.bytes);
        else res.status(result.status).json(result.body);
      } catch (error) { if (!respondIfSubjectArchived(res, error)) res.status(500).json({ error: "QUOTE_ROUTE_UNEXPECTED_FAILURE" }); }
    };
  }
  router.get(quoteApiRoutes.list, handle("list")); router.get(quoteApiRoutes.detail, handle("read"));
  router.post(quoteApiRoutes.create, handle("create")); router.post(quoteApiRoutes.version, handle("version")); router.post(quoteApiRoutes.edit, handle("edit"));
  router.post(quoteApiRoutes.issue, handle("issue")); router.get(quoteApiRoutes.pdf, handle("pdf")); router.post(quoteApiRoutes.share, handle("share"));
  router.post(quoteApiRoutes.revoke, handle("revoke")); router.post(quoteApiRoutes.synchronize, handle("synchronize")); router.post(quoteApiRoutes.cancel, handle("cancel"));
  router.get(quoteApiRoutes.publicDetail, handle("public-read", true)); router.get(quoteApiRoutes.publicPdf, handle("public-pdf", true)); router.post(quoteApiRoutes.respond, handle("respond", true));
  return router;
}

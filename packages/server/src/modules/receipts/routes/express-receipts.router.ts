import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { receiptApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import {
  requireCsrf,
  requireSameOrigin,
} from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { ReceiptsController } from "../controllers/receipts.controller.js";
import type { ReceiptAction } from "../services/receipts.types.js";
export function createExpressReceiptsRouter(deps: {
  controller: ReceiptsController;
  resolveSession: ExpressAuthSessionResolver;
  rateLimiter?: IpRateLimiter;
  onRateLimited?: (() => void) | undefined;
}) {
  const router = Router(),
    limiter =
      deps.rateLimiter ??
      new IpRateLimiter({
        windowMs: 60000,
        maxPerWindow: 30,
        onRefused: deps.onRateLimited,
      });
  async function context(
    q: Request,
    publicAccess: boolean,
  ): Promise<AuthHttpRequestContext> {
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(q.headers))
      headers[k] = Array.isArray(v) ? v[0] : v;
    return {
      requestId: randomUUID(),
      method: q.method as AuthHttpRequestContext["method"],
      path: publicAccess ? "/public/receipts/[redacted]" : q.path,
      headers,
      cookies: parseCookieHeader(headers.cookie),
      session: publicAccess ? null : await deps.resolveSession(q),
      ipAddress: q.ip ?? null,
      userAgent: headers["user-agent"] ?? null,
    };
  }
  function handler(
    action: ReceiptAction,
    publicAccess = false,
  ): import("express").RequestHandler {
    return async (q, s) => {
      s.set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      if (publicAccess && !limiter.allow(q.ip ?? "unknown")) {
        s.status(429).json({ error: "RECEIPT_RATE_LIMITED" });
        return;
      }
      try {
        const c = await context(q, publicAccess),
          guard =
            requireSameOrigin(c) ??
            (!publicAccess && q.method !== "GET" ? requireCsrf(c) : null);
        if (guard) {
          s.status(guard.status).json(guard.body);
          return;
        }
        const id =
          q.params.subscriptionId ??
          q.params.paymentEventId ??
          q.params.receiptId ??
          q.params.tokenId ??
          q.params.token;
        const result = await deps.controller.execute(
          c,
          typeof id === "string" ? id : "",
          action,
          q.method === "GET" ? q.query : (q.body ?? {}),
        );
        if ("binary" in result)
          s.status(result.status)
            .set({
              "Content-Type": result.binary.mimeType,
              "Content-Disposition": `attachment; filename="${result.binary.filename.replace(/[\r\n"]/g, "_")}"`,
            })
            .send(result.binary.bytes);
        else s.status(result.status).json(result.body);
      } catch (error) {
        if (!respondIfSubjectArchived(s, error))
          s.status(500).json({ error: "RECEIPT_ROUTE_UNEXPECTED_FAILURE" });
      }
    };
  }
  router.get(receiptApiRoutes.list, handler("list"));
  router.get(receiptApiRoutes.detail, handler("read"));
  router.post(receiptApiRoutes.issue, handler("issue"));
  router.get(receiptApiRoutes.pdf, handler("pdf"));
  router.post(receiptApiRoutes.share, handler("share"));
  router.post(receiptApiRoutes.revoke, handler("revoke"));
  router.post(receiptApiRoutes.void, handler("void"));
  router.get(receiptApiRoutes.publicMetadata, handler("public-read", true));
  router.get(receiptApiRoutes.publicPdf, handler("public-pdf", true));
  return router;
}

import { randomUUID } from "node:crypto";
import { Router, raw, type Request, type Response } from "express";
import { paymentProofApiRoutes, paymentProofClaimsHeader } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { PaymentProofsController, ProofControllerResult } from "../controllers/payment-proofs.controller.js";
import type { ProofAction } from "../services/payment-proofs.types.js";
export function createExpressPaymentProofsRouter(deps: { controller: PaymentProofsController; resolveSession: ExpressAuthSessionResolver; rateLimiter?: IpRateLimiter }) {
  const router = Router(), limiter = deps.rateLimiter ?? new IpRateLimiter({ windowMs: 60000, maxPerWindow: 20 }), parse = raw({ type: () => true, limit: "11mb" });
  const id = (q: Request) => { const value = q.params.subscriptionId ?? q.params.proofId ?? q.params.tokenId ?? q.params.token; return typeof value === "string" ? value : ""; };
  async function context(q: Request, isPublic: boolean): Promise<AuthHttpRequestContext> {
    const headers: Record<string, string | undefined> = {}; for (const [k, v] of Object.entries(q.headers)) headers[k] = Array.isArray(v) ? v[0] : v;
    return { requestId: randomUUID(), method: q.method as AuthHttpRequestContext["method"], path: isPublic ? "/public/payment-proofs/[redacted]" : q.path, headers, cookies: parseCookieHeader(headers.cookie), session: isPublic ? null : await deps.resolveSession(q), ipAddress: q.ip ?? null, userAgent: headers["user-agent"] ?? null };
  }
  function send(s: Response, r: ProofControllerResult) {
    if ("binary" in r) s.status(r.status).set({ "Content-Type": r.binary.mimeType, "Content-Disposition": `attachment; filename="${r.binary.filename.replace(/[\r\n"]/g, "_")}"` }).send(r.binary.bytes);
    else s.status(r.status).json(r.body);
  }
  function handler(action: ProofAction | "upload", isPublic = false) {
    return async (q: Request, s: Response) => {
      s.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
      if (isPublic && !limiter.allow(q.ip ?? "unknown")) { s.status(429).json({ error: "PAYMENT_PROOF_RATE_LIMITED" }); return; }
      try {
        const c = await context(q, isPublic), guard = requireSameOrigin(c) ?? (!isPublic && q.method !== "GET" ? requireCsrf(c) : null);
        if (guard) { s.status(guard.status).json(guard.body); return; }
        if (action !== "upload") { send(s, await deps.controller.execute(c, id(q), action, q.method === "GET" ? q.query : q.body ?? {})); return; }
        let claims: unknown = null, filename = "";
        try {
          const value = q.headers[paymentProofClaimsHeader], name = q.headers["x-file-name"];
          if (typeof value === "string" && value.length <= 12000 && typeof name === "string" && name.length <= 3000 && !Object.keys(q.query).length) { claims = JSON.parse(decodeURIComponent(value)); filename = decodeURIComponent(name); }
        } catch { claims = null; }
        const upload = async (invalid = false) => send(s, await deps.controller.upload(c, id(q), claims, { bytes: !invalid && Buffer.isBuffer(q.body) ? q.body : Buffer.alloc(0), mimeType: q.headers["content-type"] ?? "", originalFilename: filename }));
        await new Promise<void>(resolve => { parse(q, s, error => { void upload(Boolean(error)).catch(() => { s.status(500).json({ error: "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE" }); }).finally(resolve); }); });
      } catch { s.status(500).json({ error: "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE" }); }
    };
  }
  router.get(paymentProofApiRoutes.list, handler("list")); router.get(paymentProofApiRoutes.detail, handler("read")); router.get(paymentProofApiRoutes.document, handler("document"));
  router.post(paymentProofApiRoutes.issueLink, handler("issue-link")); router.post(paymentProofApiRoutes.revokeLink, handler("revoke-link")); router.post(paymentProofApiRoutes.confirm, handler("confirm")); router.post(paymentProofApiRoutes.partiallyConfirm, handler("partially-confirm"));
  router.post(paymentProofApiRoutes.requestCorrection, handler("request-correction")); router.post(paymentProofApiRoutes.reject, handler("reject")); router.post(paymentProofApiRoutes.markDuplicate, handler("mark-duplicate"));
  router.get(paymentProofApiRoutes.publicMetadata, handler("metadata", true)); router.post(paymentProofApiRoutes.upload, handler("upload", true)); return router;
}

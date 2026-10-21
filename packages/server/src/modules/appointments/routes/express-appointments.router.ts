import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { appointmentActions, appointmentApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { AppointmentsController } from "../controllers/appointments.controller.js";
import type { AppointmentsService } from "../services/appointments.service.js";
export function createExpressAppointmentsRouter(deps: { controller: AppointmentsController; resolveSession: ExpressAuthSessionResolver; rateLimiter?: IpRateLimiter }) {
  const router = Router(), limiter = deps.rateLimiter ?? new IpRateLimiter({ windowMs: 60000, maxPerWindow: 30 });
  const param = (req: Request, name: string) => typeof req.params[name] === "string" ? req.params[name] : "";
  function handle(action: Parameters<AppointmentsService["admin"]>[1] | "public_read" | "public_submit") {
    return async (req: Request, res: Response) => {
      res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
      try {
        const headers: Record<string, string | undefined> = {}; for (const [key, value] of Object.entries(req.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
        const publicRequest = action === "public_read" || action === "public_submit";
        const context: AuthHttpRequestContext = { requestId: randomUUID(), method: req.method as AuthHttpRequestContext["method"], path: publicRequest ? "/public/appointments/[redacted]" : req.path,
          headers, cookies: parseCookieHeader(headers.cookie), session: publicRequest ? null : await deps.resolveSession(req), ipAddress: req.ip ?? null, userAgent: headers["user-agent"] ?? null };
        if (publicRequest && !limiter.allow(req.ip ?? "unknown")) { res.status(429).json({ error: "APPOINTMENT_RATE_LIMITED" }); return; }
        const guard = requireSameOrigin(context) ?? (req.method === "GET" || publicRequest ? null : requireCsrf(context));
        const result = guard ?? (action === "public_read" || action === "public_submit"
          ? await deps.controller.publicAccess(param(req, "token"), req.body, action === "public_submit", { userId: null, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null })
          : await deps.controller.admin(context, param(req, action === "list" || action === "schedule" ? "subscriptionId" : "appointmentId"), action, req.method === "GET" ? {} : req.body ?? {}));
        res.status(result.status).json(result.body);
      } catch { res.status(500).json({ error: "APPOINTMENT_ROUTE_UNEXPECTED_FAILURE" }); }
    };
  }
  router.get(appointmentApiRoutes.list, handle("list")); router.post(appointmentApiRoutes.list, handle("schedule")); router.get(appointmentApiRoutes.detail, handle("read"));
  for (const action of appointmentActions) router.post(appointmentApiRoutes[action], handle(action));
  router.get(appointmentApiRoutes.public, handle("public_read")); router.post(appointmentApiRoutes.public, handle("public_submit"));
  return router;
}

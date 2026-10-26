import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { financeApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { FinanceController } from "../controllers/finance.controller.js";
import type { FinanceCommand } from "../services/finance.service.js";
export function createExpressFinanceRouter(deps: { controller: FinanceController; resolveSession: ExpressAuthSessionResolver }) {
  const router = Router();
  function handle(action: FinanceCommand["action"]) {
    return async (request: Request, response: Response) => {
      response.set("Cache-Control", "no-store");
      try {
        const headers: Record<string, string | undefined> = {}; for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
        const context: AuthHttpRequestContext = { requestId: randomUUID(), method: request.method as AuthHttpRequestContext["method"], path: request.path, headers,
          cookies: parseCookieHeader(headers.cookie), session: await deps.resolveSession(request), ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null };
        const guard = requireSameOrigin(context) ?? (request.method === "GET" ? null : requireCsrf(context));
        const param = request.params.subscriptionId ?? request.params.paymentPlanId ?? request.params.paymentEventId;
        const result = guard ?? await deps.controller.execute(context, typeof param === "string" ? param : "", action, request.method === "GET" ? {} : request.body ?? {});
        response.status(result.status).json(result.body);
      } catch (error) { if (!respondIfSubjectArchived(response, error)) response.status(500).json({ error: "FINANCE_ROUTE_UNEXPECTED_FAILURE" }); }
    };
  }
  router.get(financeApiRoutes.detail, handle("read")); router.post(financeApiRoutes.plans, handle("create"));
  router.post(financeApiRoutes.activate, handle("activate")); router.post(financeApiRoutes.revise, handle("revise")); router.post(financeApiRoutes.cancel, handle("cancel"));
  router.post(financeApiRoutes.payments, handle("record")); router.post(financeApiRoutes.correct, handle("correct"));
  return router;
}

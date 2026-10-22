import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { dashboardApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { TodayController } from "../controllers/today.controller.js";

/** Read-only dashboard routes (UX-9). GET only: no CSRF needed. */
export function createExpressTodayRouter(deps: { controller: TodayController; resolveSession: ExpressAuthSessionResolver }) {
  const router = Router();
  const handler = (action: "agenda" | "today") => async (request: Request, response: Response) => {
    try {
      const headers: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
      const context: AuthHttpRequestContext = {
        requestId: headers["x-request-id"] ?? randomUUID(), method: "GET", path: request.path, headers, cookies: parseCookieHeader(headers.cookie),
        ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null, session: await deps.resolveSession(request),
      };
      const result = await deps.controller.handle(context, action, { du: request.query.du, au: request.query.au, statut: request.query.statut });
      response.status(result.status).json(result.body);
    } catch {
      response.status(500).json({ error: "DASHBOARD_ROUTE_UNEXPECTED_FAILURE" });
    }
  };
  router.get(dashboardApiRoutes.appointments, handler("agenda"));
  router.get(dashboardApiRoutes.today, handler("today"));
  return router;
}

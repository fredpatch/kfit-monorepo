import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { dashboardApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { DashboardAnalyticsController } from "../controllers/analytics.controller.js";

export function createExpressDashboardAnalyticsRouter(deps: { controller: DashboardAnalyticsController; resolveSession: ExpressAuthSessionResolver }) {
  const router = Router();
  const handler = (action: "analytics" | "alerts") => async (request: Request, response: Response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      const headers: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
      const result = await deps.controller.handle({ requestId: headers["x-request-id"] ?? randomUUID(), method: "GET", path: request.path, headers,
        cookies: parseCookieHeader(headers.cookie), ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null, session: await deps.resolveSession(request) }, action, { periode: request.query.periode });
      response.status(result.status).json(result.body);
    } catch { response.status(500).json({ error: "DASHBOARD_ROUTE_UNEXPECTED_FAILURE" }); }
  };
  router.get(dashboardApiRoutes.analytics, handler("analytics"));
  router.get(dashboardApiRoutes.alerts, handler("alerts"));
  return router;
}

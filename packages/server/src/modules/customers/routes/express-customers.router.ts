import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { adminCustomersApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { CustomersController } from "../controllers/customers.controller.js";

function input(action: "list" | "search" | "create" | "detail" | "analytics", request: Request): unknown {
  if (action === "search") return request.query.whatsapp;
  if (action === "detail") return request.params.customerId;
  if (action === "analytics") return { customerId: request.params.customerId, query: { periode: request.query.periode, abonnement: request.query.abonnement } };
  return request.body;
}

export function createExpressCustomersRouter(deps: { controller: CustomersController; resolveSession: ExpressAuthSessionResolver }) {
  const router = Router();
  function handler(action: "list" | "search" | "create" | "detail" | "analytics") {
    return async (request: Request, response: Response) => {
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
        const context: AuthHttpRequestContext = {
          requestId: headers["x-request-id"] ?? randomUUID(), method: action === "create" ? "POST" : "GET",
          path: request.path, headers, cookies: parseCookieHeader(headers.cookie),
          ipAddress: request.ip ?? null, userAgent: headers["user-agent"] ?? null,
          session: await deps.resolveSession(request),
        };
        const guard = action === "create" ? requireSameOrigin(context) ?? requireCsrf(context) : null;
        const result = guard ?? await deps.controller.handle(context, action, input(action, request));
        response.status(result.status).json(result.body);
      } catch {
        response.status(500).json({ error: "CUSTOMER_ROUTE_UNEXPECTED_FAILURE" });
      }
    };
  }
  router.get(adminCustomersApiRoutes.list, handler("list"));
  router.get(adminCustomersApiRoutes.search, handler("search"));
  router.post(adminCustomersApiRoutes.create, handler("create"));
  // Registered after /search so the literal path wins over the parameter.
  router.get(adminCustomersApiRoutes.detail, handler("detail"));
  router.get(adminCustomersApiRoutes.analytics, handler("analytics"));
  return router;
}

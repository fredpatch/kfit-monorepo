import { randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { adminRequestsApiRoutes } from "@kfit/shared";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { AdminRequestsController } from "../controllers/admin-requests.controller.js";
import type { HttpJsonResponse } from "../types/requests.http.types.js";

export type ExpressAdminRequestsRouterDeps = {
  controller: AdminRequestsController;
  resolveSession?: ExpressAuthSessionResolver;
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function toAuthContext(request: Request, resolveSession?: ExpressAuthSessionResolver): Promise<AuthHttpRequestContext> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    headers[key.toLowerCase()] = firstHeader(value);
  }

  return {
    requestId: headers["x-request-id"] ?? randomUUID(),
    method: request.method.toUpperCase() as AuthHttpRequestContext["method"],
    path: request.path,
    cookies: parseCookieHeader(headers.cookie),
    headers,
    ipAddress: request.ip ?? null,
    userAgent: headers["user-agent"] ?? null,
    session: resolveSession ? await resolveSession(request) : null,
  };
}

function applyJsonResponse(response: Response, result: HttpJsonResponse): void {
  response.status(result.status).json(result.body);
}

function mutationGuard(context: AuthHttpRequestContext): HttpJsonResponse<{ error: string }> | null {
  const originFailure = requireSameOrigin(context);
  if (originFailure) return originFailure;
  return requireCsrf(context);
}

function routeParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value !== "") return value;
  return null;
}

export function createExpressAdminRequestsRouter(deps: ExpressAdminRequestsRouterDeps): Router {
  const router = createRouter();

  router.get(adminRequestsApiRoutes.queue, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const status = routeParam(request.query.status as string | string[] | undefined) ?? undefined;
      applyJsonResponse(response, await deps.controller.listQueue(context, status));
    } catch {
      response.status(500).json({ error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.get(adminRequestsApiRoutes.detail, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const requestId = routeParam(request.params.requestId);
      if (!requestId) return applyJsonResponse(response, { status: 404, body: { error: "REQUEST_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.getDetail(context, requestId));
    } catch {
      response.status(500).json({ error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.post(adminRequestsApiRoutes.contactAttempts, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const requestId = routeParam(request.params.requestId);
      if (!requestId) return applyJsonResponse(response, { status: 404, body: { error: "REQUEST_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.logContactAttempt(context, requestId, request.body ?? {}));
    } catch {
      response.status(500).json({ error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.post(adminRequestsApiRoutes.status, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const requestId = routeParam(request.params.requestId);
      if (!requestId) return applyJsonResponse(response, { status: 404, body: { error: "REQUEST_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.transitionStatus(context, requestId, request.body ?? {}));
    } catch {
      response.status(500).json({ error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.post(adminRequestsApiRoutes.qualificationReview, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const requestId = routeParam(request.params.requestId);
      if (!requestId) return applyJsonResponse(response, { status: 404, body: { error: "REQUEST_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.recordQualificationReview(context, requestId, request.body ?? {}));
    } catch {
      response.status(500).json({ error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.post(adminRequestsApiRoutes.waitlistEntry, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const requestId = routeParam(request.params.requestId);
      if (!requestId) return applyJsonResponse(response, { status: 404, body: { error: "REQUEST_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.createWaitlistEntry(context, requestId, request.body ?? {}));
    } catch {
      response.status(500).json({ error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.post(adminRequestsApiRoutes.waitlistEntryWithdraw, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const requestId = routeParam(request.params.requestId);
      if (!requestId) return applyJsonResponse(response, { status: 404, body: { error: "REQUEST_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.withdrawWaitlistEntry(context, requestId));
    } catch {
      response.status(500).json({ error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

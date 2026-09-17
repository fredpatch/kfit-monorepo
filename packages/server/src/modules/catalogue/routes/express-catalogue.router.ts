import { randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { catalogueApiRoutes } from "@kfit/shared";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import { requireCsrf, requireSameOrigin } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { CatalogueController } from "../controllers/catalogue.controller.js";
import type { HttpJsonResponse } from "../types/catalogue.http.types.js";

export type ExpressCatalogueRouterDeps = {
  controller: CatalogueController;
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

export function createExpressCatalogueRouter(deps: ExpressCatalogueRouterDeps): Router {
  const router = createRouter();

  router.get(catalogueApiRoutes.publicServices, async (_request: Request, response: Response) => {
    try {
      applyJsonResponse(response, await deps.controller.listPublicServices());
    } catch {
      response.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.get(catalogueApiRoutes.adminServices, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      applyJsonResponse(response, await deps.controller.listAdminServices(context));
    } catch {
      response.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.post(catalogueApiRoutes.adminServices, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      applyJsonResponse(response, await deps.controller.createAdminService(context, request.body ?? {}));
    } catch {
      response.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.patch(catalogueApiRoutes.adminServiceOrder, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      applyJsonResponse(response, await deps.controller.reorderAdminServices(context, request.body ?? {}));
    } catch {
      response.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.patch(catalogueApiRoutes.adminServiceCapacity, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const serviceId = routeParam(request.params.serviceId);
      if (!serviceId) return applyJsonResponse(response, { status: 404, body: { error: "CATALOGUE_SERVICE_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.updateAdminServiceCapacity(context, serviceId, request.body ?? {}));
    } catch {
      response.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.patch(catalogueApiRoutes.adminService, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const serviceId = routeParam(request.params.serviceId);
      if (!serviceId) return applyJsonResponse(response, { status: 404, body: { error: "CATALOGUE_SERVICE_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.updateAdminService(context, serviceId, request.body ?? {}));
    } catch {
      response.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.post(catalogueApiRoutes.adminServicePublish, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const serviceId = routeParam(request.params.serviceId);
      if (!serviceId) return applyJsonResponse(response, { status: 404, body: { error: "CATALOGUE_SERVICE_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.publishAdminService(context, serviceId));
    } catch {
      response.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  router.post(catalogueApiRoutes.adminServiceArchive, async (request: Request, response: Response) => {
    try {
      const context = await toAuthContext(request, deps.resolveSession);
      const guard = mutationGuard(context);
      if (guard) return applyJsonResponse(response, guard);
      const serviceId = routeParam(request.params.serviceId);
      if (!serviceId) return applyJsonResponse(response, { status: 404, body: { error: "CATALOGUE_SERVICE_NOT_FOUND" } });
      applyJsonResponse(response, await deps.controller.archiveAdminService(context, serviceId));
    } catch {
      response.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

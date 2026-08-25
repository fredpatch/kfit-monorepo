import { randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { AuthController } from "../controllers/auth.controller.js";
import { parseCookieHeader } from "../middleware/auth.cookies.js";
import { requireCsrf } from "../middleware/auth.middleware.js";
import { authRoutes } from "./auth.routes.js";
import type {
  AuthenticatedSessionContext,
  AuthHttpRequestContext,
  AuthRouteDefinition,
  HttpJsonResponse,
} from "../types/auth.http.types.js";

export type ExpressAuthSessionResolver = (request: Request) => Promise<AuthenticatedSessionContext | null> | AuthenticatedSessionContext | null;

export type ExpressAuthRouterDeps = {
  controller: AuthController;
  resolveSession: ExpressAuthSessionResolver;
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function toAuthContext(request: Request, resolveSession: ExpressAuthSessionResolver): Promise<AuthHttpRequestContext> {
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
    session: await resolveSession(request),
  };
}

function applyJsonResponse(response: Response, result: HttpJsonResponse): void {
  for (const cookie of result.cookies ?? []) {
    response.cookie(cookie.name, cookie.value, {
      httpOnly: cookie.options.httpOnly,
      secure: cookie.options.secure,
      sameSite: cookie.options.sameSite,
      path: cookie.options.path,
      maxAge: cookie.options.maxAgeSeconds ? cookie.options.maxAgeSeconds * 1000 : undefined,
    });
  }

  response.status(result.status).json(result.body);
}

async function dispatchAuthRoute(
  route: AuthRouteDefinition,
  controller: AuthController,
  context: AuthHttpRequestContext,
  body: unknown,
): Promise<HttpJsonResponse> {
  if (route.requiresCsrf) {
    const csrfFailure = requireCsrf(context);
    if (csrfFailure) return csrfFailure;
  }

  switch (route.handler) {
    case "currentSession":
      return controller.currentSession(context);
    case "requestSensitiveActionOtp":
      return controller.requestSensitiveActionOtp(context);
    case "verifySensitiveActionOtp":
      return controller.verifySensitiveActionOtp(context, typeof body === "object" && body !== null ? body : {});
    default:
      return {
        status: 500,
        body: { error: "AUTH_ROUTE_HANDLER_NOT_BOUND" },
      };
  }
}

export function createExpressAuthRouter(deps: ExpressAuthRouterDeps): Router {
  const router = createRouter();

  for (const route of authRoutes) {
    const register = router[route.method.toLowerCase() as Lowercase<AuthRouteDefinition["method"]>].bind(router);

    register(route.path, async (request: Request, response: Response) => {
      try {
        const context = await toAuthContext(request, deps.resolveSession);
        const result = await dispatchAuthRoute(route, deps.controller, context, request.body);
        applyJsonResponse(response, result);
      } catch {
        response.status(500).json({ error: "AUTH_ROUTE_UNEXPECTED_FAILURE" });
      }
    });
  }

  return router;
}

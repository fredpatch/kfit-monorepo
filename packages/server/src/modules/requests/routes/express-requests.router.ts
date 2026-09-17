import { randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { requestsApiRoutes } from "@kfit/shared";
import type { RequestsController } from "../controllers/requests.controller.js";
import type { HttpJsonResponse } from "../types/requests.http.types.js";
import type { IpRateLimiter } from "../services/ip-rate-limiter.js";

export type ExpressRequestsRouterDeps = {
  controller: RequestsController;
  rateLimiter: IpRateLimiter;
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function applyJsonResponse(response: Response, result: HttpJsonResponse): void {
  response.status(result.status).json(result.body);
}

function requireSameOriginOrNull(request: Request): HttpJsonResponse<{ error: string }> | null {
  const origin = firstHeader(request.headers.origin as string | string[] | undefined);
  if (!origin) return null;

  const expectedHost = firstHeader(request.headers["x-forwarded-host"] as string | string[] | undefined) ?? request.headers.host;
  if (!expectedHost) return { status: 403, body: { error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" } };

  try {
    return new URL(origin).host === expectedHost ? null : { status: 403, body: { error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" } };
  } catch {
    return { status: 403, body: { error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" } };
  }
}

export function createExpressRequestsRouter(deps: ExpressRequestsRouterDeps): Router {
  const router = createRouter();

  router.post(requestsApiRoutes.publicSubmit, async (request: Request, response: Response) => {
    try {
      const originGuard = requireSameOriginOrNull(request);
      if (originGuard) return applyJsonResponse(response, originGuard);

      const ipAddress = request.ip ?? null;
      if (!deps.rateLimiter.allow(ipAddress ?? "unknown")) {
        return applyJsonResponse(response, { status: 429, body: { error: "REQUEST_RATE_LIMITED" } });
      }

      const result = await deps.controller.submit(request.body ?? {}, {
        requestId: firstHeader(request.headers["x-request-id"] as string | string[] | undefined) ?? randomUUID(),
        ipAddress,
        userAgent: firstHeader(request.headers["user-agent"] as string | string[] | undefined) ?? null,
        now: new Date(),
      });
      applyJsonResponse(response, result);
    } catch {
      response.status(500).json({ error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

import { respondIfSubjectArchived } from "../../privacy/routes/subject-archived.response.js";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { onboardingApiRoutes } from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import {
  requireCsrf,
  requireSameOrigin,
} from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { OnboardingController } from "../controllers/onboarding.controller.js";
import type { OnboardingCommand } from "../services/onboarding.service.js";

export function createExpressOnboardingRouter(deps: {
  controller: OnboardingController;
  resolveSession: ExpressAuthSessionResolver;
}) {
  const router = Router();
  function handle(action: OnboardingCommand["action"]) {
    return async (request: Request, response: Response) => {
      try {
        const headers: Record<string, string | undefined> = {};
        for (const [key, value] of Object.entries(request.headers))
          headers[key] = Array.isArray(value) ? value[0] : value;
        const context: AuthHttpRequestContext = {
          requestId: headers["x-request-id"] ?? randomUUID(),
          method: request.method as AuthHttpRequestContext["method"],
          path: request.path,
          headers,
          cookies: parseCookieHeader(headers.cookie),
          session: await deps.resolveSession(request),
          ipAddress: request.ip ?? null,
          userAgent: headers["user-agent"] ?? null,
        };
        const guard =
          action === "read"
            ? null
            : (requireSameOrigin(context) ?? requireCsrf(context));
        const subscriptionId =
          typeof request.params.subscriptionId === "string"
            ? request.params.subscriptionId
            : "";
        const itemId =
          typeof request.params.itemId === "string"
            ? request.params.itemId
            : undefined;
        const result =
          guard ??
          (await deps.controller.execute(
            context,
            subscriptionId,
            action,
            action === "read" ? {} : (request.body ?? {}),
            itemId,
          ));
        response.status(result.status).json(result.body);
      } catch (error) {
        if (!respondIfSubjectArchived(response, error))
          response
            .status(500)
            .json({ error: "ONBOARDING_ROUTE_UNEXPECTED_FAILURE" });
      }
    };
  }
  router.get(onboardingApiRoutes.detail, handle("read"));
  router.post(onboardingApiRoutes.initialize, handle("initialize"));
  router.post(onboardingApiRoutes.complete, handle("complete"));
  router.post(onboardingApiRoutes.waive, handle("waive"));
  router.put(onboardingApiRoutes.reservation, handle("reserve"));
  router.post(onboardingApiRoutes.ready, handle("ready"));
  return router;
}

import express, { type Express } from "express";
import type { AuthController } from "./modules/auth/controllers/auth.controller.js";
import { createExpressAuthRouter, type ExpressAuthSessionResolver } from "./modules/auth/routes/express-auth.router.js";
import type { CatalogueController } from "./modules/catalogue/controllers/catalogue.controller.js";
import { createExpressCatalogueRouter } from "./modules/catalogue/routes/express-catalogue.router.js";
import type { RequestsController } from "./modules/requests/controllers/requests.controller.js";
import { createExpressRequestsRouter } from "./modules/requests/routes/express-requests.router.js";
import { IpRateLimiter } from "./modules/requests/services/ip-rate-limiter.js";

export type ServerAppDeps = {
  authController: AuthController;
  resolveAuthSession: ExpressAuthSessionResolver;
  catalogueController?: CatalogueController;
  requestsController?: RequestsController;
};

export function createServerApp(deps: ServerAppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.use(createExpressAuthRouter({
    controller: deps.authController,
    resolveSession: deps.resolveAuthSession,
  }));

  if (deps.catalogueController) {
    app.use(createExpressCatalogueRouter({
      controller: deps.catalogueController,
      resolveSession: deps.resolveAuthSession,
    }));
  }

  if (deps.requestsController) {
    app.use(createExpressRequestsRouter({
      controller: deps.requestsController,
      rateLimiter: new IpRateLimiter({ windowMs: 60_000, maxPerWindow: 5 }),
    }));
  }

  return app;
}

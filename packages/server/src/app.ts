import express, { type Express } from "express";
import type { AuthController } from "./modules/auth/controllers/auth.controller.js";
import { createExpressAuthRouter, type ExpressAuthSessionResolver } from "./modules/auth/routes/express-auth.router.js";

export type ServerAppDeps = {
  authController: AuthController;
  resolveAuthSession: ExpressAuthSessionResolver;
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

  return app;
}

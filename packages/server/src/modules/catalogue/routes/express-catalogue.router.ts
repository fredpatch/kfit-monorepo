import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { catalogueApiRoutes } from "@kfit/shared";
import type { CatalogueController } from "../controllers/catalogue.controller.js";
import type { HttpJsonResponse } from "../types/catalogue.http.types.js";

export type ExpressCatalogueRouterDeps = {
  controller: CatalogueController;
};

function applyJsonResponse(response: Response, result: HttpJsonResponse): void {
  response.status(result.status).json(result.body);
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

  return router;
}

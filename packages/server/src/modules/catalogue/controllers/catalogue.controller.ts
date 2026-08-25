import type { CataloguePublicServicesResponse } from "@kfit/shared";
import type { CatalogueService } from "../services/catalogue.service.js";
import type { HttpJsonResponse } from "../types/catalogue.http.types.js";

export class CatalogueController {
  constructor(private readonly catalogueService: Pick<CatalogueService, "listPublicServices">) {}

  async listPublicServices(): Promise<HttpJsonResponse<CataloguePublicServicesResponse>> {
    return {
      status: 200,
      body: await this.catalogueService.listPublicServices(),
    };
  }
}

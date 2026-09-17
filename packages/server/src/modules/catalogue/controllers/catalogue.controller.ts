import type {
  CatalogueAdminServiceResponse,
  CatalogueAdminServicesResponse,
  CataloguePublicServicesResponse,
  CatalogueServiceCapacityInput,
  CatalogueServiceMutationInput,
  CatalogueServiceOrderInput,
} from "@kfit/shared";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { CatalogueService } from "../services/catalogue.service.js";
import type { HttpJsonResponse } from "../types/catalogue.http.types.js";

function requireAdminSession(context: AuthHttpRequestContext): HttpJsonResponse<{ error: string }> | null {
  const auth = requireAuthenticatedSession(context);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin") {
    return { status: 403, body: { error: "CATALOGUE_ADMIN_FORBIDDEN" } };
  }
  return null;
}

function toMutationResponse(result: Awaited<ReturnType<CatalogueService["createAdminService"]>>): HttpJsonResponse<CatalogueAdminServiceResponse | { error: string; reason?: string }> {
  switch (result.status) {
    case "ok":
      return { status: 200, body: result.response };
    case "invalid":
      return { status: 400, body: { error: "CATALOGUE_SERVICE_INVALID_INPUT", reason: result.reason } };
    case "not_found":
      return { status: 404, body: { error: "CATALOGUE_SERVICE_NOT_FOUND" } };
    case "slug_conflict":
      return { status: 409, body: { error: "CATALOGUE_SERVICE_SLUG_CONFLICT" } };
    case "archived":
      return { status: 409, body: { error: "CATALOGUE_SERVICE_ARCHIVED" } };
    case "publish_invalid":
      return { status: 409, body: { error: "CATALOGUE_SERVICE_PUBLISH_INVALID", reason: result.reason } };
  }
}

export class CatalogueController {
  constructor(private readonly catalogueService: Pick<
    CatalogueService,
    | "listPublicServices"
    | "listAdminServices"
    | "createAdminService"
    | "updateAdminService"
    | "publishAdminService"
    | "archiveAdminService"
    | "updateAdminServiceCapacity"
    | "reorderAdminServices"
  >) {}

  async listPublicServices(): Promise<HttpJsonResponse<CataloguePublicServicesResponse>> {
    return {
      status: 200,
      body: await this.catalogueService.listPublicServices(),
    };
  }

  async listAdminServices(context: AuthHttpRequestContext): Promise<HttpJsonResponse<CatalogueAdminServicesResponse | { error: string }>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return { status: 200, body: await this.catalogueService.listAdminServices() };
  }

  async createAdminService(
    context: AuthHttpRequestContext,
    body: CatalogueServiceMutationInput,
  ): Promise<HttpJsonResponse<CatalogueAdminServiceResponse | { error: string; reason?: string }>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    const response = toMutationResponse(await this.catalogueService.createAdminService(body));
    return response.status === 200 ? { ...response, status: 201 } : response;
  }

  async updateAdminService(
    context: AuthHttpRequestContext,
    serviceId: string,
    body: CatalogueServiceMutationInput,
  ): Promise<HttpJsonResponse<CatalogueAdminServiceResponse | { error: string; reason?: string }>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return toMutationResponse(await this.catalogueService.updateAdminService(serviceId, body));
  }

  async publishAdminService(
    context: AuthHttpRequestContext,
    serviceId: string,
  ): Promise<HttpJsonResponse<CatalogueAdminServiceResponse | { error: string; reason?: string }>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return toMutationResponse(await this.catalogueService.publishAdminService(serviceId));
  }

  async archiveAdminService(
    context: AuthHttpRequestContext,
    serviceId: string,
  ): Promise<HttpJsonResponse<CatalogueAdminServiceResponse | { error: string; reason?: string }>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return toMutationResponse(await this.catalogueService.archiveAdminService(serviceId));
  }

  async updateAdminServiceCapacity(
    context: AuthHttpRequestContext,
    serviceId: string,
    body: CatalogueServiceCapacityInput,
  ): Promise<HttpJsonResponse<CatalogueAdminServiceResponse | { error: string; reason?: string }>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return toMutationResponse(await this.catalogueService.updateAdminServiceCapacity(serviceId, body));
  }

  async reorderAdminServices(
    context: AuthHttpRequestContext,
    body: CatalogueServiceOrderInput,
  ): Promise<HttpJsonResponse<CatalogueAdminServicesResponse | { error: string; reason?: string }>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    const result = await this.catalogueService.reorderAdminServices(body);
    switch (result.status) {
      case "ok":
        return "services" in result.response
          ? { status: 200, body: result.response }
          : { status: 500, body: { error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" } };
      case "invalid":
        return { status: 400, body: { error: "CATALOGUE_SERVICE_INVALID_INPUT", reason: result.reason } };
      case "not_found":
        return { status: 404, body: { error: "CATALOGUE_SERVICE_NOT_FOUND" } };
      default:
        return { status: 500, body: { error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" } };
    }
  }
}

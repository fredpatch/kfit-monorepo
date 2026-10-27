import type {
  CatalogueAdminServiceResponse,
  CatalogueAdminServicesResponse,
  CatalogueDeliverabilityFailure,
  CatalogueErrorCode,
  CatalogueAdminServicesOverviewResponse,
  CataloguePublicServicesResponse,
  CatalogueServiceCapacityInput,
  CatalogueServiceMutationInput,
  CatalogueServiceOrderInput,
} from "@kfit/shared";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type { CatalogueService } from "../services/catalogue.service.js";
import type { CatalogueContentError } from "../repositories/catalogue-content.repository.js";
import type {
  CatalogueContentAction,
  CatalogueContentParams,
  CatalogueContentService,
} from "../services/catalogue-content.service.js";
import type { HttpJsonResponse } from "../types/catalogue.http.types.js";

function requireAdminSession(
  context: AuthHttpRequestContext,
): HttpJsonResponse<{ error: string }> | null {
  const auth = requireAuthenticatedSession(context);
  if (!auth.ok) return auth.response;
  if (!hasRole(auth.session, "admin")) {
    return { status: 403, body: { error: "CATALOGUE_ADMIN_FORBIDDEN" } };
  }
  return null;
}

const contentErrors: Record<
  CatalogueContentError,
  [number, CatalogueErrorCode]
> = {
  invalid: [400, "CATALOGUE_SERVICE_INVALID_INPUT"],
  service_not_found: [404, "CATALOGUE_SERVICE_NOT_FOUND"],
  service_archived: [409, "CATALOGUE_SERVICE_ARCHIVED"],
  variant_not_found: [404, "CATALOGUE_VARIANT_NOT_FOUND"],
  variant_archived: [409, "CATALOGUE_VARIANT_ARCHIVED"],
  variant_slug_conflict: [409, "CATALOGUE_VARIANT_SLUG_CONFLICT"],
  component_not_found: [404, "CATALOGUE_COMPONENT_NOT_FOUND"],
  component_archived: [409, "CATALOGUE_COMPONENT_ARCHIVED"],
  override_not_found: [404, "CATALOGUE_RULES_OVERRIDE_NOT_FOUND"],
  override_has_questionnaire: [
    409,
    "CATALOGUE_RULES_OVERRIDE_HAS_QUESTIONNAIRE",
  ],
};

function toMutationResponse(
  result: Awaited<ReturnType<CatalogueService["createAdminService"]>>,
): HttpJsonResponse<
  | CatalogueAdminServiceResponse
  | {
      error: string;
      reason?: string;
      failures?: CatalogueDeliverabilityFailure[];
    }
> {
  switch (result.status) {
    case "ok":
      return { status: 200, body: result.response };
    case "invalid":
      return {
        status: 400,
        body: {
          error: "CATALOGUE_SERVICE_INVALID_INPUT",
          reason: result.reason,
        },
      };
    case "not_found":
      return { status: 404, body: { error: "CATALOGUE_SERVICE_NOT_FOUND" } };
    case "slug_conflict":
      return {
        status: 409,
        body: { error: "CATALOGUE_SERVICE_SLUG_CONFLICT" },
      };
    case "archived":
      return { status: 409, body: { error: "CATALOGUE_SERVICE_ARCHIVED" } };
    case "publish_invalid":
      return {
        status: 409,
        body: {
          error: "CATALOGUE_SERVICE_PUBLISH_INVALID",
          reason: result.reason,
        },
      };
    case "not_deliverable":
      return {
        status: 409,
        body: {
          error: "CATALOGUE_SERVICE_NOT_DELIVERABLE",
          failures: result.failures,
        },
      };
  }
}

export class CatalogueController {
  constructor(
    private readonly catalogueService: Pick<
      CatalogueService,
      | "listPublicServices"
      | "listAdminServices"
      | "listAdminOverview"
      | "createAdminService"
      | "updateAdminService"
      | "publishAdminService"
      | "archiveAdminService"
      | "updateAdminServiceCapacity"
      | "reorderAdminServices"
    >,
    private readonly contentService?: Pick<CatalogueContentService, "execute">,
  ) {}

  /** CAT-03a: variants, components, rules and the deliverability report. Admin only; mutations are guarded by the router. */
  async content(
    context: AuthHttpRequestContext,
    action: CatalogueContentAction,
    params: CatalogueContentParams,
    body: unknown,
  ): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin") || !this.contentService)
      return { status: 403, body: { error: "CATALOGUE_ADMIN_FORBIDDEN" } };
    const result = await this.contentService.execute(action, params, body, {
      userId: auth.session.userId,
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    if (result.ok)
      return {
        status:
          action === "variant_create" || action === "component_create"
            ? 201
            : 200,
        body: result.value,
      };
    const [status, error] = contentErrors[result.error];
    return {
      status,
      body: { error, ...(result.reason ? { reason: result.reason } : {}) },
    };
  }

  async listPublicServices(): Promise<
    HttpJsonResponse<CataloguePublicServicesResponse>
  > {
    return {
      status: 200,
      body: await this.catalogueService.listPublicServices(),
    };
  }

  async listAdminServices(
    context: AuthHttpRequestContext,
  ): Promise<
    HttpJsonResponse<CatalogueAdminServicesResponse | { error: string }>
  > {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return {
      status: 200,
      body: await this.catalogueService.listAdminServices(),
    };
  }

  /** UX-7 read-only overview (occupancy, waitlist, variants, rules). */
  async listAdminOverview(
    context: AuthHttpRequestContext,
  ): Promise<
    HttpJsonResponse<CatalogueAdminServicesOverviewResponse | { error: string }>
  > {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return {
      status: 200,
      body: await this.catalogueService.listAdminOverview(),
    };
  }

  async createAdminService(
    context: AuthHttpRequestContext,
    body: CatalogueServiceMutationInput,
  ): Promise<
    HttpJsonResponse<
      CatalogueAdminServiceResponse | { error: string; reason?: string }
    >
  > {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    const response = toMutationResponse(
      await this.catalogueService.createAdminService(body),
    );
    return response.status === 200 ? { ...response, status: 201 } : response;
  }

  async updateAdminService(
    context: AuthHttpRequestContext,
    serviceId: string,
    body: CatalogueServiceMutationInput,
  ): Promise<
    HttpJsonResponse<
      CatalogueAdminServiceResponse | { error: string; reason?: string }
    >
  > {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return toMutationResponse(
      await this.catalogueService.updateAdminService(serviceId, body),
    );
  }

  async publishAdminService(
    context: AuthHttpRequestContext,
    serviceId: string,
  ): Promise<
    HttpJsonResponse<
      CatalogueAdminServiceResponse | { error: string; reason?: string }
    >
  > {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return toMutationResponse(
      await this.catalogueService.publishAdminService(serviceId),
    );
  }

  async archiveAdminService(
    context: AuthHttpRequestContext,
    serviceId: string,
  ): Promise<
    HttpJsonResponse<
      CatalogueAdminServiceResponse | { error: string; reason?: string }
    >
  > {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return toMutationResponse(
      await this.catalogueService.archiveAdminService(serviceId),
    );
  }

  async updateAdminServiceCapacity(
    context: AuthHttpRequestContext,
    serviceId: string,
    body: CatalogueServiceCapacityInput,
  ): Promise<
    HttpJsonResponse<
      CatalogueAdminServiceResponse | { error: string; reason?: string }
    >
  > {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    return toMutationResponse(
      await this.catalogueService.updateAdminServiceCapacity(serviceId, body),
    );
  }

  async reorderAdminServices(
    context: AuthHttpRequestContext,
    body: CatalogueServiceOrderInput,
  ): Promise<
    HttpJsonResponse<
      CatalogueAdminServicesResponse | { error: string; reason?: string }
    >
  > {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;
    const result = await this.catalogueService.reorderAdminServices(body);
    switch (result.status) {
      case "ok":
        return "services" in result.response
          ? { status: 200, body: result.response }
          : {
              status: 500,
              body: { error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" },
            };
      case "invalid":
        return {
          status: 400,
          body: {
            error: "CATALOGUE_SERVICE_INVALID_INPUT",
            reason: result.reason,
          },
        };
      case "not_found":
        return { status: 404, body: { error: "CATALOGUE_SERVICE_NOT_FOUND" } };
      default:
        return {
          status: 500,
          body: { error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" },
        };
    }
  }
}

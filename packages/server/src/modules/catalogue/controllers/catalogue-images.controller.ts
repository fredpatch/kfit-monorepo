import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type {
  CatalogueImageFailure,
  CatalogueImageService,
  CatalogueImageUpload,
} from "../services/catalogue-image.service.js";
import type { CatalogueImageScope } from "../repositories/catalogue-image.repository.js";
import type { HttpJsonResponse } from "../types/catalogue.http.types.js";

const statusOf: Record<CatalogueImageFailure, number> = {
  CATALOGUE_IMAGE_ALT_REQUIRED: 400,
  CATALOGUE_IMAGE_RIGHTS_REQUIRED: 400,
  CATALOGUE_IMAGE_TOO_SMALL: 422,
  CATALOGUE_IMAGE_TOO_LARGE_PIXELS: 422,
  CATALOGUE_IMAGE_NOT_FOUND: 404,
  CATALOGUE_SERVICE_NOT_FOUND: 404,
  CATALOGUE_SERVICE_ARCHIVED: 409,
  DOCUMENT_FILE_TOO_LARGE: 413,
  DOCUMENT_FILE_TYPE_UNSUPPORTED: 415,
  DOCUMENT_FILE_SIGNATURE_INVALID: 422,
  DOCUMENT_FILE_INFECTED: 422,
  DOCUMENT_FILE_SCAN_FAILED: 503,
  DOCUMENT_STORAGE_FAILURE: 500,
};

/** CAT-04: cover photo writes and the admin preview are admin only; the router adds same origin + CSRF on writes. */
export class CatalogueImagesController {
  constructor(
    private readonly service: Pick<
      CatalogueImageService,
      "upload" | "remove" | "read"
    >,
  ) {}

  private admin(context: AuthHttpRequestContext) {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth;
    if (!hasRole(auth.session, "admin"))
      return {
        ok: false as const,
        response: {
          status: 403,
          body: { error: "CATALOGUE_ADMIN_FORBIDDEN" },
        },
      };
    return auth;
  }

  private actor(
    context: AuthHttpRequestContext,
    userId: string,
  ): Parameters<CatalogueImageService["upload"]>[2] {
    return {
      userId,
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    };
  }

  async upload(
    context: AuthHttpRequestContext,
    serviceId: string,
    upload: CatalogueImageUpload,
  ): Promise<HttpJsonResponse> {
    const auth = this.admin(context);
    if (!auth.ok) return auth.response;
    const result = await this.service.upload(
      serviceId,
      upload,
      this.actor(context, auth.session.userId),
    );
    return result.ok
      ? { status: 200, body: result.value }
      : { status: statusOf[result.error], body: { error: result.error } };
  }

  async remove(
    context: AuthHttpRequestContext,
    serviceId: string,
  ): Promise<HttpJsonResponse> {
    const auth = this.admin(context);
    if (!auth.ok) return auth.response;
    const result = await this.service.remove(
      serviceId,
      this.actor(context, auth.session.userId),
    );
    return result.ok
      ? { status: 200, body: result.value }
      : { status: statusOf[result.error], body: { error: result.error } };
  }

  /** C5: `null` context = the public route. A refusal or an unknown file is a 404, never a reason. */
  async read(
    context: AuthHttpRequestContext | null,
    file: string,
  ): Promise<{ status: 200; bytes: Buffer } | HttpJsonResponse> {
    let scope: CatalogueImageScope = "public";
    if (context) {
      const auth = this.admin(context);
      if (!auth.ok) return auth.response;
      scope = "admin";
    }
    const bytes = await this.service.read(file, scope);
    return bytes
      ? { status: 200, bytes }
      : { status: 404, body: { error: "CATALOGUE_IMAGE_NOT_FOUND" } };
  }
}

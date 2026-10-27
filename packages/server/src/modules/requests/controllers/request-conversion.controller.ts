import type { RequestConversionResponse, RequestErrorResponse } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { RequestConversionService } from "../services/request-conversion.service.js";

export class RequestConversionController {
  constructor(private readonly service: Pick<RequestConversionService, "convert">) {}

  async convert(context: AuthHttpRequestContext, requestId: string, body: unknown): Promise<HttpJsonResponse<RequestConversionResponse | RequestErrorResponse>> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin")) return { status: 403, body: { error: "REQUEST_ADMIN_FORBIDDEN" } };
    const result = await this.service.convert(requestId, body, {
      userId: auth.session.userId, requestId: context.requestId,
      ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null,
    });
    switch (result.status) {
      case "ok": return { status: 201, body: result.response };
      case "invalid": return { status: 400, body: { error: "REQUEST_INVALID_INPUT" } };
      case "not_found": return { status: 404, body: { error: "REQUEST_NOT_FOUND" } };
      case "already_converted": return { status: 409, body: { error: "REQUEST_ALREADY_CONVERTED" } };
      case "not_eligible": return { status: 409, body: { error: "REQUEST_CONVERSION_NOT_ELIGIBLE" } };
      case "qualification_invalid": return { status: 409, body: { error: "REQUEST_CONVERSION_QUALIFICATION_INVALID" } };
      case "start_date_required": return { status: 400, body: { error: "REQUEST_CONVERSION_START_DATE_REQUIRED" } };
      case "duration_invalid": return { status: 409, body: { error: "REQUEST_CONVERSION_DURATION_INVALID" } };
    }
  }
}

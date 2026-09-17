import type { RequestSubmissionInput, RequestSubmissionResponse } from "@kfit/shared";
import type { RequestsService, SubmitRequestContext } from "../services/requests.service.js";
import type { HttpJsonResponse } from "../types/requests.http.types.js";

export class RequestsController {
  constructor(private readonly requestsService: Pick<RequestsService, "submit">) {}

  async submit(input: RequestSubmissionInput, context: SubmitRequestContext): Promise<HttpJsonResponse<RequestSubmissionResponse | { error: string; reason?: string }>> {
    const result = await this.requestsService.submit(input, context);

    switch (result.status) {
      case "ok":
        return { status: 201, body: result.response };
      case "invalid":
        return { status: 400, body: { error: "REQUEST_INVALID_INPUT", reason: result.reason } };
      case "service_not_found":
        return { status: 404, body: { error: "REQUEST_SERVICE_NOT_FOUND" } };
      case "service_not_public":
        return { status: 409, body: { error: "REQUEST_SERVICE_NOT_PUBLIC" } };
      case "service_unavailable":
        return { status: 409, body: { error: "REQUEST_SERVICE_UNAVAILABLE" } };
      case "service_archived":
        return { status: 409, body: { error: "REQUEST_SERVICE_ARCHIVED" } };
      case "waitlist_required":
        return { status: 409, body: { error: "REQUEST_WAITLIST_REQUIRED" } };
      case "variant_invalid":
        return { status: 400, body: { error: "REQUEST_VARIANT_INVALID" } };
    }
  }
}

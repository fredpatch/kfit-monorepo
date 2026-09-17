import {
  serviceRequestStatuses,
  type AdminRequestDetailResponse,
  type AdminRequestsQueueResponse,
  type CreateContactAttemptInput,
  type CreateContactAttemptResponse,
  type CreateQualificationReviewInput,
  type CreateQualificationReviewResponse,
  type RequestStatusTransitionResponse,
  type ServiceRequestStatus,
} from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import type { AdminRequestsService } from "../services/admin-requests.service.js";
import type { HttpJsonResponse } from "../types/requests.http.types.js";

type ErrorBody = { error: string; reason?: string };

function requireAdminSession(context: AuthHttpRequestContext): HttpJsonResponse<ErrorBody> | null {
  const auth = requireAuthenticatedSession(context);
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "admin") {
    return { status: 403, body: { error: "REQUEST_ADMIN_FORBIDDEN" } };
  }
  return null;
}

export class AdminRequestsController {
  constructor(private readonly service: Pick<AdminRequestsService, "listQueue" | "getDetail" | "logContactAttempt" | "transitionStatus" | "recordQualificationReview">) {}

  async listQueue(context: AuthHttpRequestContext, status: string | undefined): Promise<HttpJsonResponse<AdminRequestsQueueResponse | ErrorBody>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;

    if (status !== undefined && !serviceRequestStatuses.includes(status as ServiceRequestStatus)) {
      return { status: 400, body: { error: "REQUEST_INVALID_INPUT", reason: "status_invalid" } };
    }

    const requests = await this.service.listQueue(status ? { status: status as ServiceRequestStatus } : {});
    return { status: 200, body: { requests } };
  }

  async getDetail(context: AuthHttpRequestContext, requestId: string): Promise<HttpJsonResponse<AdminRequestDetailResponse | ErrorBody>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;

    const result = await this.service.getDetail(requestId);
    switch (result.status) {
      case "ok":
        return { status: 200, body: { request: result.detail } };
      case "not_found":
        return { status: 404, body: { error: "REQUEST_NOT_FOUND" } };
      case "invalid":
        return { status: 400, body: { error: "REQUEST_INVALID_INPUT" } };
    }
  }

  async logContactAttempt(
    context: AuthHttpRequestContext,
    requestId: string,
    body: CreateContactAttemptInput,
  ): Promise<HttpJsonResponse<CreateContactAttemptResponse | ErrorBody>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;

    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;

    const result = await this.service.logContactAttempt(
      requestId,
      body,
      { userId: auth.session.userId },
      { ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null },
      new Date(),
    );
    switch (result.status) {
      case "ok":
        return { status: 201, body: { contactAttempt: result.contactAttempt, request: result.request } };
      case "not_found":
        return { status: 404, body: { error: "REQUEST_NOT_FOUND" } };
      case "invalid":
        return { status: 400, body: { error: "REQUEST_CONTACT_ATTEMPT_INVALID_INPUT", reason: result.reason } };
    }
  }

  async transitionStatus(
    context: AuthHttpRequestContext,
    requestId: string,
    body: { toStatus?: unknown },
  ): Promise<HttpJsonResponse<RequestStatusTransitionResponse | ErrorBody>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;

    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;

    const result = await this.service.transitionStatus(
      requestId,
      body.toStatus,
      { userId: auth.session.userId },
      { ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null },
      new Date(),
    );
    switch (result.status) {
      case "ok":
        return { status: 200, body: { request: result.request } };
      case "not_found":
        return { status: 404, body: { error: "REQUEST_NOT_FOUND" } };
      case "invalid_transition":
        return { status: 409, body: { error: "REQUEST_INVALID_TRANSITION" } };
      case "invalid":
        return { status: 400, body: { error: "REQUEST_STATUS_INVALID_INPUT", reason: result.reason } };
    }
  }

  async recordQualificationReview(
    context: AuthHttpRequestContext,
    requestId: string,
    body: CreateQualificationReviewInput,
  ): Promise<HttpJsonResponse<CreateQualificationReviewResponse | ErrorBody>> {
    const forbidden = requireAdminSession(context);
    if (forbidden) return forbidden;

    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;

    const result = await this.service.recordQualificationReview(
      requestId,
      body,
      { userId: auth.session.userId },
      { ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null },
      new Date(),
    );
    switch (result.status) {
      case "ok":
        return { status: 201, body: { qualificationReview: result.qualificationReview, request: result.request } };
      case "not_found":
        return { status: 404, body: { error: "REQUEST_NOT_FOUND" } };
      case "invalid_transition":
        return { status: 409, body: { error: "REQUEST_INVALID_TRANSITION" } };
      case "invalid":
        return { status: 400, body: { error: "REQUEST_QUALIFICATION_REVIEW_INVALID_INPUT", reason: result.reason } };
    }
  }
}

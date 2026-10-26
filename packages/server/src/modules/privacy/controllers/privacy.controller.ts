import {
  isPrivacyUuid,
  parseAnonymizeSubjectInput,
  parseCreateRetentionHoldInput,
  parseRetentionHoldListQuery,
  parseUnarchiveSubjectInput,
  type PrivacyErrorCode,
  type PrivacySubjectType,
} from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { isFreshOtp } from "../../auth/services/policies/session.policy.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { FreshOtpCheck } from "../../questionnaires/controllers/questionnaire.controller.js";
import type { PrivacyService } from "../services/privacy.service.js";

export type PrivacyAction = "archive_customer" | "archive_prospect" | "unarchive_customer" | "unarchive_prospect" | "anonymize_customer" | "anonymize_prospect" | "holds_list" | "hold_create" | "hold_release";

const statusOf: Record<PrivacyErrorCode, number> = {
  PRIVACY_INVALID_INPUT: 400,
  PRIVACY_CONFIRMATION_MISMATCH: 400,
  PRIVACY_ADMIN_FORBIDDEN: 403,
  PRIVACY_SUBJECT_NOT_FOUND: 404,
  PRIVACY_HOLD_NOT_FOUND: 404,
  PRIVACY_SUBJECT_NOT_ARCHIVED: 409,
  PRIVACY_SUBJECT_ANONYMIZED: 409,
  PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION: 409,
  PRIVACY_SUBJECT_HAS_OPEN_REQUEST: 409,
  PRIVACY_RETENTION_HOLD_ACTIVE: 409,
  PRIVACY_HOLD_ALREADY_ACTIVE: 409,
  PRIVACY_HOLD_ALREADY_RELEASED: 409,
  PRIVACY_ROUTE_UNEXPECTED_FAILURE: 500,
};
const fail = (error: PrivacyErrorCode): HttpJsonResponse => ({ status: statusOf[error], body: { error } });
const emptyBody = (body: unknown) => body === undefined || (typeof body === "object" && body !== null && !Array.isArray(body) && Object.keys(body).length === 0);

/** Admin-only. Anonymization also needs a fresh sensitive-action OTP (rule 2) and the typed name (D9, compared in the repository). */
export class PrivacyController {
  constructor(private readonly service: Pick<PrivacyService, "archive" | "unarchive" | "anonymize" | "createHold" | "releaseHold" | "listHolds">, private readonly freshOtp: FreshOtpCheck) {}

  async handle(context: AuthHttpRequestContext, action: PrivacyAction, input: { id?: string | undefined; query?: Record<string, unknown>; body?: unknown }): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return fail("PRIVACY_ADMIN_FORBIDDEN");
    const actor = { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null };
    switch (action) {
      case "archive_customer":
      case "archive_prospect": {
        const subjectType: PrivacySubjectType = action === "archive_customer" ? "customer" : "prospect";
        if (!isPrivacyUuid(input.id) || !emptyBody(input.body)) return fail("PRIVACY_INVALID_INPUT");
        const result = await this.service.archive(subjectType, input.id, actor);
        return result.ok ? { status: 200, body: { subjectType, subjectId: input.id, archivedAt: result.archivedAt.toISOString() } } : fail(result.error);
      }
      case "unarchive_customer":
      case "unarchive_prospect": {
        const subjectType: PrivacySubjectType = action === "unarchive_customer" ? "customer" : "prospect";
        const parsed = parseUnarchiveSubjectInput(input.body);
        if (!isPrivacyUuid(input.id) || !parsed) return fail("PRIVACY_INVALID_INPUT");
        const result = await this.service.unarchive(subjectType, input.id, parsed.reason, actor);
        return result.ok ? { status: 200, body: { subjectType, subjectId: input.id, archivedAt: null } } : fail(result.error);
      }
      case "anonymize_customer":
      case "anonymize_prospect": {
        const subjectType: PrivacySubjectType = action === "anonymize_customer" ? "customer" : "prospect";
        const parsed = parseAnonymizeSubjectInput(input.body);
        if (!isPrivacyUuid(input.id) || !parsed) return fail("PRIVACY_INVALID_INPUT");
        const consumedAt = await this.freshOtp.lastConsumedAt(auth.session.userId, auth.session.sessionId);
        if (!isFreshOtp(consumedAt, this.freshOtp.now?.() ?? new Date(), this.freshOtp.windowMs)) return { status: 403, body: { error: "AUTH_FRESH_OTP_REQUIRED" } };
        const result = await this.service.anonymize(subjectType, input.id, parsed.confirmName, actor);
        if (!result.ok) return fail(result.error);
        return { status: 200, body: { anonymizationEventId: result.event.eventId, subjectType, subjectId: input.id, executedAt: result.event.executedAt.toISOString(), alreadyAnonymized: result.alreadyAnonymized } };
      }
      case "holds_list": {
        const query = parseRetentionHoldListQuery(input.query);
        if (!query || Object.keys(input.query ?? {}).some((key) => key !== "scopeType" && key !== "scopeId")) return fail("PRIVACY_INVALID_INPUT");
        return { status: 200, body: { holds: await this.service.listHolds(query.scopeType, query.scopeId) } };
      }
      case "hold_create": {
        const parsed = parseCreateRetentionHoldInput(input.body);
        if (!parsed) return fail("PRIVACY_INVALID_INPUT");
        const result = await this.service.createHold(parsed, actor);
        return result.ok ? { status: 201, body: { hold: result.hold } } : fail(result.error);
      }
      case "hold_release": {
        if (!isPrivacyUuid(input.id) || !emptyBody(input.body)) return fail("PRIVACY_INVALID_INPUT");
        const result = await this.service.releaseHold(input.id, actor);
        return result.ok ? { status: 200, body: { hold: result.hold } } : fail(result.error);
      }
    }
  }
}

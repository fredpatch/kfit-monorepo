import type { OnboardingErrorCode, OnboardingResponse } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { OnboardingCommand, OnboardingFailure, OnboardingService } from "../services/onboarding.service.js";

const errors: Record<OnboardingFailure | "invalid", OnboardingErrorCode> = {
  invalid: "ONBOARDING_INVALID_INPUT", not_found: "ONBOARDING_NOT_FOUND", invalid_state: "ONBOARDING_INVALID_STATE",
  item_not_found: "ONBOARDING_ITEM_NOT_FOUND", item_forbidden: "ONBOARDING_ITEM_FORBIDDEN", item_resolved: "ONBOARDING_ITEM_RESOLVED",
  reason_required: "ONBOARDING_REASON_REQUIRED", blocked: "ONBOARDING_BLOCKED", start_date_required: "ONBOARDING_START_DATE_REQUIRED",
  policy_invalid: "ONBOARDING_POLICY_INVALID", capacity_required: "ONBOARDING_CAPACITY_REQUIRED", capacity_exhausted: "ONBOARDING_CAPACITY_EXHAUSTED", capacity_invalid: "ONBOARDING_CAPACITY_INVALID",
};
export class OnboardingController {
  constructor(private readonly service: Pick<OnboardingService, "execute">) {}
  async execute(context: AuthHttpRequestContext, subscriptionId: string, action: OnboardingCommand["action"], body: unknown, itemId?: string): Promise<HttpJsonResponse<OnboardingResponse | { error: string }>> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin")) return { status: 403, body: { error: "ONBOARDING_ADMIN_FORBIDDEN" } };
    const result = await this.service.execute(subscriptionId, action, body, itemId, {
      userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null,
    });
    if (result.status === "ok") return { status: 200, body: { onboarding: result.onboarding } };
    const status = result.status === "not_found" || result.status === "item_not_found" ? 404
      : result.status === "item_forbidden" ? 403 : ["invalid", "reason_required", "capacity_invalid", "start_date_required"].includes(result.status) ? 400 : 409;
    return { status, body: { error: errors[result.status] } };
  }
}

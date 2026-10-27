import type { ConsentCommand, ConsentDefinitionCommand, ConsentDefinitionService, ConsentService } from "../services/consent.service.js";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import { isFreshOtp } from "../../auth/services/policies/session.policy.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { FreshOtpCheck } from "../../questionnaires/controllers/questionnaire.controller.js";
import type { ConsentActor, ConsentResult } from "../services/consent.service.js";
function response(result: ConsentResult): HttpJsonResponse {
  if (result.ok) return { status: 200, body: result.body };
  const status = result.error === "CONSENT_INVALID_INPUT" || result.error === "CONSENT_TYPE_NOT_REQUESTED" ? 400 : result.error === "CONSENT_NOT_FOUND" ? 404
    : result.error === "CONSENT_REVOCATION_FORBIDDEN" ? 403 : result.error.startsWith("CONSENT_LINK_") ? 410 : 409;
  return { status, body: { error: result.error } };
}
export class ConsentController {
  constructor(private readonly service: Pick<ConsentService, "execute" | "publicAccess">,
    private readonly definitionService?: Pick<ConsentDefinitionService, "execute">, private readonly freshOtp?: FreshOtpCheck) {}
  // Publishing changes the legal text customers sign, so it needs a fresh sensitive-action OTP (D7). No OTP lookup fails closed.
  async definitions(context: AuthHttpRequestContext, action: ConsentDefinitionCommand["action"], body: unknown, definitionId?: string): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin") || !this.definitionService) return { status: 403, body: { error: "CONSENT_ADMIN_FORBIDDEN" } };
    if (action === "definition_publish") {
      const consumedAt = this.freshOtp ? await this.freshOtp.lastConsumedAt(auth.session.userId, auth.session.sessionId) : null;
      if (!this.freshOtp || !isFreshOtp(consumedAt, this.freshOtp.now?.() ?? new Date(), this.freshOtp.windowMs)) return { status: 403, body: { error: "AUTH_FRESH_OTP_REQUIRED" } };
    }
    return response(await this.definitionService.execute(action, body, definitionId, { userId: auth.session.userId, requestId: context.requestId,
      ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null }));
  }
  async execute(context: AuthHttpRequestContext, subscriptionId: string, action: ConsentCommand["action"], body: unknown, selector?: string): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin")) return { status: 403, body: { error: "CONSENT_ADMIN_FORBIDDEN" } };
    return response(await this.service.execute(subscriptionId, action, body, selector, { userId: auth.session.userId, requestId: context.requestId,
      ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null }));
  }
  async publicAccess(token: string, body: unknown, submit: boolean, actor: ConsentActor): Promise<HttpJsonResponse> {
    return response(await this.service.publicAccess(token, body, submit, actor));
  }
}

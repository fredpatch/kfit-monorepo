import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import { isFreshOtp } from "../../auth/services/policies/session.policy.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { QuestionnaireActor, QuestionnaireCommand, QuestionnaireResult, QuestionnaireService, QuestionnaireTemplateService, TemplateCommand } from "../services/questionnaire.service.js";
function response(result: QuestionnaireResult): HttpJsonResponse {
  if (result.ok) return { status: 200, body: result.body };
  const status = ["QUESTIONNAIRE_INVALID_INPUT", "QUESTIONNAIRE_TEMPLATE_INVALID", "QUESTIONNAIRE_ANSWERS_INVALID"].includes(result.error) ? 400
    : result.error === "QUESTIONNAIRE_NOT_FOUND" ? 404 : result.error === "QUESTIONNAIRE_HEALTH_CONSENT_REQUIRED" || result.error === "QUESTIONNAIRE_HEALTH_CONSENT_WITHDRAWN" ? 403 : result.error.startsWith("QUESTIONNAIRE_LINK_") ? 410 : 409;
  return { status, body: { error: result.error } };
}
/** Latest consumed sensitive-action OTP of this session (UX-14c). Absent → answers are never shown (fail closed). */
export type FreshOtpCheck = { lastConsumedAt(userId: string, sessionId: string): Promise<Date | null>; windowMs: number; now?: () => Date };
export class QuestionnaireController {
  constructor(private readonly service: Pick<QuestionnaireService, "execute" | "publicAccess">, private readonly templates: Pick<QuestionnaireTemplateService, "execute">,
    private readonly freshOtp?: FreshOtpCheck) {}
  async admin(context: AuthHttpRequestContext, action: QuestionnaireCommand["action"] | TemplateCommand["action"], body: unknown, subscriptionId: string, selector?: string): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context); if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin")) return { status: 403, body: { error: "QUESTIONNAIRE_ADMIN_FORBIDDEN" } };
    if (action === "view_answers") {
      const consumedAt = this.freshOtp ? await this.freshOtp.lastConsumedAt(auth.session.userId, auth.session.sessionId) : null;
      if (!this.freshOtp || !isFreshOtp(consumedAt, this.freshOtp.now?.() ?? new Date(), this.freshOtp.windowMs)) return { status: 403, body: { error: "AUTH_FRESH_OTP_REQUIRED" } };
    }
    const actor = { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null };
    return response(await (["list", "create", "publish", "new_version", "assignment_list", "assignment_set"].includes(action)
      ? this.templates.execute(action as TemplateCommand["action"], body, selector, actor)
      : this.service.execute(subscriptionId, action as QuestionnaireCommand["action"], body, selector, actor)));
  }
  async publicAccess(token: string, body: unknown, submit: boolean, actor: QuestionnaireActor): Promise<HttpJsonResponse> { return response(await this.service.publicAccess(token, body, submit, actor)); }
}

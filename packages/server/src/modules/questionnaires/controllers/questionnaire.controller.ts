import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { QuestionnaireActor, QuestionnaireCommand, QuestionnaireResult, QuestionnaireService, QuestionnaireTemplateService, TemplateCommand } from "../services/questionnaire.service.js";
function response(result: QuestionnaireResult): HttpJsonResponse {
  if (result.ok) return { status: 200, body: result.body };
  const status = ["QUESTIONNAIRE_INVALID_INPUT", "QUESTIONNAIRE_TEMPLATE_INVALID", "QUESTIONNAIRE_ANSWERS_INVALID"].includes(result.error) ? 400
    : result.error === "QUESTIONNAIRE_NOT_FOUND" ? 404 : result.error === "QUESTIONNAIRE_HEALTH_CONSENT_REQUIRED" ? 403 : result.error.startsWith("QUESTIONNAIRE_LINK_") ? 410 : 409;
  return { status, body: { error: result.error } };
}
export class QuestionnaireController {
  constructor(private readonly service: Pick<QuestionnaireService, "execute" | "publicAccess">, private readonly templates: Pick<QuestionnaireTemplateService, "execute">) {}
  async admin(context: AuthHttpRequestContext, action: QuestionnaireCommand["action"] | TemplateCommand["action"], body: unknown, subscriptionId: string, selector?: string): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context); if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return { status: 403, body: { error: "QUESTIONNAIRE_ADMIN_FORBIDDEN" } };
    const actor = { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null };
    return response(await (["list", "create", "publish", "new_version"].includes(action)
      ? this.templates.execute(action as TemplateCommand["action"], body, selector, actor)
      : this.service.execute(subscriptionId, action as QuestionnaireCommand["action"], body, selector, actor)));
  }
  async publicAccess(token: string, body: unknown, submit: boolean, actor: QuestionnaireActor): Promise<HttpJsonResponse> { return response(await this.service.publicAccess(token, body, submit, actor)); }
}

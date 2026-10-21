import type { ConsentCommand, ConsentService } from "../services/consent.service.js";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { ConsentActor, ConsentResult } from "../services/consent.service.js";
function response(result: ConsentResult): HttpJsonResponse {
  if (result.ok) return { status: 200, body: result.body };
  const status = result.error === "CONSENT_INVALID_INPUT" ? 400 : result.error === "CONSENT_NOT_FOUND" ? 404
    : result.error === "CONSENT_REVOCATION_FORBIDDEN" ? 403 : result.error.startsWith("CONSENT_LINK_") ? 410 : 409;
  return { status, body: { error: result.error } };
}
export class ConsentController {
  constructor(private readonly service: Pick<ConsentService, "execute" | "publicAccess">) {}
  async execute(context: AuthHttpRequestContext, subscriptionId: string, action: ConsentCommand["action"], body: unknown, selector?: string): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return { status: 403, body: { error: "CONSENT_ADMIN_FORBIDDEN" } };
    return response(await this.service.execute(subscriptionId, action, body, selector, { userId: auth.session.userId, requestId: context.requestId,
      ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null }));
  }
  async publicAccess(token: string, body: unknown, submit: boolean, actor: ConsentActor): Promise<HttpJsonResponse> {
    return response(await this.service.publicAccess(token, body, submit, actor));
  }
}

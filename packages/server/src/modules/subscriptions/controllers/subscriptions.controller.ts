import type { SubscriptionResponse } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { LifecycleCommand, SubscriptionsService } from "../services/subscriptions.service.js";

export class SubscriptionsController {
  constructor(private readonly service: Pick<SubscriptionsService, "execute">) {}
  async execute(context: AuthHttpRequestContext, id: string, action: LifecycleCommand["action"], body: unknown): Promise<HttpJsonResponse<SubscriptionResponse | { error: string }>> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin")) return { status: 403, body: { error: "SUBSCRIPTION_ADMIN_FORBIDDEN" } };
    const result = await this.service.execute(id, action, body, { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null });
    if (result.status === "ok") return { status: 200, body: { subscription: result.subscription } };
    const status = result.error === "SUBSCRIPTION_NOT_FOUND" ? 404 : ["SUBSCRIPTION_INVALID_INPUT", "SUBSCRIPTION_RESUME_DATE_INVALID", "SUBSCRIPTION_COMPLETION_REASON_REQUIRED"].includes(result.error) ? 400 : 409;
    return { status, body: { error: result.error } };
  }
}

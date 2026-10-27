import type { ProgressResponse, GoalsResponse } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { ProgressCommand, ProgressService } from "../services/progress.service.js";
export class ProgressController {
  constructor(private readonly service: Pick<ProgressService, "execute">) {}
  async execute(context: AuthHttpRequestContext, id: string, action: ProgressCommand["action"], body: unknown): Promise<HttpJsonResponse<ProgressResponse | GoalsResponse | { error: string }>> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin")) return { status: 403, body: { error: "PROGRESS_ADMIN_FORBIDDEN" } };
    const result = await this.service.execute(id, action, body, { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null });
    if (result.ok) return { status: 200, body: result.body };
    return { status: result.error.endsWith("NOT_FOUND") ? 404 : ["PROGRESS_SUBSCRIPTION_NOT_ELIGIBLE", "PROGRESS_HEALTH_CONSENT_REQUIRED", "PROGRESS_MEASUREMENT_DUPLICATE", "GOAL_SUBSCRIPTION_NOT_ELIGIBLE", "GOAL_TRANSITION_INVALID"].includes(result.error) ? 409 : 400, body: { error: result.error } };
  }
}

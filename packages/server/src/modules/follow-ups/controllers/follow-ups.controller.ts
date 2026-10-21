import type { FollowUpResponse, FollowUpQueueResponse } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { FollowUpCommand, FollowUpsService } from "../services/follow-ups.service.js";
export class FollowUpsController {
  constructor(private readonly service: Pick<FollowUpsService, "execute">) {}
  async execute(context: AuthHttpRequestContext, id: string, action: FollowUpCommand["action"], body: unknown): Promise<HttpJsonResponse<FollowUpResponse | FollowUpQueueResponse | { error: string }>> {
    const auth = requireAuthenticatedSession(context); if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return { status: 403, body: { error: "FOLLOW_UP_ADMIN_FORBIDDEN" } };
    const result = await this.service.execute(id, action, body, { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null });
    if (result.ok) return { status: 200, body: result.body };
    return { status: result.error === "FOLLOW_UP_NOT_FOUND" ? 404 : ["FOLLOW_UP_TRANSITION_INVALID", "FOLLOW_UP_SUBSCRIPTION_NOT_ACTIVE", "FOLLOW_UP_CADENCE_NOT_APPLICABLE"].includes(result.error) ? 409 : 400, body: { error: result.error } };
  }
}

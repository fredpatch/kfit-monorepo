import type {
  DashboardAnalyticsResponse,
  DashboardAlertsResponse,
  DashboardErrorCode,
} from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import { hasRole } from "../../auth/services/roles.js";
import type {
  AuthHttpRequestContext,
  HttpJsonResponse,
} from "../../auth/types/auth.http.types.js";
import type { DashboardAnalyticsService } from "../services/analytics.service.js";
import type { DashboardAlertsService } from "../services/alerts.service.js";

export class DashboardAnalyticsController {
  constructor(
    private readonly service: Pick<DashboardAnalyticsService, "analytics">,
    private readonly alertsService: Pick<DashboardAlertsService, "alerts">,
  ) {}
  async handle(
    context: AuthHttpRequestContext,
    action: "analytics" | "alerts",
    query: { periode?: unknown },
  ): Promise<
    HttpJsonResponse<
      | DashboardAnalyticsResponse
      | DashboardAlertsResponse
      | { error: DashboardErrorCode }
      | { error: string }
    >
  > {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!hasRole(auth.session, "admin"))
      return { status: 403, body: { error: "DASHBOARD_ADMIN_FORBIDDEN" } };
    if (action === "analytics") {
      const result = await this.service.analytics(query);
      return result.status === "invalid"
        ? { status: 400, body: { error: "DASHBOARD_INVALID_INPUT" } }
        : { status: 200, body: result.response };
    }
    return {
      status: 200,
      body: await this.alertsService.alerts({
        userId: auth.session.userId,
        requestId: context.requestId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      }),
    };
  }
}

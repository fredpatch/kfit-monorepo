import type { AgendaResponse, TodayResponse } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { TodayService } from "../services/today.service.js";

export class TodayController {
  constructor(private readonly service: Pick<TodayService, "agenda" | "today">) {}

  async handle(context: AuthHttpRequestContext, action: "agenda" | "today", query: { du?: unknown; au?: unknown; statut?: unknown } = {}): Promise<HttpJsonResponse<AgendaResponse | TodayResponse | { error: string; reason?: string }>> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return { status: 403, body: { error: "DASHBOARD_ADMIN_FORBIDDEN" } };
    if (action === "agenda") {
      const result = await this.service.agenda(query);
      return result.status === "ok" ? { status: 200, body: result.response } : { status: 400, body: { error: "DASHBOARD_INVALID_INPUT", reason: result.reason } };
    }
    const actor = { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null };
    return { status: 200, body: await this.service.today(actor) };
  }
}

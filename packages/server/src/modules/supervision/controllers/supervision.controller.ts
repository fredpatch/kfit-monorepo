import { supervisionSecurityPeriods, type SupervisionErrorCode } from "@kfit/shared";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
import type { SupervisionService } from "../services/supervision.service.js";

export type SupervisionAction = "overview" | "status" | "security" | "run_job" | "simulate_purge";
const fail = (status: number, error: SupervisionErrorCode): HttpJsonResponse => ({ status, body: { error } });

/** O1: admin only; a user only reads operational counts, never customer data. */
export class SupervisionController {
  constructor(private readonly service: Pick<SupervisionService, "overview" | "status" | "security" | "runJob" | "simulatePurge">) {}

  async handle(context: AuthHttpRequestContext, action: SupervisionAction, input: { jobKey?: string | undefined; query?: Record<string, unknown> }): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return fail(403, "SUPERVISION_ADMIN_FORBIDDEN");
    const actor = { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null };
    switch (action) {
      case "overview":
        return { status: 200, body: await this.service.overview() };
      case "status":
        return { status: 200, body: await this.service.status(auth.session.userId) };
      case "security": {
        const query = input.query ?? {};
        const days = Number(query.days);
        if (Object.keys(query).some((key) => key !== "days") || !supervisionSecurityPeriods.includes(days as (typeof supervisionSecurityPeriods)[number])) return fail(400, "SUPERVISION_INVALID_INPUT");
        return { status: 200, body: await this.service.security(days) };
      }
      case "run_job": {
        const result = await this.service.runJob(input.jobKey ?? "", actor);
        if (result.status === "not_runnable") return fail(400, "SUPERVISION_JOB_NOT_RUNNABLE");
        if (result.status === "busy") return fail(409, "SUPERVISION_JOB_BUSY");
        if (result.status === "rate_limited") return fail(429, "SUPERVISION_RATE_LIMITED");
        return { status: 200, body: result.run };
      }
      case "simulate_purge":
        return { status: 200, body: await this.service.simulatePurge(actor) };
    }
  }
}

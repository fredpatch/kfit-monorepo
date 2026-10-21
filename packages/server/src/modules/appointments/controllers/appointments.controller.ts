import type { AppointmentBody, AppointmentActor, AppointmentResult, AppointmentsService } from "../services/appointments.service.js";
import { requireAuthenticatedSession } from "../../auth/middleware/auth.middleware.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../../auth/types/auth.http.types.js";
const response = (result: AppointmentResult): HttpJsonResponse<AppointmentBody | { error: string }> => result.ok ? { status: 200, body: result.body } : {
  status: result.error === "APPOINTMENT_NOT_FOUND" || result.error === "APPOINTMENT_TOKEN_INVALID" ? 404
    : result.error === "APPOINTMENT_INVALID_INPUT" ? 400 : result.error.startsWith("APPOINTMENT_TOKEN_") ? 410 : 409, body: { error: result.error },
};
export class AppointmentsController {
  constructor(private readonly service: Pick<AppointmentsService, "admin" | "publicAccess">) {}
  async admin(context: AuthHttpRequestContext, id: string, action: Parameters<AppointmentsService["admin"]>[1], body: unknown): Promise<HttpJsonResponse<AppointmentBody | { error: string }>> {
    const auth = requireAuthenticatedSession(context); if (!auth.ok) return auth.response;
    if (auth.session.role !== "admin") return { status: 403, body: { error: "APPOINTMENT_ADMIN_FORBIDDEN" } };
    return response(await this.service.admin(id, action, body, { userId: auth.session.userId, requestId: context.requestId, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null }));
  }
  async publicAccess(token: string, body: unknown, submit: boolean, actor: AppointmentActor) { return response(await this.service.publicAccess(token, body, submit, actor)); }
}

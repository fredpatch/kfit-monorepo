import type { AppointmentAction, AppointmentDetailResponse, AppointmentErrorCode, AppointmentListResponse, AppointmentResponseLinkResponse, PublicAppointmentResponse } from "@kfit/shared";
import { parseLifecycleDate } from "../../subscriptions/services/subscription-lifecycle.policy.js";
export type AppointmentActor = { userId: string | null; requestId: string; ipAddress: string | null; userAgent: string | null };
export type AppointmentCommand =
  | { action: "list" } | { action: "read" } | { action: "confirm" } | { action: "missed" }
  | { action: "schedule"; start: Date; end: Date; componentId: string | null; location: string | null }
  | { action: "reschedule"; start: Date; end: Date; location?: string | null }
  | { action: "cancel" | "restore-component"; reason: string }
  | { action: "complete"; override: boolean; reason: string | null }
  | { action: "response-link"; expiresAt: Date }
  | { action: "decline" }
  | { action: "request_reschedule"; note: string | null };
export type AppointmentBody = AppointmentDetailResponse | AppointmentListResponse | AppointmentResponseLinkResponse | PublicAppointmentResponse;
export type AppointmentResult = { ok: true; body: AppointmentBody } | { ok: false; error: AppointmentErrorCode };
export const appointmentFailure = (error: AppointmentErrorCode): AppointmentResult => ({ ok: false, error });
export interface AppointmentsRepository {
  execute(id: string, command: AppointmentCommand, actor: AppointmentActor): Promise<AppointmentResult>;
  publicAccess(token: string, command: AppointmentCommand | null, actor: AppointmentActor, rejectedInput?: boolean): Promise<AppointmentResult>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (body: unknown): body is Record<string, unknown> => !!body && typeof body === "object" && !Array.isArray(body);
const reason = (value: unknown) => typeof value === "string" && value.trim() && value.length <= 2000 ? value.trim() : null;
const fields: Record<"list" | "read" | "schedule" | AppointmentAction, string[]> = {
  list: [], read: [], schedule: ["scheduledStart", "scheduledEnd", "componentId", "locationOrChannel"], reschedule: ["scheduledStart", "scheduledEnd", "locationOrChannel"],
  confirm: [], cancel: ["reason"], complete: ["earlyCompletionOverride", "overrideReason"], missed: [], "restore-component": ["reason"], "response-link": ["expiresAt"],
};
export class AppointmentsService {
  constructor(private readonly repository: AppointmentsRepository) {}
  async admin(id: string, action: keyof typeof fields, body: unknown, actor: AppointmentActor): Promise<AppointmentResult> {
    if (!uuid.test(id) || !object(body) || Object.keys(body).some(key => !fields[action].includes(key))) return appointmentFailure("APPOINTMENT_INVALID_INPUT");
    let command: AppointmentCommand;
    if (action === "schedule" || action === "reschedule") {
      const start = parseLifecycleDate(body.scheduledStart), end = parseLifecycleDate(body.scheduledEnd), location = body.locationOrChannel;
      if (!start || !end || end <= start || location !== undefined && location !== null && (typeof location !== "string" || location.length > 300)) return appointmentFailure("APPOINTMENT_INVALID_INPUT");
      const trimmed = typeof location === "string" ? location.trim() || null : null;
      if (action === "schedule") {
        if (body.componentId !== undefined && body.componentId !== null && (typeof body.componentId !== "string" || !uuid.test(body.componentId))) return appointmentFailure("APPOINTMENT_COMPONENT_INVALID");
        command = { action, start, end, componentId: typeof body.componentId === "string" ? body.componentId : null, location: trimmed };
      } else command = { action, start, end, ...(location !== undefined ? { location: trimmed } : {}) };
    } else if (action === "cancel" || action === "restore-component") {
      const text = reason(body.reason); if (!text) return appointmentFailure("APPOINTMENT_INVALID_INPUT"); command = { action, reason: text };
    } else if (action === "complete") {
      if (typeof body.earlyCompletionOverride !== "boolean" || body.overrideReason !== undefined && !reason(body.overrideReason)) return appointmentFailure("APPOINTMENT_INVALID_INPUT");
      command = { action, override: body.earlyCompletionOverride, reason: reason(body.overrideReason) };
      if (command.override && !command.reason) return appointmentFailure("APPOINTMENT_INVALID_INPUT");
    } else if (action === "response-link") {
      const expiresAt = parseLifecycleDate(body.expiresAt); if (!expiresAt) return appointmentFailure("APPOINTMENT_INVALID_INPUT"); command = { action, expiresAt };
    } else command = { action };
    return this.repository.execute(id, command, actor);
  }
  async publicAccess(token: string, body: unknown, submit: boolean, actor: AppointmentActor): Promise<AppointmentResult> {
    if (!submit) return this.repository.publicAccess(token, null, actor);
    if (!object(body) || Object.keys(body).some(key => key !== "action" && key !== "rescheduleNote")) return this.repository.publicAccess(token, null, actor, true);
    let command: AppointmentCommand;
    if (body.action === "confirm" || body.action === "decline") {
      if (body.rescheduleNote !== undefined) return this.repository.publicAccess(token, null, actor, true);
      command = { action: body.action };
    } else if (body.action === "request_reschedule") {
      if (body.rescheduleNote !== undefined && (typeof body.rescheduleNote !== "string" || body.rescheduleNote.length > 500)) return this.repository.publicAccess(token, null, actor, true);
      command = { action: "request_reschedule", note: typeof body.rescheduleNote === "string" ? body.rescheduleNote.trim() || null : null };
    } else return this.repository.publicAccess(token, null, actor, true);
    return this.repository.publicAccess(token, command, { ...actor, userId: null });
  }
}

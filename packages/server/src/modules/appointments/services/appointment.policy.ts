import type { AppointmentAction, AppointmentErrorCode, AppointmentResponseAction } from "@kfit/shared";
export const appointmentTransitions: Record<Exclude<AppointmentAction, "response-link" | "restore-component"> | "request_reschedule", readonly string[]> = {
  confirm: ["scheduled"], cancel: ["scheduled", "confirmed"], reschedule: ["scheduled", "confirmed", "reschedule_requested"],
  complete: ["scheduled", "confirmed"], missed: ["scheduled", "confirmed"], request_reschedule: ["scheduled", "confirmed"],
};
export const consumptiveEvents = ["appointment_completed", "late_customer_cancel", "missed"];
type PolicyRow = { variantId: string | null; lateCancelNoticeHours: number | null; lateCancelConsumesComponent: boolean; missedConsumesComponent: boolean };
export type AppointmentPolicy = Omit<PolicyRow, "variantId">;
export function resolveAppointmentPolicy(rows: PolicyRow[], variantId: string | null): AppointmentPolicy | null {
  const base = rows.filter(r => r.variantId === null), variants = variantId ? rows.filter(r => r.variantId === variantId) : [];
  if (base.length > 1 || variants.length > 1) return null;
  const policy = { lateCancelNoticeHours: variants[0]?.lateCancelNoticeHours ?? base[0]?.lateCancelNoticeHours ?? null,
    lateCancelConsumesComponent: variants[0]?.lateCancelConsumesComponent ?? base[0]?.lateCancelConsumesComponent ?? false,
    missedConsumesComponent: variants[0]?.missedConsumesComponent ?? base[0]?.missedConsumesComponent ?? false };
  return policy.lateCancelNoticeHours === null || Number.isInteger(policy.lateCancelNoticeHours) && policy.lateCancelNoticeHours >= 0 ? policy : null;
}
// Fred's S5.2 decision: null disables the late window; the exact deadline is on time.
export function isLateCancellation(now: Date, start: Date, hours: number | null): boolean { return hours !== null && now.getTime() > start.getTime() - hours * 3600000; }
export const publicActions = (status: string): AppointmentResponseAction[] => status === "scheduled" ? ["confirm", "decline", "request_reschedule"] : status === "confirmed" ? ["decline", "request_reschedule"] : [];
export type AppointmentToken = { resourceType: string; action: string; requiresOtp: boolean; maxUses: number | null; useCount: number; usedAt: Date | null; revokedAt: Date | null; expiresAt: Date };
export const appointmentTokenScope = { resourceType: "appointment", action: "appointment_response" } as const;
export function validateAppointmentToken(token: AppointmentToken, now = new Date()): AppointmentErrorCode | null {
  if (token.resourceType !== appointmentTokenScope.resourceType || token.action !== appointmentTokenScope.action || token.requiresOtp || token.maxUses !== 1) return "APPOINTMENT_TOKEN_INVALID";
  if (token.revokedAt) return "APPOINTMENT_TOKEN_REVOKED";
  if (token.usedAt || token.useCount !== 0) return "APPOINTMENT_TOKEN_CONSUMED";
  return token.expiresAt <= now ? "APPOINTMENT_TOKEN_EXPIRED" : null;
}

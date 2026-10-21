export const appointmentActions = ["confirm", "cancel", "reschedule", "complete", "missed", "restore-component", "response-link"] as const;
export type AppointmentAction = (typeof appointmentActions)[number];
export const appointmentResponseActions = ["confirm", "decline", "request_reschedule"] as const;
export type AppointmentResponseAction = (typeof appointmentResponseActions)[number];
export const appointmentApiRoutes = {
  list: "/admin/subscriptions/:subscriptionId/appointments", detail: "/admin/appointments/:appointmentId",
  confirm: "/admin/appointments/:appointmentId/confirm", cancel: "/admin/appointments/:appointmentId/cancel",
  reschedule: "/admin/appointments/:appointmentId/reschedule", complete: "/admin/appointments/:appointmentId/complete",
  missed: "/admin/appointments/:appointmentId/missed", "restore-component": "/admin/appointments/:appointmentId/restore-component",
  "response-link": "/admin/appointments/:appointmentId/response-link", public: "/public/appointments/:token",
} as const;
export const appointmentErrorCodes = [
  "APPOINTMENT_NOT_FOUND", "APPOINTMENT_INVALID_INPUT", "APPOINTMENT_TRANSITION_INVALID", "APPOINTMENT_SUBSCRIPTION_NOT_ACTIVE",
  "APPOINTMENT_COMPONENT_INVALID", "APPOINTMENT_COMPONENT_EXHAUSTED", "APPOINTMENT_DUPLICATE_SLOT", "APPOINTMENT_TOO_EARLY",
  "APPOINTMENT_REPLACEMENT_EXISTS", "APPOINTMENT_COMPONENT_NOT_CONSUMED", "APPOINTMENT_COMPONENT_ALREADY_RESTORED",
  "APPOINTMENT_TOKEN_INVALID", "APPOINTMENT_TOKEN_EXPIRED", "APPOINTMENT_TOKEN_REVOKED", "APPOINTMENT_TOKEN_CONSUMED",
  "APPOINTMENT_POLICY_INVALID", "APPOINTMENT_ADMIN_FORBIDDEN", "APPOINTMENT_RATE_LIMITED", "APPOINTMENT_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type AppointmentErrorCode = (typeof appointmentErrorCodes)[number];
export type ScheduleAppointmentInput = { scheduledStart: string; scheduledEnd: string; componentId?: string | null; locationOrChannel?: string | null };
export type RescheduleAppointmentInput = Omit<ScheduleAppointmentInput, "componentId">;
export type CancelAppointmentInput = { reason: string };
export type CompleteAppointmentInput = { earlyCompletionOverride: boolean; overrideReason?: string };
export type RestoreAppointmentComponentInput = { reason: string };
export type AppointmentResponseLinkInput = { expiresAt: string };
export type PublicAppointmentResponseInput = { action: AppointmentResponseAction; rescheduleNote?: string };
export type AppointmentComponent = { id: string; labelSnapshot: string; quantityEntitled: number; quantityConsumed: number; quantityOwedByCoach: number };
export type AppointmentDetail = {
  id: string; subscriptionId: string; serviceName: string; scheduledStart: string; scheduledEnd: string; locationOrChannel: string | null;
  status: string; customerResponseStatus: string; rescheduleNote: string | null; completedAt: string | null; cancelledAt: string | null; cancelledByType: string | null;
  rescheduledFromAppointmentId: string | null; replacementAppointmentId: string | null; component: AppointmentComponent | null;
  policy: { lateCancelNoticeHours: number | null; lateCancelConsumesComponent: boolean; missedConsumesComponent: boolean };
  consumed: boolean; restored: boolean; availableActions: AppointmentAction[];
  events: Array<{ id: string; eventType: string; fromStatus: string | null; toStatus: string | null; actorType: string; reason: string | null; createdAt: string }>;
  responseLinks: Array<{ id: string; expiresAt: string; state: "available" | "expired" | "revoked" | "consumed" }>;
};
export type AppointmentListResponse = { subscriptionId: string; subscriptionStatus: string; components: AppointmentComponent[]; appointments: AppointmentDetail[] };
export type AppointmentDetailResponse = { appointment: AppointmentDetail };
export type AppointmentResponseLinkResponse = { token: string; expiresAt: string };
export type PublicAppointmentDocument = { serviceLabel: string; scheduledStart: string; scheduledEnd: string; locationOrChannel: string | null; availableActions: AppointmentResponseAction[] };
export type PublicAppointmentResponse = { appointment: PublicAppointmentDocument; submitted?: true };

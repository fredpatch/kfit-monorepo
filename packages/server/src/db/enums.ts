export const userRoles = ["admin", "coach"] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ["active", "locked", "archived"] as const;
export type UserStatus = (typeof userStatuses)[number];

export const otpPurposes = [
  "password_recovery",
  "suspicious_device_login",
  "sensitive_action",
] as const;
export type OtpPurpose = (typeof otpPurposes)[number];

export const serviceAvailabilityStatuses = [
  "open",
  "temporarily_closed",
  "waitlist_only",
  "archived",
] as const;

export const pricingModes = ["fixed", "quote"] as const;
export const deliveryTypes = ["one_time", "time_based"] as const;
export const durationUnits = ["day", "week", "month"] as const;

export const requestStatuses = [
  "submitted",
  "contacting",
  "qualification_in_progress",
  "qualified",
  "qualified_with_conditions",
  "waitlisted",
  "rejected",
  "abandoned",
  "converted",
  "closed_duplicate",
] as const;

export const qualificationOutcomes = [
  "qualified",
  "qualified_with_conditions",
  "not_suitable",
  "not_ready",
  "budget_mismatch",
  "capacity_unavailable",
] as const;

export const subscriptionStatuses = [
  "onboarding",
  "awaiting_payment",
  "medical_clearance_required",
  "ready_to_start",
  "active",
  "paused",
  "completion_due",
  "completed",
  "cancelled",
] as const;

export const onboardingItemStatuses = [
  "pending",
  "completed",
  "waived",
  "blocked",
  "not_applicable",
] as const;

export const questionnaireTemplateStatuses = ["draft", "published", "retired"] as const;
export const questionnaireSubmissionStatuses = ["draft", "submitted", "superseded"] as const;

export const medicalClearanceStatuses = [
  "required",
  "awaiting_document",
  "under_review",
  "cleared",
  "waived",
  "closed_not_cleared",
] as const;

export const consentDecisions = ["granted", "refused", "revoked"] as const;
export const consentTypes = [
  "service_contact",
  "health_data",
  "progress_photo_storage",
  "marketing_publication",
] as const;

export const appointmentStatuses = [
  "scheduled",
  "confirmed",
  "reschedule_requested",
  "rescheduled",
  "completed",
  "cancelled",
  "missed",
] as const;

export const customerAppointmentResponses = [
  "pending",
  "confirmed",
  "declined",
  "reschedule_requested",
] as const;

export const followUpStatuses = ["open", "done", "overdue", "cancelled"] as const;
export const goalStatuses = [
  "active",
  "achieved",
  "partially_achieved",
  "not_achieved",
  "paused",
  "cancelled",
] as const;

export const documentStatuses = [
  "draft",
  "available",
  "revoked",
  "archived",
  "pending_purge",
  "purged",
] as const;
export const malwareScanStatuses = ["pending", "clean", "infected", "scan_failed"] as const;

export const paymentProofStatuses = [
  "pending_review",
  "confirmed",
  "partially_confirmed",
  "correction_requested",
  "rejected",
  "duplicate",
  "superseded",
] as const;

export const paymentPlanStatuses = ["draft", "active", "superseded", "settled", "cancelled"] as const;
export const installmentStatuses = [
  "upcoming",
  "due",
  "partially_paid",
  "paid",
  "overdue",
  "waived",
  "cancelled",
] as const;

export const quoteStatuses = [
  "draft",
  "issued",
  "accepted",
  "declined",
  "changes_requested",
  "superseded",
  "expired",
  "cancelled",
] as const;

export const scheduledJobStatuses = ["running", "succeeded", "failed", "skipped"] as const;
export const retentionHoldStatuses = ["active", "released"] as const;

export const currencyCodes = ["XAF"] as const;

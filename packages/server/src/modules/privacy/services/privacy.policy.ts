import { createHash } from "node:crypto";
import type { PrivacySubjectType } from "@kfit/shared";

/*
 * S7.3 privacy policy (Gate 1 approved 2026-10-25). Pure: no I/O. Business rules are the named constants below.
 * ANONYMIZATION_PLAN is the single declarative column plan used by both the anonymize transaction and replay.
 */

export const ANONYMIZATION_PLAN_VERSION = 1;
/** D2: free text → NULL when nullable, else this marker. */
export const REDACTED_TEXT = "[effacé]";
export const PSEUDONYM_PREFIX = "Client anonymisé · ";
/** anonymization_events.reason is NOT NULL; the admin's motive is never stored as free text. */
export const ANONYMIZATION_REASON = "admin_request";
/** D1 precision (Fred 2026-10-25): a customer is archivable only when every subscription is finished. */
export const ARCHIVABLE_SUBSCRIPTION_STATUSES = ["completed", "cancelled"] as const;
/** D1: a prospect is archivable only when every request is in a terminal status. */
export const TERMINAL_REQUEST_STATUSES = ["rejected", "abandoned", "converted", "closed_duplicate"] as const;
/** D3. */
export const PURGE_BATCH_SIZE = 50;
export const PURGE_JOB_KEY = "privacy.purge";
export const PURGE_JOB_CRON = "0 3 * * *";
export const PURGE_TIMEZONE = "Africa/Libreville";
export const OUTBOX_ANONYMIZED_ERROR_CODE = "SUBJECT_ANONYMIZED";
export const OPEN_OUTBOX_STATUSES = ["pending", "sending"] as const;

/** D2a: « Client anonymisé · XXXX », XXXX = first 4 hex of sha256(subject id), uppercase. */
export function pseudonymFor(subjectId: string): string {
  return PSEUDONYM_PREFIX + createHash("sha256").update(subjectId).digest("hex").slice(0, 4).toUpperCase();
}
/** D2a: WhatsApp placeholder (the column stays NOT NULL). */
export const whatsappPlaceholderFor = (subjectId: string) => `anon-${subjectId}`;

/** D9: trim + Unicode NFC + collapsed inner whitespace, case-sensitive. */
export function normalizeConfirmName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
export function confirmationMatches(typed: string, displayedName: string): boolean {
  return normalizeConfirmName(typed) === normalizeConfirmName(displayedName);
}

export function purgeAfter(anonymizedAt: Date, delayDays: number): Date {
  return new Date(anonymizedAt.getTime() + delayDays * 86_400_000);
}

export type ArchiveRefusal = "not_found" | "has_active_subscription" | "has_open_request";
export function customerArchiveRefusal(customer: { exists: boolean }, subscriptionStatuses: readonly string[]): ArchiveRefusal | null {
  if (!customer.exists) return "not_found";
  return subscriptionStatuses.every((status) => (ARCHIVABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) ? null : "has_active_subscription";
}
export function prospectArchiveRefusal(prospect: { exists: boolean }, requestStatuses: readonly string[]): ArchiveRefusal | null {
  if (!prospect.exists) return "not_found";
  return requestStatuses.every((status) => (TERMINAL_REQUEST_STATUSES as readonly string[]).includes(status)) ? null : "has_open_request";
}

/** S7.3b D1: « Archiver » is offered on the fiche exactly when the archive command would accept it. */
export function customerArchivable(archivedAt: Date | null, subscriptionStatuses: readonly string[]): boolean {
  return archivedAt === null && customerArchiveRefusal({ exists: true }, subscriptionStatuses) === null;
}
/** ARCH-01 D9: « Désarchiver » is offered for an archived subject that is not anonymized (anonymization is irreversible, D6). */
export function subjectUnarchivable(archivedAt: Date | null, anonymizedAt: Date | null): boolean {
  return archivedAt !== null && anonymizedAt === null;
}
/** S7.3b D5: same for a prospect on the request detail. */
export function prospectArchivable(archivedAt: Date | null, requestStatuses: readonly string[]): boolean {
  return archivedAt === null && prospectArchiveRefusal({ exists: true }, requestStatuses) === null;
}

export type AnonymizeDecision =
  | { outcome: "refused"; reason: "not_found" | "not_archived" | "hold_active" | "confirmation_mismatch" }
  | { outcome: "already_anonymized" }
  | { outcome: "proceed" };
/** Order matters: an already-anonymized subject is idempotent (D10) even though its name is now the pseudonym. */
export function anonymizeDecision(input: {
  subject: { archivedAt: Date | null; anonymizedAt: Date | null; fullName: string } | null;
  activeHoldCount: number;
  confirmName: string;
}): AnonymizeDecision {
  if (!input.subject) return { outcome: "refused", reason: "not_found" };
  if (input.subject.anonymizedAt) return { outcome: "already_anonymized" };
  if (!input.subject.archivedAt) return { outcome: "refused", reason: "not_archived" };
  if (!confirmationMatches(input.confirmName, input.subject.fullName)) return { outcome: "refused", reason: "confirmation_mismatch" };
  if (input.activeHoldCount > 0) return { outcome: "refused", reason: "hold_active" };
  return { outcome: "proceed" };
}

/* ------------------------------------------------------------------ */
/* Declarative column plan (D2, D8).                                    */
/* ------------------------------------------------------------------ */

/** pseudonym/placeholder/now take the row's own id or the run's timestamp; empty_json keeps arrays as []. */
export type ColumnAction = "pseudonym" | "whatsapp_placeholder" | "null" | "redacted_text" | "empty_json" | "now";
/**
 * How the rows of a table are tied to the subject:
 * subject — the subject row itself; prospect — rows of the (source) prospect; request — rows of that prospect's requests;
 * subscription — rows of the customer's subscriptions; subscription_component / submission — one hop further;
 * customer — rows with customer_id; notification — notifications tied to the subject; outbox — e-mails of those notifications.
 */
export type PlanLink = "subject" | "prospect" | "request" | "subscription" | "subscription_component" | "submission" | "customer" | "notification" | "outbox";
export type PlanStep = { table: string; link: PlanLink; appliesTo: readonly PrivacySubjectType[]; columns: Readonly<Record<string, ColumnAction>> };

const both = ["customer", "prospect"] as const;
const customerOnly = ["customer"] as const;

export const ANONYMIZATION_PLAN: readonly PlanStep[] = [
  { table: "customers", link: "subject", appliesTo: customerOnly, columns: { full_name: "pseudonym", whatsapp: "whatsapp_placeholder", email: "null", city: "null", anonymized_at: "now" } },
  { table: "prospects", link: "prospect", appliesTo: both, columns: { full_name: "pseudonym", whatsapp: "whatsapp_placeholder", email: "null", city: "null", anonymized_at: "now" } },
  { table: "service_requests", link: "prospect", appliesTo: both, columns: { objective: "null", message: "null" } },
  { table: "contact_attempts", link: "prospect", appliesTo: both, columns: { note: "null" } },
  { table: "qualification_reviews", link: "request", appliesTo: both, columns: { suitability_note: "null", conditions_json: "null", blockers_json: "null" } },
  { table: "waitlist_entries", link: "request", appliesTo: both, columns: { priority_note: "null" } },
  { table: "questionnaire_answers", link: "submission", appliesTo: customerOnly, columns: { answer_json: "empty_json" } },
  { table: "medical_clearance_records", link: "subscription", appliesTo: customerOnly, columns: { note: "null" } },
  { table: "consent_records", link: "customer", appliesTo: customerOnly, columns: { verification_metadata_json: "null" } },
  { table: "progress_measurements", link: "subscription", appliesTo: customerOnly, columns: { feeling_note: "null", weight_kg: "null", waist_cm: "null", hips_cm: "null", chest_cm: "null", body_fat_estimate: "null" } },
  { table: "follow_ups", link: "subscription", appliesTo: customerOnly, columns: { note: "null", next_action: "null" } },
  { table: "appointments", link: "subscription", appliesTo: customerOnly, columns: { reschedule_note: "null", location_or_channel: "null" } },
  { table: "subscription_pauses", link: "subscription", appliesTo: customerOnly, columns: { reason: "redacted_text" } },
  { table: "subscription_status_history", link: "subscription", appliesTo: customerOnly, columns: { reason: "null" } },
  { table: "onboarding_items", link: "subscription", appliesTo: customerOnly, columns: { waiver_reason: "null" } },
  { table: "component_events", link: "subscription_component", appliesTo: customerOnly, columns: { reason: "null" } },
  { table: "payment_proofs", link: "customer", appliesTo: customerOnly, columns: { customer_message: "null", review_note: "null" } },
  { table: "notifications", link: "notification", appliesTo: both, columns: { customer_display_name: "pseudonym", title: "pseudonym", summary: "pseudonym" } },
  { table: "notification_email_outbox", link: "outbox", appliesTo: both, columns: { body_text: "redacted_text", body_html: "null" } },
];

/**
 * Gate 1 inventory rows whose action is not "keep" (column-level). The unit test proves the plan covers each one;
 * documents (→ pending_purge) and secure tokens (→ revoked) are separate steps of the transaction, not columns.
 */
export const PRIVACY_INVENTORY_NON_KEEP: readonly string[] = [
  "customers.full_name", "customers.whatsapp", "customers.email", "customers.city", "customers.anonymized_at",
  "prospects.full_name", "prospects.whatsapp", "prospects.email", "prospects.city", "prospects.anonymized_at",
  "service_requests.objective", "service_requests.message", "contact_attempts.note",
  "qualification_reviews.suitability_note", "qualification_reviews.conditions_json", "qualification_reviews.blockers_json",
  "waitlist_entries.priority_note", "questionnaire_answers.answer_json", "medical_clearance_records.note",
  "consent_records.verification_metadata_json", "progress_measurements.feeling_note", "progress_measurements.weight_kg",
  "progress_measurements.waist_cm", "progress_measurements.hips_cm", "progress_measurements.chest_cm",
  "progress_measurements.body_fat_estimate", "follow_ups.note", "follow_ups.next_action",
  "appointments.reschedule_note", "appointments.location_or_channel", "subscription_pauses.reason",
  "subscription_status_history.reason", "onboarding_items.waiver_reason", "component_events.reason",
  "payment_proofs.customer_message", "payment_proofs.review_note",
  "notifications.customer_display_name", "notifications.title", "notifications.summary",
  "notification_email_outbox.body_text", "notification_email_outbox.body_html",
];

/** Columns the plan must never touch (D2c, D2d, D2g, rule 3 financial facts). */
export const PRIVACY_KEEP_COLUMNS: readonly string[] = [
  "customers.country", "payment_events.external_reference", "payment_events.metadata_json", "payment_events.amount_xaf",
  "receipts.snapshot_json", "quote_versions.service_snapshot_json", "quote_versions.amount_xaf", "goals.label",
  "payment_proofs.claimed_amount_xaf", "payment_proofs.confirmed_amount_xaf", "installments.amount_xaf", "payment_allocations.amount_xaf",
];

export function planFor(subjectType: PrivacySubjectType): PlanStep[] {
  return ANONYMIZATION_PLAN.filter((step) => step.appliesTo.includes(subjectType));
}

# K'FIT Database Schema — Domain Model

> Sprint 0 working document. Conceptual relational model before Drizzle implementation.

## Modeling principles

- PostgreSQL is the system of record.
- Business records use soft archive/delete where applicable; destructive deletion is reserved for controlled purge jobs.
- Historical submissions, accepted terms, financial entries, issued documents and audit events are immutable/versioned after their commit point.
- Subscription lifecycle and payment state are independent axes.
- Public links use random hashed tokens scoped to one resource/action, with expiry and revocation.
- Sensitive operations are auditable.
- V1 is single-coach in the UI, but ownership columns remain structurally ready for future multi-coach support.

## A. Administration, auth and security

### `users`
Coach/admin identity.

Key fields: `id`, `email`, `password_hash`, `status`, `role`, `created_at`, `updated_at`, `archived_at`.

### `auth_sessions`
Server-tracked refresh/session lifecycle.

Key fields: `id`, `user_id`, `token_family_id`, `refresh_token_hash`, `trusted_device_id`, `issued_at`, `expires_at`, `revoked_at`, `last_seen_at`, `ip_hash`, `user_agent_hash`.

### `trusted_devices`
Optional remembered-device trust.

Key fields: `id`, `user_id`, `device_fingerprint_hash`, `trusted_until`, `revoked_at`, timestamps.

### `otp_challenges`
Recovery, unknown-device and sensitive-action OTPs.

Key fields: `id`, `user_id`, `purpose`, `code_hash`, `expires_at`, `attempt_count`, `max_attempts`, `consumed_at`, `delivery_channel`, timestamps.

### `audit_events`
Append-only security/business audit trail.

Key fields: `id`, `actor_user_id`, `actor_type`, `event_type`, `entity_type`, `entity_id`, `result`, `metadata_json`, `created_at`.

## B. Catalogue and commercial reference data

### `services`
Public/admin service definition.

Key fields: `id`, `name`, `slug`, `description`, `pricing_mode`, `base_price_xaf`, `delivery_type`, `default_duration_value`, `default_duration_unit`, `availability_status`, `capacity_mode`, `capacity_limit`, `waitlist_enabled`, `is_public`, `sort_order`, `published_at`, `archived_at`, timestamps.

### `service_variants`
Commercial variants such as Standard/Premium or 1 month/3 months.

Key fields: `id`, `service_id`, `name`, `slug`, `price_xaf`, `duration_value`, `duration_unit`, `capacity_limit`, `availability_status`, `sort_order`, `archived_at`, timestamps.

### `service_components`
Entitlements included in a service/variant.

Key fields: `id`, `service_id`, `variant_id`, `component_type`, `label`, `quantity`, `is_mandatory`, `consumption_policy`, timestamps.

### `service_policies`
Configurable follow-up, appointment and cancellation defaults.

Key fields: `id`, `service_id`, `variant_id`, `follow_up_frequency_days`, `late_cancel_notice_hours`, `late_cancel_consumes_component`, `missed_consumes_component`, `medical_clearance_policy`, `questionnaire_template_id`, timestamps.

## C. Requests, prospects and qualification

### `prospects`
A person before or during qualification.

Key fields: `id`, `full_name`, `whatsapp`, `email`, `city`, `country`, `preferred_contact_channel`, `source`, `created_at`, `archived_at`, `anonymized_at`.

### `service_requests`
One request targets one service in V1.

Key fields: `id`, `reference`, `prospect_id`, `service_id`, `requested_variant_id`, `objective`, `preferred_start_date`, `message`, `status`, `duplicate_of_request_id`, `submitted_at`, `closed_at`, `converted_subscription_id`, timestamps.

### `contact_attempts`
Structured follow-up history for a request/prospect.

Key fields: `id`, `prospect_id`, `request_id`, `channel`, `direction`, `outcome`, `note`, `occurred_at`, `next_action_at`, `created_by_user_id`.

### `qualification_reviews`
Versioned structured qualification decisions.

Key fields: `id`, `request_id`, `version`, `outcome`, `final_variant_id`, `agreed_price_xaf`, `target_start_date`, `suitability_note`, `conditions_json`, `blockers_json`, `created_by_user_id`, `created_at`, `superseded_at`.

### `waitlist_entries`
Manual waitlist records.

Key fields: `id`, `request_id`, `service_id`, `variant_id`, `status`, `priority_note`, `entered_at`, `left_at`.

## D. Customers and onboarding

### `customers`
Stable customer identity after conversion/manual creation.

Key fields: `id`, `prospect_id`, `full_name`, `whatsapp`, `email`, `city`, `country`, `preferred_contact_channel`, `created_at`, `archived_at`, `anonymized_at`.

### `subscriptions`
Primary commercial/coaching engagement.

Key fields: `id`, `reference`, `customer_id`, `source_request_id`, `service_id`, `variant_id`, `status`, `agreed_price_xaf`, `currency`, `planned_start_date`, `actual_start_date`, `planned_end_date`, `actual_end_date`, `capacity_reserved_until`, `follow_up_frequency_days_override`, `created_by_user_id`, `cancelled_at`, `completed_at`, timestamps.

### `subscription_status_history`
Append-only lifecycle transitions.

Key fields: `id`, `subscription_id`, `from_status`, `to_status`, `reason`, `changed_by_user_id`, `changed_at`.

### `subscription_pauses`
Explicit pause history.

Key fields: `id`, `subscription_id`, `started_at`, `ended_at`, `reason`, `original_end_date`, `revised_end_date`, `created_by_user_id`.

### `onboarding_items`
Checklist/blockers per subscription.

Key fields: `id`, `subscription_id`, `item_type`, `label`, `status`, `is_blocking`, `completed_at`, `waived_at`, `waiver_reason`, timestamps.

## E. Dynamic questionnaires, health and consent

### `questionnaire_templates`
Versioned configurable templates.

Key fields: `id`, `name`, `category`, `version`, `status`, `service_id`, `variant_id`, `published_at`, `retired_at`.

### `questionnaire_questions`
Ordered schema definition.

Key fields: `id`, `template_id`, `question_key`, `label`, `question_type`, `required`, `sort_order`, `options_json`, `validation_json`, `risk_flag_rule_json`.

### `questionnaire_submissions`
Immutable customer submissions.

Key fields: `id`, `subscription_id`, `template_id`, `template_version`, `revision_number`, `status`, `submitted_at`, `supersedes_submission_id`, `entered_by_user_id`, `source`.

### `questionnaire_answers`
Answers tied to a fixed submission revision.

Key fields: `id`, `submission_id`, `question_id`, `answer_json`, `created_at`.

### `medical_clearance_records`
Non-diagnostic coach workflow blocker.

Key fields: `id`, `subscription_id`, `status`, `trigger_source`, `note`, `document_id`, `required_at`, `cleared_at`, `cleared_by_user_id`.

### `consent_definitions`
Versioned consent/legal text definitions.

Key fields: `id`, `consent_type`, `version`, `title`, `content_hash`, `published_at`, `retired_at`.

### `consent_records`
Immutable grants/refusals/revocations.

Key fields: `id`, `customer_id`, `subscription_id`, `consent_definition_id`, `decision`, `captured_via`, `captured_at`, `revoked_at`, `verification_metadata_json`.

## F. Coaching delivery

### `subscription_components`
Snapshot of entitlements owed for one subscription.

Key fields: `id`, `subscription_id`, `source_service_component_id`, `component_type`, `label_snapshot`, `quantity_entitled`, `quantity_consumed`, `quantity_owed_by_coach`, timestamps.

### `component_events`
Append-only consumption/restoration/carry-forward history.

Key fields: `id`, `subscription_component_id`, `event_type`, `quantity`, `related_appointment_id`, `reason`, `created_by_user_id`, `created_at`.

### `appointments`
Individual coaching/session appointments.

Key fields: `id`, `subscription_id`, `component_id`, `scheduled_start`, `scheduled_end`, `status`, `location_or_channel`, `customer_response_status`, `reschedule_note`, `completed_at`, timestamps.

### `appointment_events`
Append-only appointment transition history.

Key fields: `id`, `appointment_id`, `event_type`, `from_status`, `to_status`, `actor_type`, `actor_user_id`, `reason`, `created_at`.

### `follow_ups`
Structured coaching follow-up records.

Key fields: `id`, `subscription_id`, `follow_up_type`, `occurred_at`, `note`, `next_action`, `next_action_at`, `status`, `attachment_document_id`, `created_by_user_id`.

### `goals`
Structured goals.

Key fields: `id`, `subscription_id`, `category`, `label`, `baseline_value`, `target_value`, `unit`, `target_date`, `status`, `suggested_status`, `coach_confirmed_at`, timestamps.

### `progress_measurements`
Optional structured progress metrics.

Key fields: `id`, `subscription_id`, `measured_at`, `weight_kg`, `waist_cm`, `hips_cm`, `chest_cm`, `body_fat_estimate`, `feeling_note`, `created_by_user_id`.

### `progress_photos`
Private photo metadata; binary content remains in private storage.

Key fields: `id`, `subscription_id`, `measurement_id`, `document_id`, `photo_type`, `taken_at`, `marketing_authorization_id`.

## G. Documents and secure external access

### `documents`
Logical document identity.

Key fields: `id`, `owner_type`, `owner_id`, `document_type`, `sensitivity`, `status`, `current_version_id`, `created_by_user_id`, `archived_at`, `purge_after`, timestamps.

### `document_versions`
Immutable physical file versions.

Key fields: `id`, `document_id`, `version_number`, `storage_key`, `original_filename`, `mime_type`, `size_bytes`, `sha256`, `malware_scan_status`, `uploaded_by_type`, `uploaded_by_user_id`, `created_at`.

### `secure_access_tokens`
Public-link grant records.

Key fields: `id`, `token_hash`, `resource_type`, `resource_id`, `action`, `recipient_hint_hash`, `requires_otp`, `device_binding_hash`, `expires_at`, `revoked_at`, `used_at`, `max_uses`, `use_count`, timestamps.

### `external_access_events`
Append-only access/audit trail for secure links.

Key fields: `id`, `secure_access_token_id`, `event_type`, `result`, `ip_hash`, `user_agent_hash`, `created_at`.

## H. Finance

### `payment_plans`
Expected obligations for a subscription.

Key fields: `id`, `subscription_id`, `total_expected_xaf`, `status`, `created_at`, `revised_from_plan_id`.

### `installments`
Expected amounts and dates.

Key fields: `id`, `payment_plan_id`, `sequence_number`, `amount_xaf`, `due_date`, `status`, timestamps.

### `payment_events`
Append-only authoritative money events.

Key fields: `id`, `customer_id`, `event_type`, `amount_xaf`, `currency`, `payment_method`, `external_reference`, `occurred_at`, `confirmed_at`, `confirmed_by_user_id`, `correction_of_event_id`, `metadata_json`.

### `payment_allocations`
Allocation from one confirmed money event to obligations.

Key fields: `id`, `payment_event_id`, `subscription_id`, `installment_id`, `extra_id`, `amount_xaf`, `created_at`, `allocation_reason`.

### `payment_proofs`
Customer/coach-submitted evidence, separate from confirmed payment.

Key fields: `id`, `customer_id`, `subscription_id`, `document_id`, `status`, `submitted_via`, `submitted_at`, `reviewed_at`, `reviewed_by_user_id`, `supersedes_proof_id`, `review_note`.

### `quotes`
Commercial quote identity.

Key fields: `id`, `quote_number`, `customer_id`, `request_id`, `subscription_id`, `status`, `current_version_id`, timestamps.

### `quote_versions`
Immutable quote versions.

Key fields: `id`, `quote_id`, `version_number`, `service_snapshot_json`, `amount_xaf`, `terms_snapshot_json`, `issued_at`, `accepted_at`, `declined_at`, `pdf_document_id`.

### `receipts`
Receipt metadata tied to confirmed allocations.

Key fields: `id`, `receipt_number`, `customer_id`, `payment_event_id`, `issued_at`, `pdf_document_id`, `voided_at`, `void_reason`.

## I. Operations, retention and jobs

### `scheduled_job_runs`
Execution history for retry-safe scheduled jobs.

Key fields: `id`, `job_key`, `run_key`, `status`, `started_at`, `finished_at`, `attempt`, `result_json`, `error_code`.

### `retention_holds`
Foundation for protected retention/legal hold behavior.

Key fields: `id`, `scope_type`, `scope_id`, `hold_type`, `reason`, `status`, `started_at`, `released_at`, `created_by_user_id`, `released_by_user_id`.

### `anonymization_events`
Audit of privacy transformations.

Key fields: `id`, `subject_type`, `subject_id`, `reason`, `status`, `requested_at`, `executed_at`, `executed_by_user_id`, `metadata_json`.

## J. Deferred V1.1 tables — reserve boundaries, do not implement prematurely

- `testimonials`
- `testimonial_authorizations`
- `satisfaction_surveys`
- `credits`
- `refunds`
- `subscription_amendments`
- `complaint_cases`
- `complaint_messages`
- `complaint_evidence`
- `data_export_requests`
- `erasure_requests`
- `legal_documents`
- `legal_acceptances`
- advanced report/export/import execution tables

## Core relationship chain

`prospect → service_request → qualification_review → customer → subscription → onboarding/questionnaires/consents → appointments/follow_ups/goals/progress → payment_plan/installments → payment_events/allocations → completion`

## Non-negotiable database invariants

1. One `service_request` may convert to at most one subscription.
2. A subscription snapshots the agreed commercial terms; catalogue edits do not rewrite existing subscriptions.
3. `subscription.status` never derives directly from payment status.
4. Confirmed financial events are never overwritten; corrections use compensating/referencing entries.
5. Allocations cannot exceed the authoritative confirmed payment amount.
6. Installment amounts for an active payment-plan version must equal that plan's expected total.
7. Submitted questionnaire revisions and captured consents are immutable.
8. Issued quote/receipt numbers are unique under concurrency.
9. Documents are accessed through authorization logic; storage keys are never public identifiers.
10. A legal/retention hold prevents purge/anonymization of its protected scope.
11. Critical state changes create an audit event in the same business operation where practical.
12. Public token records store only hashes of bearer tokens.

## Next modeling step

Convert this conceptual model into:

1. explicit enums and transition maps;
2. cardinalities and FK delete policies;
3. unique/check constraints and indexes;
4. Drizzle schema modules;
5. migration and seed plan.

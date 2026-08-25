# K'FIT Relational Contract — V1 Core

> Sprint 0 implementation contract. This document refines the conceptual model into relational rules that the Drizzle schema and migrations must enforce.

## 1. Global conventions

- Primary keys: UUIDs generated application-side or database-side consistently across all modules.
- Timestamps: PostgreSQL `timestamptz`; store UTC, render in user locale.
- Money: integer XAF amounts; no floating-point storage.
- Soft archive: `archived_at` nullable timestamp where business recovery/history is required.
- Immutable records: no ordinary UPDATE after commit point except administrative metadata explicitly identified below.
- Actor references: internal authenticated actions reference `users.id`; public/customer actions use `actor_type` + secure-token/audit metadata instead of fake user rows.
- Free-form JSON is only allowed for snapshots, provider metadata, or configuration that is intentionally schema-flexible. Core relational facts remain typed columns/FKs.

## 2. FK/delete policy classes

### RESTRICT
Use when deleting a parent would destroy business meaning or history.

Applies to:
- customers referenced by subscriptions, payments, quotes, receipts, consents;
- services/variants referenced by requests/subscriptions;
- subscriptions referenced by coaching, finance, onboarding and health records;
- payment events referenced by allocations/receipts;
- consent definitions referenced by consent records;
- questionnaire templates/questions referenced by submitted historical data.

### CASCADE
Use only for non-authoritative dependent configuration/technical rows whose lifecycle is strictly owned by the parent and where no issued/history record points at them.

Examples:
- unpublished template questions when a draft questionnaire template is physically removed before use;
- technical child configuration created and deleted only before publication.

### SET NULL
Use when historical data must remain but the optional source/reference may legitimately disappear or be anonymized.

Examples:
- `customers.prospect_id` after eligible prospect anonymization;
- optional internal actor references on records retained longer than the user account;
- optional attachment/document links when a purge is legally permitted while the business record remains.

### NO ACTION / logical-only deletion
Most business entities are never physically deleted by normal CRUD. Archive/anonymize/purge commands control lifecycle.

## 3. Core cardinalities and constraints

### users/auth
- `users 1 — N auth_sessions`
- `users 1 — N trusted_devices`
- `users 1 — N otp_challenges`
- `users 0..1 — N audit_events` as internal actor
- `users.email` unique using normalized lowercase form.
- At most one active V1 coach/admin account is a business rule enforced by bootstrap/service logic, not a permanent DB uniqueness assumption that would block V2.

### catalogue
- `services 1 — N service_variants`
- `services 1 — N service_components`
- `service_variants 0..1 — N service_components`
- `services 1 — N service_policies`; variant-specific policy may override service-level policy.
- unique active/public service slug.
- unique variant slug within service.
- `base_price_xaf >= 0`; `price_xaf >= 0`.
- fixed pricing requires a price; quote/contact pricing may leave price null.
- capacity limits must be positive when capacity mode requires a numeric limit.

### prospects/requests
- `prospects 1 — N service_requests`
- `service_requests 1 — N contact_attempts`
- `service_requests 1 — N qualification_reviews`
- `service_requests 0..1 — 1 subscriptions` through source conversion.
- one request references exactly one service.
- request may reference zero or one desired variant at intake.
- `service_requests.converted_subscription_id` unique when non-null.
- `subscriptions.source_request_id` unique when non-null.
- those two references must resolve to the same pair; service conversion command writes them atomically.
- qualification version unique on (`request_id`, `version`).
- at most one non-superseded/current qualification review per request, enforced by partial unique index or service transaction.
- duplicate links cannot point to self.

### customers/subscriptions
- `customers 1 — N subscriptions`
- `subscriptions 1 — N subscription_status_history`
- `subscriptions 1 — N subscription_pauses`
- `subscriptions 1 — N onboarding_items`
- `subscriptions 1 — N subscription_components`
- subscription currency V1 check: `currency = 'XAF'`.
- agreed price `>= 0`.
- planned/actual end dates cannot precede corresponding start dates.
- only one open pause per subscription.
- status history is append-only.

### questionnaires/health/consent
- `questionnaire_templates 1 — N questionnaire_questions`
- `questionnaire_templates 1 — N questionnaire_submissions`
- `questionnaire_submissions 1 — N questionnaire_answers`
- `questionnaire_submissions 0..1 — 1 questionnaire_submissions` through `supersedes_submission_id`.
- template version unique on (`logical template identity`, `version`); implementation may use a stable `template_key` to represent logical identity.
- question key unique within a template version.
- submission revision unique on (`subscription_id`, `template_id`, `revision_number`).
- one answer per (`submission_id`, `question_id`).
- submitted revisions are immutable.
- `medical_clearance_records` may have multiple historical records but only one active blocking record per subscription.
- consent definition version unique on (`consent_type`, `version`).
- consent records are append-only decisions; revocation is recorded as a new event/decision or immutable revocation timestamp according to final service implementation, but historical grant data must never be rewritten.

### coaching
- `subscriptions 1 — N appointments`
- `appointments 1 — N appointment_events`
- `subscriptions 1 — N follow_ups`
- `subscriptions 1 — N goals`
- `subscriptions 1 — N progress_measurements`
- `progress_measurements 0..1 — N progress_photos`
- `subscription_components 1 — N component_events`
- entitled/consumed/owed quantities cannot be negative.
- `quantity_consumed <= quantity_entitled` unless an explicitly versioned business rule later allows overage.
- component-event quantity must be positive; event type determines signed effect in service logic.
- appointment end > start.
- status transitions happen through explicit domain commands, never arbitrary status patching.

### documents/access
- `documents 1 — N document_versions`
- current version must belong to the same logical document.
- version number unique on (`document_id`, `version_number`).
- file hash (`sha256`) indexed for duplicate/malware investigation; not globally unique because legitimate duplicate uploads can exist.
- `secure_access_tokens.token_hash` unique.
- expired/revoked/used tokens remain for audit until retention policy permits purge.
- `external_access_events N — 1 secure_access_tokens`.
- no direct FK from polymorphic `documents.owner_type/owner_id`; ownership validity is enforced in the document service unless converted later to explicit join tables.

### finance
- `subscriptions 1 — N payment_plans`
- `payment_plans 1 — N installments`
- `customers 1 — N payment_events`
- `payment_events 1 — N payment_allocations`
- `subscriptions 1 — N payment_allocations`
- payment plan revisions form a chain; only one active/current plan per subscription.
- installment sequence unique on (`payment_plan_id`, `sequence_number`).
- installment amount > 0.
- payment-event amount > 0 for receipt/payment events; compensating event types use explicit semantic direction rather than negative ambiguity where practical.
- confirmed payment events are append-only.
- sum of allocations for an authoritative event must not exceed allocatable event amount. This is a transactional invariant requiring row locking/serializable handling; a CHECK constraint alone cannot enforce it.
- allocation amount > 0.
- quote number unique.
- quote version unique on (`quote_id`, `version_number`).
- receipt number unique.
- sequential-number allocation must be concurrency-safe.

### operations/privacy/jobs
- `scheduled_job_runs.run_key` unique per `job_key` when the run represents an idempotent logical execution.
- retention holds can overlap; purge/anonymization service checks for any active hold covering the target scope.
- anonymization events are append-only.

## 4. Index strategy

### high-value lookup indexes
- normalized user email.
- prospect/customer WhatsApp and email.
- request/subscription/quote/receipt references.
- service and service-variant slug.
- status + created/submitted dates for dashboard queues.
- subscription `customer_id`, `status`, `planned_end_date`.
- appointment `subscription_id`, `scheduled_start`, `status`.
- follow-up `subscription_id`, `next_action_at`, `status`.
- installment `due_date`, `status`.
- payment event `customer_id`, `occurred_at`, `confirmed_at`.
- payment allocation by event/subscription/installment.
- secure token hash and expiry/revocation status.
- document owner tuple (`owner_type`, `owner_id`) and document type.
- audit event (`entity_type`, `entity_id`, `created_at`) and (`event_type`, `created_at`).
- scheduled job (`job_key`, `status`, `started_at`).

### partial indexes
Use PostgreSQL partial indexes for operational queues, for example:
- active/non-archived services;
- current active subscription states;
- overdue installments that are not settled/cancelled;
- open onboarding blockers;
- active medical-clearance blockers;
- non-revoked unexpired secure links;
- unresolved follow-ups.

## 5. Transaction boundaries

The following commands must be single DB transactions, with audit/event rows written inside the same transaction when feasible:

1. request conversion → customer/subscription creation + source links + component snapshots + initial status history + capacity reservation.
2. subscription status transition → validation + history + audit.
3. component consumption/restoration → event append + derived counter update.
4. payment confirmation → authoritative event + proof review result + audit.
5. payment allocation → allocation rows + installment/payment-plan derived state updates.
6. quote acceptance → immutable acceptance + optional subscription draft comparison state.
7. consent capture/revocation → immutable record + onboarding blocker update when relevant.
8. questionnaire submission → revision + answers + risk/blocker evaluation metadata.
9. secure document issuance → version publication + secure token + audit.
10. retention/anonymization execution → hold check + transformation + anonymization event + audit.

## 6. Derived fields policy

Derived/cached fields are permitted for operational efficiency, but the authoritative event/history remains reconstructable.

Examples:
- `subscription_components.quantity_consumed` is a cache derived from `component_events`.
- installment/payment-plan status is derived from allocations and obligations, but stored for efficient querying and updated transactionally.
- request/subscription current status is stored while transition histories remain authoritative for timeline/audit.

## 7. Polymorphism decisions

V1 uses controlled polymorphism only where it materially reduces complexity:
- audit `entity_type/entity_id`;
- document `owner_type/owner_id`;
- secure token `resource_type/resource_id`;
- retention hold `scope_type/scope_id`.

These values must use closed application enums. Arbitrary strings are not accepted at API boundaries.

## 8. Migration safety rules

- Never combine destructive column/table removal with unrelated feature migrations.
- New required columns on populated tables follow expand/backfill/validate/contract sequence.
- Enum evolution must be forward-safe; prefer text + CHECK/application enums where PostgreSQL native enum rigidity would complicate lifecycle changes.
- Each migration must have a rollback/forward-fix strategy documented before production promotion.
- Financial, consent, questionnaire and audit history tables must never be rebuilt destructively in production without an explicit data migration plan.

## 9. Open implementation choices to resolve during Drizzle coding

- UUID generation source (`crypto.randomUUID()` vs `gen_random_uuid()`) — choose one convention globally.
- whether consent revocation is represented purely as a new append-only record or additionally by `revoked_at` on the grant row; append-only history is mandatory either way.
- exact implementation of partial uniqueness for current questionnaire/plan/qualification revisions.
- whether document ownership stays polymorphic or moves to explicit association tables if Drizzle relation ergonomics become problematic.

These are implementation details, not unresolved business requirements.
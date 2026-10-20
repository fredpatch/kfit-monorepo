# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-4
Sprint            4 — Clients, conversion, onboarding, questionnaires et consentements
Active slice      S4.4 — Separate consent records and versioned terms/privacy acceptance
Workflow state    APPROVED_FOR_IMPLEMENTATION
Last validated    S4.3 — 2026-10-20
Next action       Implementer: execute approved S4.4 server-first consent/terms plan only
```

## Sprint 4 objective

Build the customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow, preserving server-authoritative lifecycle rules and transactional audit guarantees.

## Sprint 4 execution order

1. S4.1 — Client table + phone-based search/create-inline — CLOSED, Fred validated 2026-10-20.
2. S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link — CLOSED, Fred validated 2026-10-20.
3. S4.3 — Onboarding checklist, blockers, capacity reservation and stalled-state review — CLOSED, Fred validated 2026-10-20.
4. S4.4 — Separate consent records and versioned terms/privacy acceptance — APPROVED_FOR_IMPLEMENTATION.
5. S4.5 — Versioned assessment and health-questionnaire templates — blocked until S4.4 validation.

S4.3 is locally validated. Do not implement the next slice before its plan is inspected and approved.

## S4.2 — validated result

Delivered:
- named admin conversion command at `POST /admin/requests/:requestId/convert`;
- conversion only from `qualified` or `qualified_with_conditions`;
- server-authoritative service/variant/price/currency values;
- planned start resolved from qualification target date or required conversion fallback input;
- request row locking and exactly-once conflict semantics;
- S4.1 normalized-WhatsApp advisory-lock reuse for customer resolution;
- existing active customer reuse or exact-prospect customer creation;
- onboarding subscription creation with `capacityReservedUntil = null`;
- service-level + selected-variant component snapshots;
- initial append-only status history null → `onboarding`;
- reciprocal request↔subscription links;
- transaction-scoped `request.converted` audit with structural metadata only;
- French admin conversion controls.

Validation:
- typecheck/build/db:check/diff check green;
- server tests 153/153;
- shared tests 15/15;
- PostgreSQL integration 35/35, including 15 S4.2 cases;
- Reviewer passed with notes;
- QA passed with limitations;
- Fred Gate 2 browser/DBeaver acceptance green on 2026-10-20.

Known test note:
- unchanged Sprint 3 concurrency test failed once and passed on the approved retry; keep classified as flaky until separately hardened. No S4.2 test failed.

## Closed

```text
Sprint 0 — Initialisation
Sprint 1 — Auth, sessions, OTP, security (+ password recovery HTTP flow)
Sprint 2 — Catalogue, offers, public availability
Sprint 3 — Demandes, prospects, qualification et liste d'attente
Sprint 4 / S4.1 — Customer identity/search/manual-create foundation
Sprint 4 / S4.2 — Atomic qualified-request conversion foundation
```

## Blockers

Before production:
- Legal validation for the applicable Gabon context.
- True encrypted off-server backup destination.

## Environment constraints

- Docker PostgreSQL: localhost:5433; native PostgreSQL: 5432.
- Chat/cloud runtimes do not run project commands; only Fred's local execution closes validation gates.

## Handoff

```text
Branch            sprint-4
Sprint            4
Slice             S4.4
Workflow state    APPROVED_FOR_IMPLEMENTATION
Done              S4.3 validated; S4.4 planning + Fred Gate 1 approval
Validation done   none for S4.4 yet
Key rules          explicit capacity deadline for limited services; derived stalled state; strict checklist ownership
Out of scope      questionnaire/consent/medical/finance workflows, activation, automatic cancellation/waitlist movement
Next action       Implementer
```


## S4.3 — planning brief

Goal: make each onboarding subscription expose an authoritative readiness checklist and an explicit capacity hold, without implementing questionnaire, consent, medical-document or finance workflows prematurely.

Proposed scope:
- admin onboarding detail/read model for subscriptions in onboarding-related states;
- deterministic checklist initialization;
- explicit capacity reservation deadline for limited-capacity services;
- coach completion/waiver commands only for manually-owned checklist items;
- derived readiness/stalled state;
- guarded transition from onboarding to ready_to_start only when all blocking requirements are satisfied and capacity reservation is valid where required;
- transactional audit for checklist mutations, capacity changes and ready transition.

Proposed checklist item types:
- `start_date_confirmed` — blocking, system-completed because S4.2 guarantees plannedStartDate;
- `service_terms` — blocking, future consent workflow owns completion;
- `questionnaire` — blocking only when effective service policy has questionnaireTemplateId; future questionnaire workflow owns completion;
- `payment_condition` — blocking manual coach confirmation in S4.3; finance integration may later become authoritative without changing the checklist contract;
- `medical_clearance` — not created merely for `required_if_risk_flag`; future questionnaire/risk workflow creates or activates it when a risk flag requires clearance. `not_required` creates none.

Policy resolution:
- effective service policy = variant-specific policy when present; otherwise service-level policy.
- catalogue policy values are authoritative for questionnaire/medical requirement decisions.

Capacity:
- `capacityMode = unlimited`: no reservation deadline required.
- `capacityMode = limited`: S4.3 requires coach to set `capacityReservedUntil`; do not invent a default duration.
- expired reservation never auto-cancels or auto-releases the subscription; it derives `stalled` and blocks ready_to_start until the coach extends/reconfirms the reservation.
- capacity limit counting/overbooking guard must count active capacity claims consistently (onboarding reservation not expired + ready/active operational states) and be rechecked transactionally when reservation is set/extended and when ready_to_start is confirmed.

Derived onboarding state:
- `ready`: every blocking checklist item completed/waived, plannedStartDate present, and required capacity reservation valid.
- `blocked`: at least one blocking item incomplete and reservation not expired.
- `stalled`: capacity reservation expired while subscription remains pre-start; no automatic lifecycle transition.

Commands proposed:
- `GET /admin/subscriptions/:subscriptionId/onboarding`
- `POST /admin/subscriptions/:subscriptionId/onboarding/initialize`
- `POST /admin/subscriptions/:subscriptionId/onboarding/items/:itemId/complete`
- `POST /admin/subscriptions/:subscriptionId/onboarding/items/:itemId/waive`
- `PUT /admin/subscriptions/:subscriptionId/onboarding/capacity-reservation`
- `POST /admin/subscriptions/:subscriptionId/onboarding/ready`

Ownership:
- S4.3 manual completion is allowed for `payment_condition` only.
- `start_date_confirmed` is system-owned.
- `service_terms`, `questionnaire`, and medical-clearance completion are reserved for their later authoritative workflows.
- waiver requires a non-empty reason and is an audited coach override; service terms and medical clearance should not be waivable in S4.3.

Out of scope:
- questionnaire template/submission implementation;
- consent capture or legal document versioning;
- health risk evaluation and medical document handling;
- payment plans/events/proofs;
- automatic activation;
- scheduled stalled-onboarding jobs/notifications.

Applicable patterns:
- Explicit State Transitions
- Atomic Business Operation
- Audit Event System
- Domain Error Taxonomy
- Shared API Contracts
- Hard Commit Point
- Dynamic Form Schema only as a future integration boundary, not implemented here.

Gate 1 approved by Fred.

Locked waiver policy:
- `service_terms` — non-waivable;
- `medical_clearance` — non-waivable;
- `questionnaire` — waivable only with mandatory non-empty reason + audit;
- `payment_condition` — waivable only with mandatory non-empty reason + audit.


## S4.3 — validation closure

Validated locally by Fred on 2026-10-20. Server 177/177, shared 17/17, PostgreSQL integration 63/63 including 28 S4.3 cases. Typecheck/build/db:check/diff check green. Uniqueness migration applied after 0 duplicate groups. Browser/DBeaver Gate 2 green, including reservation/extension, stalled-state behavior, payment completion, controlled service_terms fixture and onboarding -> ready_to_start. Questionnaire waiver browser path was N/A for the tested service because no effective questionnaireTemplateId was configured.


## S4.4 — planning entry

Exact next task: **Separate consent records and versioned terms/privacy acceptance** (Sprint 4, M8, CRITIQUE). Dependency order: S4.3 satisfies the onboarding prerequisite; the questionnaire task explicitly depends on the consent model, so consent/terms comes first. The V1.1 Sprint 11 legal-document review task is not a blocker for this V1 Core foundation because it depends on terms-acceptance records rather than providing them.


## S4.4 — planning brief

Goal: establish the V1 Core consent/acceptance model that can satisfy the S4.3 `service_terms` blocker without client accounts, while preserving exact definition versions and keeping future questionnaire/health/photo/publication workflows independent.

Planner findings:
- conceptual `consent_definitions` and `consent_records` exist in project architecture, but no Drizzle consent schema is implemented yet;
- `secure_access_tokens` and `external_access_events` already exist in Drizzle and can be reused for customer-facing acceptance links;
- V1 has no customer accounts, so capture must support secure public-link and coach-assisted paths;
- captured consents are immutable/versioned hard-commit records;
- service, health, progress-photo storage, marketing and publication decisions remain separate;
- legal/privacy wording is still a production-review blocker, so S4.4 must not ship invented production legal text.

Proposed definition types:
- `service_terms` — mandatory onboarding acceptance;
- `privacy_notice` — mandatory onboarding acknowledgement/acceptance;
- `health_data` — separate consent, supported by the model but activated by S4.5 when health data is actually required;
- `progress_photo_storage` — optional separate consent;
- `marketing` — optional separate consent;
- `publication` — optional separate consent.

Definition model:
- versioned by `consentType + version`;
- stores title, immutable text content, content hash, status `draft|published|retired`, publish/retire timestamps;
- published definitions are immutable; changes create a new version;
- no full V1.1 legal-document review/reacceptance workflow in S4.4.

Decision model:
- append-only `granted|refused|revoked` records;
- each record links exact customer, subscription and consent definition version;
- capture provenance is explicit: `public_link|coach_assisted`;
- public-link records may link the secure-access token; coach-assisted records link the acting admin;
- revisions/revocations append a new decision record instead of overwriting the prior record;
- current decision is derived from the latest append-only record under a subscription/type lock.

Onboarding service-terms rule:
- `service_terms` checklist item becomes completed only when the subscription has current `granted` records for the latest published `service_terms` AND `privacy_notice` definitions;
- refusal leaves the blocker pending;
- optional consent decisions never block S4.3 readiness;
- checklist completion + consent records + audit occur atomically;
- no manual checklist shortcut is reintroduced.

Secure link:
- admin issues a subscription-scoped action token;
- raw bearer secret returned once and never stored/logged; only token hash persists;
- token is random, expiring, revocable and single-purpose;
- GET may be repeated before submission without consuming the token;
- successful decision submission consumes/revokes the token so replay cannot create duplicate records;
- link initially exposes only the onboarding-required bundle (`service_terms` + `privacy_notice`); health/photo/marketing/publication are not automatically requested;
- no customer OTP is added in S4.4; the terms/privacy link is token-protected only. Health-sensitive OTP policy is deferred to S4.5/security review.

Coach-assisted capture:
- authenticated admin may record decisions for the same exact published definitions;
- provenance must be `coach_assisted` and actor user ID recorded;
- this path is explicit evidence capture, not a hidden checklist completion.

Definition availability:
- no invented production legal wording;
- tests use synthetic definitions;
- development may have an explicit dev-only seed/fixture;
- production preflight must reject missing published `service_terms` or `privacy_notice` definitions before acceptance links can be issued.

Proposed APIs:
- `GET /admin/subscriptions/:subscriptionId/consents`
- `POST /admin/subscriptions/:subscriptionId/consent-link`
- `POST /admin/subscriptions/:subscriptionId/consents/coach-capture`
- `POST /admin/subscriptions/:subscriptionId/consents/:consentType/revoke` for revocable consent types only
- `GET /public/consents/:token`
- `POST /public/consents/:token`

S4.4 excludes:
- questionnaire templates/submissions;
- health-risk evaluation;
- medical clearance records;
- progress-photo upload/storage;
- publication/testimonial workflow;
- customer accounts;
- customer OTP;
- V1.1 legal-document publishing/reacceptance review;
- automatic subscription activation.

Applicable patterns:
- Hard Commit Point
- Audit Event System
- Shared API Contracts
- Domain Error Taxonomy
- Atomic Business Operation
- Idempotent Business Command
- Secure External Document Sharing
- explicit append-only history.

Gate 1 approved by Fred.

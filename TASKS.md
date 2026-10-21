# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-4
Sprint            4 — Clients, conversion, onboarding, questionnaires et consentements
Active slice      S4.5 — Versioned assessment and health-questionnaire templates
Workflow state    CLOSED
Last validated    Sprint 4 / S4.5 — 2026-10-21
Next action       Fred: merge/align Sprint 4, create sprint-5 branch; then plan S5.1 subscription lifecycle only
```

## Sprint 4 objective

Build the customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow, preserving server-authoritative lifecycle rules and transactional audit guarantees.

## Sprint 4 execution order

1. S4.1 — Client table + phone-based search/create-inline — CLOSED, Fred validated 2026-10-20.
2. S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link — CLOSED, Fred validated 2026-10-20.
3. S4.3 — Onboarding checklist, blockers, capacity reservation and stalled-state review — CLOSED, Fred validated 2026-10-20.
4. S4.4 — Separate consent records and versioned terms/privacy acceptance — CLOSED, Fred validated 2026-10-21.
5. S4.5 — Versioned assessment and health-questionnaire templates — CLOSED, Fred validated 2026-10-21.

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
Slice             S4.5
Workflow state    CLOSED
Done              S4.5 implementation + corrective assignment path + review + QA + Fred Gate 2 validation
Validation done   final local validation suite green; browser/mobile/keyboard and DBeaver acceptance green
Key rules          explicit capacity deadline for limited services; derived stalled state; strict checklist ownership
Out of scope      questionnaire/consent/medical/finance workflows, activation, automatic cancellation/waitlist movement
Next action       Sprint boundary reconciliation
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


## S4.4 — validation closure

Validated locally by Fred on 2026-10-21.

Evidence:
- typecheck/build/db:check/diff check green;
- server tests 195/195;
- shared tests 20/20;
- PostgreSQL integration 88/88, including 25 S4.4 cases;
- migration 0004 applied locally after zero affected legacy rows in preflight;
- initial browser failure was caused by the local database not yet having migration 0004, not by consent-domain logic;
- after migration, consent panel loaded correctly;
- demo-only published consent definitions seeded locally;
- public link refusal kept service_terms pending;
- fresh-link dual grant completed service_terms;
- consumed-link replay rejected without duplicate decisions;
- coach-assisted capture passed on a second subscription;
- DBeaver checks for append-only decisions, token hashing/consumption, onboarding integration and safe audit metadata were green.

Known note:
- the preceding integration run was 87/88 only because of the documented unchanged Sprint 3 concurrency flake; all S4.4 tests passed in both runs.


## S4.5 — planning brief

Goal: implement versioned dynamic assessment/health questionnaires, secure public and coach-assisted submission, immutable revision history, and non-diagnostic risk flags that integrate with S4.3 onboarding and medical-clearance blocking.

Existing schema:
- questionnaire_templates
- questionnaire_questions
- questionnaire_submissions
- questionnaire_answers
- medical_clearance_records

Existing catalogue hook:
- effective service policy questionnaireTemplateId
- medicalClearancePolicy

Template/version rules:
- template identity is templateKey;
- version is positive integer and unique per templateKey;
- statuses draft|published|retired;
- published/retired templates and their questions are immutable;
- editing published content creates version N+1;
- service policy must reference a published template;
- a submission always stores exact templateId + templateVersion and historical answers never reinterpret against a later version.

Supported V1 question types:
- short_text
- long_text
- boolean
- single_choice
- multi_choice
- integer
- decimal
- date

No arbitrary executable expressions.
optionsJson and validationJson must conform to a server-owned schema per question type.

Risk rules:
- riskFlagRuleJson is declarative and allowlisted only;
- supported V1 predicates are equality/inclusion and numeric threshold comparisons against the same question answer;
- no JavaScript/eval/cross-question expressions;
- risk output is an operational boolean flag with matched question keys only;
- never infer diagnosis, disease, fitness-to-train, or medical advice.

Questionnaire assignment:
- resolve effective service policy variant-first then service fallback;
- if no questionnaireTemplateId, no questionnaire blocker is required;
- if configured, S4.3 questionnaire onboarding item is authoritative and can only be completed/waived by approved paths;
- submission must use the exact currently configured published template when the questionnaire is started.

Health-data consent:
- templates have category assessment or health;
- assessment category does not require health_data consent;
- health category requires the latest published health_data consent definition;
- the customer/coach must record a separate health_data decision before health answers are committed;
- refused/missing health_data consent means zero health questionnaire answers/submission writes;
- health_data consent remains a separate append-only consent record and can later be revoked; revocation does not delete historical questionnaire evidence, but prevents new health submissions until re-granted.

Secure public questionnaire link:
- reuse secure_access_tokens with a questionnaire-specific resource/action scope, separate from consent links;
- raw token returned once, stored hashed, explicit expiry, revocable, GET non-consuming, successful submit consuming;
- token snapshots the exact template/version/definition IDs needed for the attempt;
- stale token is rejected if assignment/template or required health consent definition changed before submit;
- public page exposes subscription reference + questionnaire schema only; no unrelated PII;
- public token access is rate-limited and audited.

Health public flow:
- GET may display the exact health_data consent text separately from questionnaire questions;
- POST requires explicit health_data granted decision plus answers in the same hard commit when no current grant exists;
- explicit refusal persists the consent refusal but persists no health answers and leaves questionnaire blocker pending;
- existing current grant may be reused without asking again if it targets the latest published health_data definition.

Coach-assisted flow:
- admin may submit assessment/health answers on behalf of customer;
- for health category, a current health_data grant is still required; coach cannot bypass/reforge consent by submitting answers;
- source/provenance is explicit.

Submission/revision rules:
- submitted revisions are immutable;
- one initial submission revisionNumber=1;
- correction/resubmission creates revision N+1 with supersedesSubmissionId;
- only one chain head per subscription + logical template assignment;
- draft persistence is out of scope for public V1; server commits only complete submitted revisions;
- required answers and type-specific validation are enforced server-side against the snapshotted template version.

Onboarding integration:
- successful submitted current questionnaire marks S4.3 questionnaire item completed atomically;
- new required template version/reassignment may reopen questionnaire item only through an explicit admin/configuration command, not silently during ordinary reads;
- questionnaire waiver remains the existing S4.3 audited coach override.

Medical-clearance integration:
- resolve effective medicalClearancePolicy;
- if policy = required_if_risk_flag and submitted questionnaire has >=1 risk match:
  - create or preserve one active pending medical_clearance_record for subscription;
  - create/upsert blocking onboarding item medical_clearance pending;
  - triggerSource = questionnaire submission id/type, no diagnosis text;
- if no risk match, do not create medical-clearance blocker;
- if policy = not_required, never create blocker;
- a later safe revision with no risk does NOT auto-clear an existing medical-clearance requirement;
- S4.5 does not implement medical review/clearance completion or document upload.

Hard commit on successful submission:
- lock subscription
- lock template/definition assignment as needed
- validate exact schema/version
- append health_data consent decision if needed
- insert immutable questionnaire submission + answers
- evaluate allowlisted risk rules
- complete questionnaire onboarding item
- create/preserve medical-clearance record/item if triggered
- write safe audit(s)
- consume public token if public flow
- commit

Audit:
- questionnaire.link_created
- questionnaire.submitted
- questionnaire.revision_submitted
- questionnaire.risk_flagged (structural keys/count only)
- medical_clearance.required
- existing onboarding completion event as compatible

Never audit health answers, question labels containing health details, free text, diagnoses, or raw tokens.

Out of scope:
- medical diagnosis or automated medical advice;
- medical-clearance completion/document upload;
- AI interpretation/review generation;
- progress tracking questionnaires during active coaching;
- customer accounts;
- automatic activation;
- arbitrary branching/conditional visibility engine beyond safe schema metadata.

Security recommendation for S4.5:
- questionnaire links remain strong random single-purpose bearer links in V1, with no new customer OTP subsystem introduced in this slice;
- because health answers are sensitive, public responses use no-store/no-referrer headers, rate limiting, hashed token storage, explicit expiry and one successful use;
- OTP can be added later only through an explicitly approved security slice rather than a partial ad-hoc implementation.

Applicable patterns:
- Dynamic Form Schema
- Form Schema Contract
- Secure External Document Sharing
- Shared API Contracts
- Domain Error Taxonomy
- Hard Commit Point
- Atomic Business Operation
- Audit Event System
- append-only revision history

Gate 1 approved by Fred.


## S4.5 corrective fix — questionnaire assignment

Status: IMPLEMENTED, awaiting Fred local validation.

Reason:
- S4.5 originally created/published questionnaire templates but exposed no admin path to assign a published template to service_policies.questionnaire_template_id.
- As a result, onboarding correctly reported no questionnaire configured even after template publication.

Correction:
- added questionnaire assignment contracts and admin GET/POST route;
- added service/variant assignment scopes in the Questionnaires admin page;
- assignment persists to service_policies and accepts published templates only;
- service/variant assignment writes are serialized and audited;
- variant questionnaire resolution now falls back per-field to the service-level assignment when no variant override exists;
- clearing a variant override restores service-level inheritance;
- no questionnaire submission behavior, consent behavior, medical-review behavior or schema migration changed.

Validation pending:
- typecheck/build/tests;
- assignment UI service-level path;
- variant override path;
- variant inheritance after clearing override;
- onboarding questionnaire panel becomes available after assignment.


## S4.5 — validation closure

Validated locally by Fred on 2026-10-21.

Validated behavior:
- versioned assessment/health templates and all eight V1 question types;
- secure public and coach-assisted submissions;
- append-only revision history;
- health_data consent gate with refusal producing no questionnaire submission/answers;
- declarative non-diagnostic risk flags;
- questionnaire onboarding completion;
- risk-triggered medical-clearance blocker/record;
- safe coach correction creates revision N+1 without auto-clearing medical clearance;
- consumed-link replay rejection;
- DBeaver verification of immutable history, consent provenance, token hashing and safe audits.

Corrective fix validated during Gate 2:
- added visible service/variant questionnaire assignment path;
- only published templates assignable;
- assignments persist to service_policies.questionnaire_template_id;
- variant override works;
- clearing variant override restores service-level inheritance;
- effective resolver falls back per field instead of treating null variant questionnaire as a hard override;
- questionnaire assignment route added to Vite proxy;
- local API/client restarts were required after new route/proxy wiring.

Validation:
- original agent run before the corrective fix: server 214/214, shared 34/34, PostgreSQL integration 131/131 including 43 S4.5 cases;
- Fred reran the final validation suite after the corrective fix and reported all checks green;
- exact post-correction test counts were not separately reported, so do not substitute the pre-correction counts as final counts.


## Sprint 5 first task

S5.1 — **Subscription lifecycle with pause, completion_due, renewal and cancellation resolution**

Why first:
- depends on the validated onboarding ready-to-start gate from Sprint 4;
- appointment scheduling depends on an active subscription and package components;
- structured follow-ups depend on an active subscription;
- goals depend on follow-up + subscription model;
- personalized documents depend on subscriptions/private storage.

Do not implement S5.1 until the Sprint 5 branch/state is initialized and Gate 1 planning is approved.

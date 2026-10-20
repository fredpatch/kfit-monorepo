# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-4
Sprint            4 — Clients, conversion, onboarding, questionnaires et consentements
Active slice      S4.3 — Onboarding checklist, blockers, capacity reservation and stalled-state review
Workflow state    PLANNING
Last validated    S4.3 — 2026-10-20
Next action       Planner: define S4.4 consent/terms foundation; no implementation before Gate 1
```

## Sprint 4 objective

Build the customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow, preserving server-authoritative lifecycle rules and transactional audit guarantees.

## Sprint 4 execution order

1. S4.1 — Client table + phone-based search/create-inline — CLOSED, Fred validated 2026-10-20.
2. S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link — CLOSED, Fred validated 2026-10-20.
3. S4.3 — Onboarding checklist, blockers, capacity reservation and stalled-state review — CLOSED, Fred validated 2026-10-20.
4. Questionnaire and consent slices follow after S4.3 in dependency order.

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
Slice             S4.3
Workflow state    CLOSED
Done              S4.3 implementation + review + QA + Fred Gate 2 validation
Validation done   server 177/177; shared 17/17; PostgreSQL integration 63/63; browser+DBeaver green
Key rules          explicit capacity deadline for limited services; derived stalled state; strict checklist ownership
Out of scope      questionnaire/consent/medical/finance workflows, activation, automatic cancellation/waitlist movement
Next action       Planner: inspect next Sprint 4 task in dependency order
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

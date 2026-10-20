# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-4
Sprint            4 — Clients, conversion, onboarding, questionnaires et consentements
Active slice      —
Workflow state    CLOSED
Last validated    S4.2 — 2026-10-20
Next action       Planner: inspect next Sprint 4 onboarding/capacity slice only
```

## Sprint 4 objective

Build the customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow, preserving server-authoritative lifecycle rules and transactional audit guarantees.

## Sprint 4 execution order

1. S4.1 — Client table + phone-based search/create-inline — CLOSED, Fred validated 2026-10-20.
2. S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link — CLOSED, Fred validated 2026-10-20.
3. Later Sprint 4 onboarding/questionnaire/consent slices follow dependency order from Notion and the project schema.

Do not implement the next slice before its plan is inspected and approved.

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
Slice             S4.2
Workflow state    CLOSED
Done              implementation + review + QA + Fred Gate 2 validation
Validation done   server 153/153; shared 15/15; PostgreSQL integration 35/35; browser+DBeaver green
Known note        unchanged Sprint 3 concurrency test is flaky; passed approved retry
Out of scope      onboarding checklist, medical clearance, questionnaires, consents, payments, capacity reservation policy
Next action       Planner: inspect next Sprint 4 onboarding/capacity slice
```

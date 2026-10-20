# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-4
Sprint            4 — Clients, conversion, onboarding, questionnaires et consentements
Active slice      —
Workflow state    CLOSED
Last validated    S4.1 — 2026-10-20
Next action       Planner: prepare S4.2 request conversion transaction plan only
```

## Sprint 4 objective

Build the customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow, preserving server-authoritative lifecycle rules and transactional audit guarantees.

## Sprint 4 execution order

1. S4.1 — Client table + phone-based search/create-inline — CLOSED, Fred validated 2026-10-20.
2. S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link.
3. Later Sprint 4 onboarding/questionnaire/consent slices follow dependency order from Notion and the project schema.

Do not implement S4.2 before its plan is inspected and approved.

## S4.1 — validated result

Delivered:
- authenticated admin customer list/search/create over the existing `customers` table;
- shared customer contracts and shared WhatsApp normalizer reused by requests/customers;
- active-customer search by normalized WhatsApp;
- manual creation with duplicate active/non-anonymized WhatsApp rejection;
- no automatic prospect linkage from phone; manual `prospect_id` remains null;
- archived/anonymized customers excluded from normal lookup;
- PostgreSQL advisory-lock serialization per normalized WhatsApp collision key without adding a unique DB constraint;
- customer insert + `customer.created` audit in one transaction;
- audit metadata limited to `{ source: "manual" }`, with no customer PII;
- French admin Clients search-first / inline-create UI;
- local-development-only demo admin helper, restricted to NODE_ENV=development and disposable localhost:5433/kfit_dev.

Validation:
- typecheck/build/db:check/diff check green;
- server tests 122/122;
- shared tests 15/15;
- real PostgreSQL integration 20/20, including all five S4.1 DB scenarios;
- Reviewer passed with notes;
- QA passed with browser limitation;
- Fred Gate 2 browser/DBeaver functional acceptance green.

Durable follow-up:
- every future customer writer, especially S4.2 conversion, must use the same advisory-lock protocol for the normalized WhatsApp collision key unless a separately approved DB uniqueness strategy replaces it.

## Closed

```text
Sprint 0 — Initialisation
Sprint 1 — Auth, sessions, OTP, security (+ password recovery HTTP flow)
Sprint 2 — Catalogue, offers, public availability
Sprint 3 — Demandes, prospects, qualification et liste d'attente
Sprint 4 / S4.1 — Customer identity/search/manual-create foundation
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
Slice             S4.1
Workflow state    CLOSED
Approved goal     Admin customer lookup/list + manual inline creation over existing customers table
Done              implementation + review + QA + Fred Gate 2 validation
Validation done   server 122/122; shared 15/15; PostgreSQL integration 20/20; browser+DBeaver green
Out of scope      request conversion, subscriptions, onboarding, questionnaires, consents, customer merge/dedup
Risk              future customer writers must share the advisory-lock collision protocol
Next action       Planner: S4.2 planning only
```

# Sprint 4 — Clients, conversion, onboarding, questionnaires et consentements

> Branch: `sprint-4`

## Objective

Build the M4 customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow.

## Execution order

1. [x] S4.1 — Client table + phone-based search/create-inline.
2. [ ] S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link.
3. [ ] Subsequent onboarding/questionnaire/consent slices — finalize from Notion backlog after S4.2 dependencies are validated.

## S4.1 — validated

Backlog task: **Client table + phone-based search/create-inline**.

Validated behavior:
- admin-only active-customer list/search/create;
- normalized WhatsApp reused as the V1 active-customer collision key;
- duplicate active/non-anonymized creation rejected;
- no unique DB constraint added;
- manual creation leaves `prospect_id = null`;
- archived/anonymized customers excluded from normal lookup;
- create + audit atomic in one PostgreSQL transaction;
- `customer.created` audit metadata contains only `{ source: "manual" }`;
- French search-first / inline-create UI;
- no request/subscription/onboarding mutation.

Concurrency:
- S4.1 serializes customer creation with a PostgreSQL transaction-scoped advisory lock keyed by normalized WhatsApp.
- Future customer writers must participate in that same locking protocol unless an approved schema-level uniqueness strategy replaces it.

Validation evidence:
- `npm run typecheck` — green;
- `npm test` — server 122/122, shared 15/15;
- `npm run build` — green;
- `npm run db:check` — green;
- `npm run test:integration` — 20/20 green including five S4.1 DB scenarios;
- Reviewer passed with notes;
- QA passed with browser limitation;
- Fred Gate 2 browser/DBeaver validation green on 2026-10-20.

Non-blocking note:
- a local-development demo-admin helper was added for local acceptance; it is guarded to `NODE_ENV=development` and the disposable `localhost:5433/kfit_dev` target only.

## S4.2 — next

Planning only. Inspect:
- qualified request eligibility and terminal-state rules;
- customer reuse/create semantics using the S4.1 advisory-lock protocol;
- subscription schema and initial status/history;
- immutable request↔subscription linking;
- service/variant/price source of truth from qualification review;
- component snapshot creation;
- capacity reservation;
- hard transaction + audit boundary;
- idempotency / repeated-conversion rejection.

Do not implement S4.2 before Fred approves the plan.

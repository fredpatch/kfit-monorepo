# Sprint 3 — Demandes, prospects, qualification et liste d'attente

> Branch: `sprint-3`
> Status: CLOSED — Fred validated 2026-09-17

## Objective

Build the M2 acquisition workflow after the validated catalogue foundation: public request intake, public form, admin request/contact queue, qualification reviews and manual waitlist handling.

## Execution order

1. [x] S3.1 — Public request/prospect intake contract (server-first).
2. [x] S3.2 — Public request form (client).
3. [x] S3.3 — Admin request queue + contact attempt logging.
4. [x] S3.4 — Qualification review recording.
5. [x] S3.5 — Manual waitlist entry management.

## S3.1 — validated

Validated by Fred locally on 2026-09-17.

Scope:

- shared public request route/DTO/error contracts;
- anonymous request service/repository/controller/router;
- prospect reuse by normalized WhatsApp number;
- request creation in `submitted` state;
- additive unique `submission_token` migration;
- concurrency-safe idempotent replay using PostgreSQL SAVEPOINT recovery;
- public service availability/publication gating;
- requested-variant ownership validation;
- origin/IP/honeypot/minimum-time abuse safeguards;
- anonymous audit events without PII;
- no automatic waitlist creation.

## S3.2 — validated

Validated by Fred locally on 2026-09-17.

Scope:

- public unauthenticated requests API client consuming `POST /requests`;
- inline expandable request form integrated into public service cards;
- required full name + WhatsApp and service-scoped variant selection where applicable;
- one `crypto.randomUUID()` submission token per request intent, reused for retry/idempotency;
- S3.1 `website` honeypot and `formRenderedAt` propagation;
- centralized French localization of typed request errors;
- success confirmation with persisted request reference;
- availability-aware UI: open accepts, temporarily closed blocks normal intake, waitlist-only remains informational until S3.5;
- `/requests` Vite dev proxy route;
- no new server/shared/schema/migration or dependency changes.

Validation evidence:

- shared build green;
- client typecheck/build green;
- valid submission and service variant flows green;
- rapid double-submit persisted one request row, verified directly in PostgreSQL through DBeaver;
- transient retry reused the same intent and completed without duplication;
- temporarily-closed/waitlist-only/race rejection UX green;
- required-field, honeypot accessibility, mobile and catalogue-regression checks green.

## S3.3 — validated

Validated by Fred locally on 2026-09-17. Feature commit: `29c435f`.

Scope:

- additive shared admin request routes, DTOs, error codes, service-request status vocabulary, contact-attempt vocabularies and the locked S3.3 transition subset;
- authenticated admin queue and detail endpoints with prospect/service/variant context and ordered contact history;
- structured contact-attempt logging using `whatsapp | phone_call | sms | email | other`, `outbound | inbound`, and `reached | no_answer | invalid_contact | callback_requested | not_interested | other`;
- status-transition enforcement limited to `submitted→contacting`, `contacting→qualification_in_progress`, `contacting→abandoned`, `qualification_in_progress→abandoned`, and `abandoned→qualification_in_progress`;
- hard audit atomicity for contact-attempt creation and status changes;
- admin-only auth, same-origin and CSRF on mutations;
- Catalogue / Demandes admin navigation and request-management UI;
- no migration required.

Validation evidence:

- root typecheck/build green;
- shared and server unit suites green;
- `db:check` green;
- real-PostgreSQL repository integration tests green, including audit rollback paths;
- Fred browser/DBeaver smoke green;
- S3.2 regression green.

## S3.4 — validated

Validated by Fred locally on 2026-09-17. Feature commit: `be67a9c`.

Scope:

- admin `POST /admin/requests/:requestId/qualification-review` command;
- source state restricted to `qualification_in_progress`;
- outcomes restricted to `qualified`, `qualified_with_conditions`, `rejected`;
- outcome-specific final-variant/price/conditions/rejection validation;
- review insert + request transition + `request.qualification_review_recorded` audit in one PostgreSQL transaction;
- PII/free-text excluded from audit metadata;
- no reopen/revision/supersession workflow exposed;
- admin qualification history/form UI;
- no migration required.

Validation evidence:

- typecheck/build/db:check green;
- reviewer pass;
- real-PostgreSQL integration suite green;
- Fred browser/DBeaver smoke and S3.2/S3.3 regressions green.

## S3.5 — validated

Validated by Fred locally on 2026-09-17. Feature commit: `0775695`.

Scope:

- named admin commands for manual waitlist creation and withdrawal;
- create allowed from `submitted`, `contacting`, or `qualification_in_progress` only;
- service must be non-archived and either `waitlist_only` or `waitlistEnabled = true`; public publication flags are not reapplied to an already-existing request;
- optional variant must belong to the same service and not be archived;
- request row is locked with `FOR UPDATE` before active-entry conflict checks, providing V1 concurrency safety without a new uniqueness migration;
- create transaction atomically inserts active `waitlist_entries`, transitions request to `waitlisted`, and writes `request.waitlist_entered` audit;
- withdrawal transaction atomically marks the active entry `withdrawn`, sets `leftAt`, transitions request to `abandoned`, and writes `request.waitlist_withdrawn` audit;
- FIFO semantics use `enteredAt ASC` plus stable id tie-breaker; `priorityNote` is advisory only and does not affect ordering;
- audit metadata excludes `priorityNote`, prospect PII and other free text;
- admin detail exposes additive waitlist history and eligible create/withdraw controls;
- automatic promotion, contacted/promoted/expired commands, subscription conversion, onboarding and queue reordering remain out of scope;
- no migration required.

Validation evidence:

- `npm run typecheck` green;
- `npm run build` green;
- `npm run db:check` green;
- Windows-compatible test globs fixed; `npm test` executed server 110/110 and shared 12/12;
- real PostgreSQL integration suite 15/15 green, including create/withdraw atomicity, duplicate conflict and audit-failure rollback;
- reviewer passed with notes and QA passed;
- Fred local browser/DBeaver Gate 2 smoke green.

## Sprint acceptance result

Sprint 3 objective is achieved. K'FIT now supports the validated acquisition flow from public request submission through admin contact management, qualification decision and manual waitlist handling, with explicit server-authoritative transitions and transaction-scoped audit guarantees on critical mutations.

No automatic waitlist promotion, subscription conversion or onboarding behavior was pulled forward from Sprint 4.

## Next sprint

Sprint 4 — Clients, conversion, onboarding, questionnaires et consentements.

First dependency-safe backlog task: **Client table + phone-based search/create-inline** (M4, CRITIQUE, no declared dependency). This customer foundation precedes the later atomic request-conversion transaction, whose backlog dependency explicitly requires the customer model.

## Production-level notes

- In-memory IP limiting is acceptable for current V1/local single-process behavior but must be revisited if production uses multiple replicas.
- `trust proxy` must be decided during staging/production wiring before relying on forwarded client IPs.
- Queue latest-contact lookup is acceptable for V1 single-coach volume; revisit if usage grows materially.
- Legal review and true off-server encrypted backup remain production blockers outside Sprint 3 functional execution.

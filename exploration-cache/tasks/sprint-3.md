# Sprint 3 — Demandes, prospects, qualification et liste d'attente

> Branch: `sprint-3`

## Objective

Build the M2 acquisition workflow after the validated catalogue foundation: public request intake, public form, admin request/contact queue, qualification reviews and manual waitlist handling.

## Execution order

1. [x] S3.1 — Public request/prospect intake contract (server-first).
2. [x] S3.2 — Public request form (client).
3. [x] S3.3 — Admin request queue + contact attempt logging.
4. [ ] S3.4 — Qualification review recording.
5. [ ] S3.5 — Manual waitlist entry management.

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
- every other S3.4/S3.5-owned target remains rejected;
- hard audit atomicity for contact-attempt creation and status changes: the primary write and audit event share the exact same Drizzle transaction;
- PII-free audit metadata;
- admin-only authentication on all admin request endpoints; same-origin + CSRF on mutations;
- Catalogue / Demandes admin switcher, status-filterable queue, detail panel, contact history/form and server-shared transition actions;
- no migration required and no S3.4/S3.5 implementation included.

Validation evidence:

- root typecheck/build green;
- shared and server unit suites green;
- `db:check` green;
- real-PostgreSQL admin request repository integration tests green, including forced audit-failure rollback cases;
- Fred browser smoke: queue/detail/filter/contact-attempt logging/status progression/forbidden transition behavior all green;
- DBeaver verification: contact-attempt and audit rows persisted; audit metadata contains no prospect PII/free text;
- S3.2 public request form regression green.

## Current slice

S3.4 — Qualification review recording.

Status: planning.

Dependency: validated S3.3 admin request/detail and explicit transition foundation.

Expected order: inspect `qualification_reviews`, state-machine rules and relational invariants → applicable reusable patterns → shared contracts → Service → Controller → Route/Middleware → server validation → admin client integration → Fred validation.

S3.4 must own qualification outcomes only. Do not implement waitlist entry management (S3.5) inside this slice.

## Production-level notes

- In-memory IP limiting is acceptable for current V1/local single-process behavior but must be revisited if production uses multiple replicas.
- `trust proxy` must be decided during staging/production wiring before relying on forwarded client IPs.
- Queue latest-contact lookup is acceptable for V1 single-coach volume; revisit if usage grows materially.
- Legal review and true off-server encrypted backup remain production blockers outside Sprint 3 functional execution.

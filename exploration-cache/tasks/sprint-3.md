# Sprint 3 — Demandes, prospects, qualification et liste d'attente

> Branch: `sprint-3`

## Objective

Build the M2 acquisition workflow after the validated catalogue foundation: public request intake, public form, admin request/contact queue, qualification reviews and manual waitlist handling.

## Execution order

1. [x] S3.1 — Public request/prospect intake contract (server-first).
2. [x] S3.2 — Public request form (client).
3. [ ] S3.3 — Admin request queue + contact attempt logging.
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

## Current slice

S3.3 — Admin request queue + contact attempts.

Status: not started.

Dependencies: validated S3.1 request domain and persisted requests; S3.2 public creation path is closed and must remain regression-free.

Expected order: inspect existing request/contact-attempt schema and state machines → applicable reusable patterns → shared contracts → Service → Controller → Route/Middleware → server validation → admin client integration → Fred validation.

Do not implement qualification decisions (S3.4) or waitlist workflows (S3.5) inside S3.3.

## Production-level notes

- In-memory IP limiting is acceptable for current V1/local single-process behavior but must be revisited if production uses multiple replicas.
- `trust proxy` must be decided during staging/production wiring before relying on forwarded client IPs.
- Legal review and true off-server encrypted backup remain production blockers outside Sprint 3 functional execution.

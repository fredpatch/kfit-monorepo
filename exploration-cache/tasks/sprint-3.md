# Sprint 3 — Demandes, prospects, qualification et liste d'attente

> Branch: `sprint-3`

## Objective

Build the M2 acquisition workflow after the validated catalogue foundation: public request intake, public form, admin request/contact queue, qualification reviews and manual waitlist handling.

## Execution order

1. [x] S3.1 — Public request/prospect intake contract (server-first).
2. [ ] S3.2 — Public request form (client).
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

Validation evidence:

- migration `0002_rapid_boomerang.sql` applied locally;
- concurrent same-token real-PostgreSQL integration test green;
- shared build/tests green;
- server typecheck/build/tests green;
- `db:check` green;
- client typecheck regression green.

## Current slice

S3.2 — Public request form (name + phone, per service).

Status: not started.

Dependency: validated S3.1 `POST /requests` contract.

Expected boundary: client integration only unless a confirmed S3.1 regression requires a server fix. The server remains authoritative for availability, publication, variant ownership, abuse protection and idempotency.

## Production-level notes

- In-memory IP limiting is acceptable for current V1/local single-process behavior but must be revisited if production uses multiple replicas.
- `trust proxy` must be decided during staging/production wiring before relying on forwarded client IPs.
- Legal review and true off-server encrypted backup remain production blockers outside Sprint 3 functional execution.

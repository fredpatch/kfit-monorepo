# Session Context

> Date: 2026-09-17 | Sprint 3 active

## Where we left off

Sprint 0, Sprint 1 auth, password recovery, Sprint 2.1 through S2.6, and Sprint 3.1 are closed and locally validated.

## Sprint 3 current state

Sprint 3 covers M2: demandes, prospects, qualification et liste d'attente.

S3.1 public request/prospect intake foundation is locally validated by Fred.

Validated S3.1 behavior:

- public `POST /requests` shared/server contract;
- prospect reuse by normalized WhatsApp number;
- service request creation in `submitted` state only;
- unique client-generated submission token;
- concurrent same-token replay validated against real PostgreSQL using nested transaction/SAVEPOINT recovery;
- archived, temporarily closed, waitlist-only, non-public and unpublished services rejected with typed errors;
- requested variant must belong to the selected service; nonexistent/cross-service conditions collapse to `REQUEST_VARIANT_INVALID` publicly;
- public abuse protection uses origin checking, in-memory per-IP limiting, honeypot and minimum completion time;
- anonymous/public audit actor with no PII in metadata;
- no automatic or implicit waitlist entry creation.

Migration `0002_rapid_boomerang.sql` was applied locally and the real PostgreSQL idempotency integration test passed.

## Repository state

- `main` received the validated S3.1 feature commit directly.
- Remote `sprint-3` was then normalized from that exact validated `main` head; no history was rewritten.
- Sprint 3 execution continues on `sprint-3`.

## Active constraints

- Do not run project commands from ChatGPT/Codex runtime.
- Only Fred's successful local execution marks validation.
- Legal validation remains required before production.
- A true off-server encrypted backup destination remains required before production.
- Native PostgreSQL remains on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

## Next boundary

S3.2 — **Public request form (name + phone, per service)**.

Reuse the validated S3.1 public request contract; this slice should be client-first integration over authoritative server behavior, with French UI, loading/disabled/success/error states, submission-token generation, honeypot/minimum-time fields, and catalogue-service context.

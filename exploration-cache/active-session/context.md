# Session Context

> Date: 2026-09-17 | Sprint 3 active

## Where we left off

Sprint 0, Sprint 1 auth, password recovery, Sprint 2.1 through S2.6, and Sprint 3.1 through S3.2 are closed and locally validated.

## Sprint 3 current state

Sprint 3 covers M2: demandes, prospects, qualification et liste d'attente.

Validated S3.1 foundation:

- public `POST /requests` contract and request/prospect persistence;
- unique client-generated submission token with real-PostgreSQL concurrent idempotency validation;
- public availability/publication/variant gating;
- layered public abuse safeguards and anonymous audit behavior;
- no automatic waitlist entry creation.

Validated S3.2 client integration:

- inline public request form replaces the mailto placeholder for open services;
- required full name + WhatsApp and service-scoped variant selection;
- stable submission token per intent, reused for retry/double-submit defense;
- S3.1 honeypot/form timing fields sent unchanged;
- French localized typed-error handling and success reference display;
- temporarily-closed and waitlist-only states do not expose normal request intake;
- `/requests` Vite proxy path added;
- no new server/shared/schema/migration/dependency changes.

Fred validated the complete browser flow and confirmed via DBeaver that rapid duplicate submission persisted exactly one `service_requests` row.

## Repository state

- Sprint 3 execution continues on remote/local `sprint-3`.
- S3.2 feature commit: `882302f296d16ea15a20efcfc152aa9b97875c25`.
- Closure/state synchronization follows that validated commit on `sprint-3`.

## Active constraints

- Do not run project commands from ChatGPT/Codex runtime.
- Only Fred's successful local execution marks validation.
- Legal validation remains required before production.
- A true off-server encrypted backup destination remains required before production.
- Native PostgreSQL remains on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

## Next boundary

S3.3 — **Admin request queue + contact attempts**.

Start by inspecting existing request/contact-attempt schema, state machines, admin auth/permissions and reusable patterns. Follow server-first implementation and do not absorb S3.4 qualification or S3.5 waitlist scope.

# K'FIT — Executable Tasks

> Source of truth: Notion backlog. This file is the local executable summary.

## Sprint 0 — Initialisation

- [x] Sprint 0 initialization closed and locally validated.

## Sprint 1 — Authentication, sessions, OTP and security

- [x] Sprint 1 auth foundation closed and locally validated.
- [x] Deferred password reset/recovery HTTP flow closed and locally validated.

## Sprint 2 — Catalogue, service offers and public availability

Execution rule: local command execution is performed by Fred; ChatGPT/Codex updates GitHub/Notion and only marks validation after Fred confirms successful local execution.

### Validated execution order

1. [x] S2.1 — Catalogue public API foundation — locally validated.
2. [x] S2.2 — Initial services/variants/components/policies seed — locally validated.
3. [x] S2.3 — Admin catalogue editing foundation — locally validated.
4. [x] S2.4 — Public landing page catalogue consumption — locally validated.
5. [x] S2.5 — Capacity/waitlist controls — locally validated by Fred on 2026-09-17.
6. [x] S2.6 — Admin UI capacity/waitlist controls — locally validated by Fred on 2026-09-17.

Sprint 2 is closed and locally validated.

## Sprint 3 — Demandes, prospects, qualification et liste d'attente

Execution branch: `sprint-3`.

### Current execution order

1. [x] S3.1 — Public request/prospect intake contract (server-first) — locally validated by Fred on 2026-09-17.
2. [ ] S3.2 — Public request form (client) — next selected slice; depends on S3.1.
3. [ ] S3.3 — Admin request queue + contact attempts — not started; depends on S3.1.
4. [ ] S3.4 — Qualification review recording — not started; depends on S3.3.
5. [ ] S3.5 — Manual waitlist entry management — not started; depends on S3.1.

### S3.1 validated scope

- Shared `POST /requests` contract with stable `REQUEST_*` error codes.
- Public request intake creates/reuses a prospect and creates one submitted service request.
- `service_requests.submission_token` is unique/not-null and migration `0002_rapid_boomerang.sql` was applied locally.
- Idempotent replay is concurrency-safe through a nested Drizzle transaction/SAVEPOINT and was validated against real PostgreSQL.
- Public abuse protection includes origin check, in-memory per-IP limiting, honeypot and minimum completion time.
- Public service rules are authoritative: archived, temporarily closed, waitlist-only and non-public/unpublished services are rejected with typed errors.
- A supplied variant must exist and belong to the selected service; invalid/cross-service variants return `REQUEST_VARIANT_INVALID` without disclosing which condition occurred.
- Audit events use anonymous/public actor semantics and avoid PII in metadata.
- No waitlist entry is created in S3.1; waitlist management remains S3.5.
- `duplicate_of_request_id` remains a separate business-deduplication concept and is untouched.

### S3.1 validation evidence

Fred confirmed locally:

- migration `0002` applied successfully;
- real-PostgreSQL concurrent same-token integration test green;
- shared build/tests green;
- server typecheck/build/tests green;
- `db:check` green;
- client typecheck regression green;
- approved public-listing and variant-ownership rules green.

### Next slice

S3.2 — **Public request form (name + phone, per service)**. Do not implement S3.3+ until S3.2 is testable and locally validated, unless execution order is explicitly changed.

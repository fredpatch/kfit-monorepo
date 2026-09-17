# K'FIT — Executable Tasks

> Source of truth: Notion backlog. This file is the local executable summary.

## Sprint 0 — Initialisation

- [x] Sprint 0 initialization closed and locally validated.

## Sprint 1 — Authentication, sessions, OTP and security

- [x] Sprint 1 auth foundation closed and locally validated.
- [x] Deferred password reset/recovery HTTP flow closed and locally validated.

## Sprint 2 — Catalogue, service offers and public availability

Execution rule: local command execution is performed by Fred; ChatGPT/Codex updates GitHub/Notion and only marks validation after Fred confirms successful local execution.

- [x] S2.1 — Catalogue public API foundation — locally validated.
- [x] S2.2 — Initial services/variants/components/policies seed — locally validated.
- [x] S2.3 — Admin catalogue editing foundation — locally validated.
- [x] S2.4 — Public landing page catalogue consumption — locally validated.
- [x] S2.5 — Capacity/waitlist controls — locally validated by Fred on 2026-09-17.
- [x] S2.6 — Admin UI capacity/waitlist controls — locally validated by Fred on 2026-09-17.

Sprint 2 is closed and locally validated.

## Sprint 3 — Demandes, prospects, qualification et liste d'attente

Execution branch: `sprint-3`.

### Current execution order

1. [x] S3.1 — Public request/prospect intake contract (server-first) — locally validated by Fred on 2026-09-17.
2. [x] S3.2 — Public request form (client) — locally validated by Fred on 2026-09-17.
3. [ ] S3.3 — Admin request queue + contact attempts — next selected slice; depends on S3.1.
4. [ ] S3.4 — Qualification review recording — not started; depends on S3.3.
5. [ ] S3.5 — Manual waitlist entry management — not started; depends on S3.1.

### S3.1 validated scope

- Shared `POST /requests` contract with stable `REQUEST_*` error codes.
- Public request intake creates/reuses a prospect and creates one submitted service request.
- `service_requests.submission_token` is unique/not-null and migration `0002_rapid_boomerang.sql` was applied locally.
- Idempotent replay is concurrency-safe through a nested Drizzle transaction/SAVEPOINT and was validated against real PostgreSQL.
- Public service rules and requested-variant ownership are server-authoritative and return typed errors.
- Public abuse protection includes origin check, in-memory per-IP limiting, honeypot and minimum completion time.
- Audit events use anonymous/public actor semantics and avoid PII in metadata.

### S3.2 validated scope

- Replaced the public catalogue mailto CTA with an inline request form for open services.
- Captures required full name + WhatsApp and service-scoped variant selection when variants exist.
- Uses the validated S3.1 `POST /requests` contract through a dedicated public requests API client.
- Generates one client `submissionToken` per request intent and reuses it for transient retries/double-submit defense.
- Sends `website` honeypot and `formRenderedAt` exactly as required by S3.1.
- Localizes typed `REQUEST_*` failures into French without exposing raw codes/reasons.
- `temporarily_closed` and `waitlist_only` services do not expose a normal request form; waitlist enrollment remains S3.5.
- Success state displays the server request reference.
- Vite dev proxy includes `/requests`; the earlier forwarded-host proxy fix remains validated.
- No shared/server/schema/migration changes and no new client dependencies.

### S3.2 validation evidence

Fred confirmed locally on 2026-09-17:

- shared build green;
- client typecheck green;
- client production build green;
- valid request submission green;
- service-scoped variant submission green;
- rapid double-submit persisted exactly one `service_requests` row, verified in DBeaver;
- transient retry with stable token green;
- temporarily-closed and waitlist-only UI behavior green;
- stale/archive race displays localized error only;
- required-field validation, honeypot accessibility behavior and mobile layout green;
- public catalogue regression green.

### Next slice

S3.3 — **Admin request queue + contact attempts**. Follow server-first order: inspect existing request/contact schema/state machine and applicable patterns before implementation. Do not start S3.4+ until S3.3 is testable and locally validated.

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

### Sprint 2 closure

- Admin bootstrap/login works against the real local PostgreSQL-backed API.
- Admin catalogue services load through the local Vite proxy.
- Open/unlimited, limited-capacity, and waitlist-only mutations were manually validated.
- Invalid combinations are blocked and archived services remain read-only.
- Persisted values survive refresh.
- Public catalogue regression passed and reflects saved availability.
- Client typecheck and production build are green.
- No new catalogue migration was required for S2.6.

Sprint 2 is closed and locally validated.

## Sprint 3 — Demandes, prospects, qualification et liste d'attente

Execution branch: `sprint-3` (fast-forwarded from `main`).

### Current execution order

1. [~] S3.1 — Public request/prospect intake contract (server-first) — implementation complete, awaiting review/QA and Fred local validation.
2. [ ] S3.2 — Public request form (client) — not started; depends on S3.1.
3. [ ] S3.3 — Admin request queue + contact attempts — not started; depends on S3.1.
4. [ ] S3.4 — Qualification review recording — not started; depends on S3.3.
5. [ ] S3.5 — Manual waitlist entry management — not started; depends on S3.1.

### S3.1 implemented scope

- Shared contract: `requestsApiRoutes.publicSubmit` (`POST /requests`), `RequestSubmissionInput/Response`, `requestErrorCodes`.
- Schema: added `service_requests.submission_token` (unique, not null) via migration `0002_rapid_boomerang.sql` — additive, table has no production rows yet.
- Server module `packages/server/src/modules/requests/`: service (validation, availability gating, bot heuristics, audit), Drizzle repository (idempotent-by-token + prospect reuse-by-whatsapp in one transaction), controller, Express router (same-origin guard + in-memory per-IP rate limit), wired into `app.ts`/`dev-app.ts`.
- Business rules applied: `archived`/`temporarily_closed`/`waitlist_only` all reject normal submission with typed errors (`REQUEST_SERVICE_ARCHIVED` / `REQUEST_SERVICE_UNAVAILABLE` / `REQUEST_WAITLIST_REQUIRED`); actual waitlist entry creation is deferred to S3.5.
- Idempotency: client-supplied `submissionToken`, enforced by a DB unique index; a retried token returns the original request. `duplicate_of_request_id` was left untouched (business dedupe, not implemented in S3.1).
- Audit: every outcome (success, archived/closed/waitlist rejection, bot-signal block) writes an `audit_events` row with `actorType: "anonymous"`, no PII in metadata.
- No client change in this slice.

### S3.1 validation gate

```bash
git switch sprint-3
git pull

npm run build --workspace @kfit/shared
node --test packages/shared/dist/requests/contracts.test.js
npm run typecheck --workspace @kfit/server
npm run build --workspace @kfit/server
node --test 'packages/server/dist/**/*.test.js'
npm run db:check --workspace @kfit/server
npm run typecheck --workspace @kfit/client
```

All of the above were executed by the assistant and are green. `npm run db:migrate` was **not** run (local DB apply is Fred's action per project convention) — confirm the local dev database is on migration `0002` before manual testing.

Manual validation still required from Fred:
- submit a valid request against an `open` service and confirm a row appears in `service_requests`/`prospects`;
- confirm `temporarily_closed`, `waitlist_only` and `archived` services are rejected with the expected typed error;
- confirm a retried submission (same token) does not create a second row;
- confirm an `audit_events` row is written for a successful submission with `actor_type = anonymous`.

Do not mark S3.1 complete or update `changelog.md` until Fred confirms the gate green.

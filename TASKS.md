# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-3
Sprint            3 — Demandes, prospects, qualification et liste d'attente
Active slice      S3.3 — Admin request queue + contact attempts
Workflow state    PLANNING
Last validated    S3.2 — 2026-09-17 (feature commit 882302f)
Next action       Planner: produce S3.3 plan → Fred approval
```

## Sprint 3 slices

| Slice | Scope                                                  | Depends on | State                              |
| ----- | ------------------------------------------------------ | ---------- | ---------------------------------- |
| S3.1  | Public request/prospect intake contract (server-first) | —          | CLOSED — Fred validated 2026-09-17 |
| S3.2  | Public request form (client)                           | S3.1       | CLOSED — Fred validated 2026-09-17 |
| S3.3  | Admin request queue + contact attempts                 | S3.1       | PLANNING                           |
| S3.4  | Qualification review recording                         | S3.3       | NOT STARTED                        |
| S3.5  | Manual waitlist entry management                       | S3.1       | NOT STARTED                        |

One slice at a time. Do not open S3.4/S3.5 while S3.3 is not `CLOSED`, unless Fred changes the order.

## S3.3 — brief

Goal: expose submitted public requests to the authorized admin and support explicit contact-attempt logging and status progression, with server-authoritative state rules.

Planner must:

- inspect `service_requests`, `contact_attempts` and their state machines (`exploration-cache/project/state-machines.md`, `database-schema.md`, `relational-contract.md`);
- inspect existing admin routing, auth and permission middleware;
- consult patterns: Shared API Contracts, Explicit State Transitions, Audit Event System, Domain Error Taxonomy;
- define server-first read and command contracts;
- keep S3.1/S3.2 behavior unchanged.

Order: shared contracts → service → controller → route/middleware → server tests → admin client (French UI) → Fred validation.

Out of scope: qualification decisions (S3.4), waitlist workflows (S3.5).

## Closed

```text
Sprint 0 — Initialisation
Sprint 1 — Auth, sessions, OTP, security (+ password recovery HTTP flow)
Sprint 2 — Catalogue, offers, public availability (S2.1–S2.6)
Sprint 3 — S3.1, S3.2
```

Do not modify closed work unless the active slice explicitly extends it, a regression is confirmed, or Fred approves reopening it.

### S3.1 — validated scope (reference)

- Shared `POST /requests` contract with stable `REQUEST_*` error codes.
- Creates/reuses a prospect and creates one submitted service request.
- `service_requests.submission_token` unique + not null (migration `0002_rapid_boomerang.sql`).
- Concurrency-safe idempotent replay (nested Drizzle transaction/SAVEPOINT), validated on real PostgreSQL.
- Server-authoritative gating: archived, temporarily closed, waitlist-only, non-public/unpublished services rejected; variant must belong to the service (`REQUEST_VARIANT_INVALID`, no condition disclosure).
- Abuse controls: origin check, in-memory per-IP limit, honeypot, minimum completion time.
- Anonymous audit events without PII. No waitlist entry created. `duplicate_of_request_id` untouched.

### S3.2 — validated scope (reference)

- Inline request form replaces the mailto CTA for open services; full name + WhatsApp; service-scoped variant selector.
- One client `submissionToken` per intent, reused on retry/double submit; sends `website` honeypot and `formRenderedAt`.
- French-localized typed errors; success shows server reference.
- Closed/waitlist-only services expose no normal form. Vite proxy includes `/requests`.
- No server/shared/schema/dependency changes.

## Blockers

Before production:

- Legal validation for the applicable Gabon context (privacy, consent, retention, health notice, terms/refunds, image/testimonials).
- True encrypted off-server backup destination.

Known non-blocking notes:

- Per-IP rate limiting is process-local — revisit for multi-replica production.
- `trust proxy` must be decided in staging/production wiring.
- Prospect-reuse race, rate-limiter memory growth, timing clock-skew, audit symmetry, origin-helper deduplication.
- No client test framework; client acceptance = typecheck + build + Fred browser check.
- `requests.repository.integration.ts` cleanup deletes prospects by fixed WhatsApp `+24100000000` — run only against a disposable local DB.

## Environment constraints

- See `PROJECT.md §Data` and `§Gotchas` (Docker PostgreSQL 5433, native 5432).
- Chat/cloud runtimes do not run project commands; only Fred's local execution closes a gate (PROJECT.md §Runtime).

## Handoff

```text
Branch            sprint-3
Slice             S3.3
Workflow state    PLANNING
✅ Done           S3.1, S3.2 closed
⏳ Pending        S3.3 plan
Validation done   —
Not validated     —
Risks/blockers    see Blockers
Next action       Planner
```

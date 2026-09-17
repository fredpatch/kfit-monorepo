# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-3
Sprint            3 — Demandes, prospects, qualification et liste d'attente
Active slice      S3.4 — Qualification review recording
Workflow state    PLANNING
Last validated    S3.3 — 2026-09-17 (feature commit 29c435f)
Next action       Planner: inspect qualification_reviews + state machine and produce S3.4 plan → Fred approval
```

## Sprint 3 slices

| Slice | Scope                                                  | Depends on | State                              |
| ----- | ------------------------------------------------------ | ---------- | ---------------------------------- |
| S3.1  | Public request/prospect intake contract (server-first) | —          | CLOSED — Fred validated 2026-09-17 |
| S3.2  | Public request form (client)                           | S3.1       | CLOSED — Fred validated 2026-09-17 |
| S3.3  | Admin request queue + contact attempts                 | S3.1       | CLOSED — Fred validated 2026-09-17 |
| S3.4  | Qualification review recording                         | S3.3       | PLANNING                           |
| S3.5  | Manual waitlist entry management                       | S3.1       | NOT STARTED                        |

One slice at a time. Do not open S3.5 while S3.4 is not `CLOSED`, unless Fred changes the order.

## S3.4 — brief

Goal: record qualification reviews and apply the approved qualification outcomes through server-authoritative, explicit transitions without opening waitlist management.

Planner must:

- inspect `qualification_reviews`, request status vocabulary, state-machine rules and relational invariants;
- inspect the validated S3.3 admin request detail/transition architecture and transactional audit pattern;
- consult patterns: Shared API Contracts, Explicit State Transitions, Atomic Business Operation, Audit Event System, Domain Error Taxonomy;
- define the review versioning/recording rules and exact transition ownership for `qualified`, `qualified_with_conditions`, and `rejected`;
- preserve S3.1–S3.3 behavior and keep S3.5 waitlist workflows out of scope.

Order: reusable pattern review → contracts → Service → Controller → Route/Middleware → server validation → admin client integration → Fred validation.

## Closed

```text
Sprint 0 — Initialisation
Sprint 1 — Auth, sessions, OTP, security (+ password recovery HTTP flow)
Sprint 2 — Catalogue, offers, public availability (S2.1–S2.6)
Sprint 3 — S3.1, S3.2, S3.3
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

### S3.3 — validated scope (reference)

- Admin-only request queue and detail endpoints expose prospect/service/variant context and ordered contact history.
- Contact attempts use the approved application vocabulary for channel, direction and outcome; logging never changes request status implicitly.
- Status transitions are limited to the S3.3 contact-management subset and rejected server-side outside that allow-list.
- `contact_attempts` insert + `request.contact_attempt_logged` audit and status update + `request.status_changed` audit each share one Drizzle transaction.
- Audit metadata contains only safe domain fields; Fred verified no name/WhatsApp/email/free text in audit metadata through DBeaver.
- Admin mutations require authenticated admin session, same-origin and CSRF protection.
- Admin UI adds Catalogue / Demandes navigation, queue filtering, detail, contact-attempt logging and only allowed transition actions.
- Real PostgreSQL integration tests, rollback/atomicity paths, browser smoke and S3.2 regression all passed locally.

## Blockers

Before production:

- Legal validation for the applicable Gabon context (privacy, consent, retention, health notice, terms/refunds, image/testimonials).
- True encrypted off-server backup destination.

Known non-blocking notes:

- Per-IP rate limiting is process-local — revisit for multi-replica production.
- `trust proxy` must be decided in staging/production wiring.
- Prospect-reuse race, rate-limiter memory growth, timing clock-skew, audit symmetry, origin-helper deduplication.
- No client test framework; client acceptance = typecheck + build + Fred browser check.
- Request-router boilerplate and UUID regex duplication remain cleanup candidates, not active blockers.
- Queue latest-contact lookup is acceptable for V1 single-coach volume; revisit if request/contact volume grows materially.
- `requests.repository.integration.ts` cleanup deletes prospects by fixed WhatsApp `+24100000000` — run only against a disposable local DB.

## Environment constraints

- See `PROJECT.md §Data` and `§Gotchas` (Docker PostgreSQL 5433, native 5432).
- Chat/cloud runtimes do not run project commands; only Fred's local execution closes a gate (PROJECT.md §Runtime).

## Handoff

```text
Branch            sprint-3
Slice             S3.4
Workflow state    PLANNING
✅ Done           S3.1, S3.2, S3.3 closed
⏳ Pending        S3.4 plan
Validation done   S3.3 real-DB integration + browser/DBeaver Gate 2 green
Not validated     S3.4 not started
Risks/blockers    see Blockers
Next action       Planner
```

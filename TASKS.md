# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-3
Sprint            3 — Demandes, prospects, qualification et liste d'attente
Active slice      —
Workflow state    SPRINT_CLOSED
Last validated    S3.5 — 2026-09-17 (feature commit 0775695)
Next action       Fred: fast-forward/merge sprint-3 into main, then open Sprint 4 from updated main
```

## Sprint 3 slices

| Slice | Scope                                                  | Depends on | State                              |
| ----- | ------------------------------------------------------ | ---------- | ---------------------------------- |
| S3.1  | Public request/prospect intake contract (server-first) | —          | CLOSED — Fred validated 2026-09-17 |
| S3.2  | Public request form (client)                           | S3.1       | CLOSED — Fred validated 2026-09-17 |
| S3.3  | Admin request queue + contact attempts                 | S3.1       | CLOSED — Fred validated 2026-09-17 |
| S3.4  | Qualification review recording                         | S3.3       | CLOSED — Fred validated 2026-09-17 |
| S3.5  | Manual waitlist entry management                       | S3.1       | CLOSED — Fred validated 2026-09-17 |

Sprint 3 is closed. Do not open Sprint 4 implementation until `main` is updated from the validated `sprint-3` head and the Sprint 4 branch/state is initialized.

## Sprint 3 closure

Validated acquisition workflow delivered:

- public prospect/request intake with concurrency-safe idempotency and abuse controls;
- public request form with stable request-intent token handling;
- authenticated admin queue, detail, contact attempts and explicit contact-stage transitions;
- qualification review command with outcome-specific validation and hard transactional audit;
- manual waitlist entry/withdrawal with FIFO semantics, concurrency-safe request locking and hard transactional audit;
- no automatic waitlist promotion, subscription conversion or onboarding implemented inside Sprint 3.

Final S3.5 validation:

- typecheck/build/db:check green;
- `npm test` executes real Windows-compatible globs: server 110/110, shared 12/12;
- real PostgreSQL integration suite 15/15;
- reviewer pass and QA pass;
- Fred local browser/DBeaver smoke green for waitlist creation, duplicate prevention, withdrawal, request-state synchronization and safe audit metadata.

## Closed

```text
Sprint 0 — Initialisation
Sprint 1 — Auth, sessions, OTP, security (+ password recovery HTTP flow)
Sprint 2 — Catalogue, offers, public availability (S2.1–S2.6)
Sprint 3 — Demandes, prospects, qualification et liste d'attente (S3.1–S3.5)
```

## Next sprint

Sprint 4 — Clients, conversion, onboarding, questionnaires et consentements.

First dependency-safe backlog task: **Client table + phone-based search/create-inline**. It is a CRITIQUE M4 server task with no declared dependency and provides the customer foundation required by the later atomic request-conversion transaction.

After `main` is updated, planning starts from the Sprint 4 customer model/client foundation before conversion or onboarding implementation.

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
Sprint            3
Workflow state    SPRINT_CLOSED
✅ Done           S3.1, S3.2, S3.3, S3.4, S3.5
Validation done   S3.5 typecheck/build/db:check; server 110/110; shared 12/12; PostgreSQL integration 15/15; reviewer/QA; Fred browser+DBeaver smoke
Risks/blockers    production-only blockers listed above
Next action       Merge/fast-forward sprint-3 → main, then initialize Sprint 4
Sprint 4 first    Client table + phone-based search/create-inline
```

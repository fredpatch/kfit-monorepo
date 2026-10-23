## 2026-10-23 — S7.1 prospective cadence authority and cumulative funnel

**Sources**: Fred's approved S7.1 historical-feasibility amendment, explicit database overlap-guard approval and cumulative-stage-reach decision; `exploration-cache/tasks/sprint-7.md`.

**Context**: Mutable service/variant fallback cadence cannot establish historical overdue stocks. The request workflow also permits qualification/conversion without a separately logged contact attempt, while the dashboard funnel must remain cumulative.

**Decision**: Store resolved subscription cadence source/value in prospective half-open effective intervals. Never invent legacy authority before controlled initialization. Missing eligible history produces unavailable/null stock and no delta, rendered as an accessible gap. Enforce one-open/non-overlap/source/value/range invariants in PostgreSQL; Fred approved btree_gist and a GiST exclusion constraint in the single additive migration. Source/history updates are atomic, including catalogue seed policy changes; participating writers acquire the same transaction-scoped advisory fence before owner row locks, preserving the existing subscription-to-catalogue ordering. Append only when resolution changes.

For submitted request cohorts, later-stage reach implies earlier-stage reach; converted implies qualified/contacted and qualified implies contacted. The latest authoritative qualification and conversion linkage remain the source of truth. Analytics changes no request state or contact records. Finance uses the existing S6.1 effective-net ledger model and current active schedules, keeping collected, due, future, overdue and outstanding amounts separate.

**Impact**: Migration `0013_orange_metal_master.sql`; deterministic Drizzle wrapper emits the unsupported exclusion constraint, with approved generation/application gates. Current Today/follow-up behavior remains based on the existing owner policy. New dashboard routes are authenticated admin GETs only; no persisted dashboard alerts or notification system. Source schema and operational caveats are recorded in the schema/relational docs and technical gotchas. This decision authorizes S7.1 only, not S7.2.

## 2026-10-22 — Sprint 5 and UI refonte unified on main

**Context**: Sprint 5 business work continued on `sprint-5` while the validated UI/UX refonte advanced on `main`. Both branches descended from UX-1 and then diverged: `main` carried UX-2→UX-10 work while `sprint-5` carried S5.5 planning/execution-memory updates.

**Decision**: Merge the two histories and use `main` as the single active continuation branch for the remainder of Sprint 5 and the UI refonte. The old `sprint-5` branch becomes historical and receives no new implementation.

**Rationale**: The refonte is not a separate product line; it is the client continuation of the same Sprint 5 product. One branch removes avoidable drift while preserving server-authoritative business gates.

**Impact**: S5.5 implementation starts on `main`. UX work and business work still retain their scope rules: UI changes may not silently alter business invariants, and S5.5 must stop for Reviewer/QA/Fred Gate 2 before Sprint 6.

## 2026-10-22 — Refonte UI: read-only API only, business time zone Africa/Libreville

**Context**: The UI redesign (UX-1 → UX-13) runs on `main` in parallel with Sprint 5 and needed data the existing endpoints did not expose (customer overview, analytics, catalogue occupancy, daily dashboard, cross-subscription agenda). Day and week boundaries were computed in UTC or in the device time zone depending on the screen.

**Decision**: Redesign steps may add read-only or presentation-level endpoints only; any business rule is validated by Fred before implementation, and anything needing a business change is deferred to the backlog. Business day/week (Monday start) and all appointment/datetime display use Africa/Libreville through `@kfit/shared` `time/business-time.ts` (client: `lib/format.ts`). Client status is derived once in `@kfit/shared` `customers/client-status.ts`. Dashboard KPIs show current values only until the Sprint 7 time-series API exists.

**Rationale**: Keeps Sprint 5 business logic the single source of truth while letting the UI ship, and removes day-boundary drift between server, browser and coach location.

**Impact**: New admin read endpoints under `/admin/customers`, `/admin/catalogue`, `/admin/today`, `/admin/appointments`. Legacy screens and the Analyse tab still need migration to business time (UX-10…13, V1.1). Sprint 7 series/funnel work must use the same week boundaries.

## 2026-10-20 — Customer collision serialization uses normalized-WhatsApp advisory locks

**Context**: S4.1 intentionally avoided a hard unique constraint on `customers.whatsapp` because archived/anonymized history and future identity rules may require more nuance than permanent global uniqueness, while concurrent active-customer creation still must not produce duplicate active identities.

**Decision**: Customer writers that enforce the V1 active-customer collision rule must acquire the PostgreSQL transaction-scoped advisory lock keyed by the shared normalized WhatsApp value before checking for an active/non-anonymized customer and creating a new one. S4.1 uses `customer-whatsapp:<normalized>` as the lock key namespace.

**Rationale**: This serializes competing writers for the same logical customer identity without prematurely encoding a permanent schema-level uniqueness rule. It also keeps duplicate detection compatible with stored formatted numbers through the shared normalization/matching behavior.

**Impact**: S4.2 request conversion and any later customer-creation path must participate in the same lock protocol. Introducing a different customer writer without this lock can reintroduce a race and is therefore not allowed unless a separately approved DB uniqueness strategy supersedes this decision.

## 2026-09-17 — S3.3 transaction-scoped audit for critical request mutations

**Context**: The shared `AuditService` is constructed with the top-level pooled DB handle and cannot participate in an existing Drizzle transaction. S3.3 requires request status changes and contact-attempt creation to be auditable in the same atomic business operation.

**Decision**: For S3.3 `request.status_changed` and `request.contact_attempt_logged`, perform the audit insert directly through the same Drizzle `tx` as the primary write, reusing the existing audit envelope and `hashAuditContext`. Do not call the long-lived `AuditService` instance for these transaction-critical success writes.

**Rationale**: Prevents the domain write and its audit event from committing independently. Real-PostgreSQL integration tests force audit FK failure and confirm the primary write rolls back.

**Impact**: Future critical business operations should use a transaction-aware audit path whenever audit persistence is part of the hard commit invariant. The existing `AuditService` remains unchanged for non-atomic/audit-after-commit use cases.

## 2026-09-17 — Agent workflow consolidation

**Context**: Three of four custom agents had no valid YAML frontmatter (tools, handoffs and read-only limits were not applied). Repository facts, task state and execution rules were split across `K'FIT AGENTS.md`, `K'FIT TASKS.md`, `TASKS.md` and five `active-session` files, with drift (wrong package paths, stale sprint/branch, stale handoff).

**Decision**: Adopt the portable Agent Kit (AGENTS.md, WORKFLOW.md, agents, skills unchanged across projects) and move all K'FIT facts into `PROJECT.md`; make `TASKS.md` the single active-state file with an explicit workflow state; repair agents with built-in tool sets and exact-name handoffs; split skills into core `SKILL.md` + `references/guide.md`; enforce terminal approvals via `.vscode/settings.json`; run full CI (typecheck, build, unit, schema drift, migrations, integration) on `main`, `sprint-*` and PRs.

**Rationale**: Agent guarantees must come from configuration, not prose. One state file prevents drift. CI must execute the concurrency test that S3.1 relies on.

**Impact**: Commits happen only after Fred's functional validation (WORKFLOW Gate 3). Chat/cloud runtimes never run commands; local agents run only allowlisted checks as supporting evidence.

## 2026-09-17 — Sprint 2.4 public landing page consumption validated

**Context**: S2.1/S2.2/S2.3 provided the public catalogue API, seeded service data and admin editing foundation. S2.4 consumed the existing public catalogue from the client landing page.

**Decision**: Close S2.4 as locally validated and fast-forward `main` to the validated branch head.

**Rationale**: Fred confirmed green client typecheck and production build, including shared build, TypeScript no-emit check and Vite build. The slice stayed client-only and did not alter server/schema behavior.

**Impact**: The public K'FIT landing page can now display catalogue services from `GET /catalogue/services`. Remaining Sprint 2 work can move to capacity/waitlist controls or later prospect request workflow.

## 2026-08-25 — Sprint branch transition after validated Sprint 2.1

**Context**: Sprint 2.1 was implemented and validated while still on the Sprint 1 auth branch due to handoff inertia.

**Decision**: Fast-forward `main` to validated head `3cf4138`, then create `sprint-2/catalogue-foundation` from `main` for all remaining Sprint 2 work.

**Rationale**: Each sprint should start from validated mainline state. Sprint 2 is related to Sprint 1 only by dependency, not by branch ownership.

**Impact**: Future Sprint 2 commits should target `sprint-2/catalogue-foundation`; `sprint-1/auth-foundation` remains historical for the auth closure.

## 2026-08-25 — Sprint 2.1 catalogue public API foundation validated

**Context**: Sprint 2 opened after sponsor validation was treated as confirmed. The first catalogue slice added shared contracts and a public read endpoint over existing Sprint 0 catalogue tables.

**Decision**: Close Sprint 2.1 as locally validated.

**Rationale**: Fred confirmed green shared/server builds, shared catalogue contract test, catalogue service test, catalogue Express route test and `db:check` after the Express router test fix in `c81c056`.

**Impact**: The catalogue foundation can now support seeded service data, admin editing and public landing page consumption in later Sprint 2 slices.

## 2026-08-25 — Sponsor validation treated as confirmed and Sprint 2 opened

**Context**: Sprint 1 auth foundation and the deferred password reset/recovery HTTP slice are locally validated and closed. Fred confirmed that Konny/sponsor validation can be considered done for execution.

**Decision**: Open Sprint 2 — catalogue/service offers foundation.

**Rationale**: M1 catalogue is the first business dependency after auth/security. The backend/public read foundation can be implemented safely before client UI, admin editing, prospects or waitlist behavior.

**Impact**: Sprint 2 starts with shared catalogue contracts and a public read endpoint over existing Sprint 0 catalogue tables. Production gates for legal validation and off-server backup remain active.

## 2026-08-25 — Password reset/recovery HTTP slice validated and closed

**Context**: Sprint 1 auth foundation was already closed. The deferred password reset/recovery HTTP flow reused validated OTP, password, session, trusted-device and audit foundations.

**Decision**: Close the deferred recovery HTTP slice as locally validated.

**Rationale**: Fred confirmed green server validation plus real SMTP/Mailpit HTTP/email preflight, including neutral unknown-account response, OTP non-disclosure over HTTP, email OTP verification, one-shot reset grant replay rejection and audit events.

**Impact**: This removes the deferred auth HTTP blocker before production. Sprint 2 still remains blocked by sponsor/Konny validation of V1 Core / V1.1 scope.

## 2026-08-25 — Password reset/recovery deferred from Sprint 1 closure

**Context**: Sprint 1 validated the auth/security foundation, including OTP, sessions, password hashing, CSRF, audit, client auth shell and Nginx cookie validation.

**Decision**: Defer full password reset/recovery HTTP flow to a later auth slice.

**Rationale**: The recovery flow requires email delivery UX, abuse/rate-limit policy, reset OTP lifecycle, password update, session invalidation, audit lifecycle and client screens. It should not bloat Sprint 1 after the foundation is green.

**Impact**: Sprint 1 can close as auth foundation validated. The deferred slice should reuse the validated OTP/password/session/audit services.

# Architectural Decisions Log

> Append-only — newest at top.

## 2026-08-25 — Dedicated application monorepo

**Context**: Existing `fredpatch/kfit_website` is a static WordPress/GitHub Pages export and cannot serve as the V1 platform base.

**Decision**: Build the new application in `fredpatch/kfit-monorepo` using npm workspaces with `packages/shared`, `packages/server`, and `packages/client`.

**Rationale**: Separates legacy public-site material from the transactional coaching platform and matches the validated project methodology.

**Impact**: All V1 Core implementation, deployment files, exploration cache, and technical documentation live in the new monorepo.

## 2026-08-25 — Relational system of record

**Context**: K'FIT requires transactional consistency across qualification, subscription state, appointments, consent, documents and finance.

**Decision**: PostgreSQL + Drizzle ORM is the authoritative persistence layer. Financial events, audits, submissions and accepted/versioned records use append-only or immutable-history patterns where required.

**Rationale**: Preserves ACID boundaries and supports the reusable patterns selected for K'FIT.

**Impact**: The conceptual model in `database-schema.md` is the basis for Drizzle schema generation and migration design.

## 2026-08-25 — Independent subscription and payment state

**Context**: A subscription may start before full payment and can remain operational while payment obligations are partial or overdue.

**Decision**: Subscription lifecycle state and payment/financial state remain independent axes.

**Rationale**: Prevents invalid coupling of coaching operations to accounting status.

**Impact**: Dashboard labels may derive a combined presentation state, but persistence and transition logic remain separate.

## 2026-08-25 — Reusable pattern reference is mandatory

**Context**: Prior projects contain validated implementation patterns that apply directly to K'FIT.

**Decision**: Before implementing a covered capability, consult `AI Project Kickoff — Reusable Implementation Patterns & Blueprints`, document adaptations, and verify the reused guarantees.

**Rationale**: Reuse tested invariants and transactional/security patterns without blindly copying domain-specific code.

**Impact**: Applies across auth, state transitions, atomic commands, secure sharing, dynamic forms, finance, documents, audit and scheduled jobs.

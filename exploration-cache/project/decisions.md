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

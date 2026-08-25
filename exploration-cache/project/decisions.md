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

# Session Context

> Date: 2026-09-17 | Sprint 2 closure

## Where we left off

Sprint 0, Sprint 1 auth, password recovery, and Sprint 2.1 through S2.6 are closed and locally validated.

## Sprint 2 result

The catalogue foundation is complete for the planned V1 Core boundary:

- public catalogue API;
- seeded services/variants/components/policies;
- admin catalogue editing foundation;
- public landing page catalogue consumption;
- authoritative server capacity/waitlist controls;
- authenticated admin capacity/waitlist UI;
- local PostgreSQL-backed API/bootstrap/login development path;
- local Vite proxy for public/auth/admin catalogue routes.

Fred confirmed the S2.6 client typecheck/build and complete manual admin/public smoke green on 2026-09-17.

## Repository state

- Sprint 2 branch: `sprint-2/catalogue-foundation`.
- S2.6 locally validated.
- Sprint 2 closure/state synchronization is being completed before `main` is fast-forwarded.
- User-pushed agent documentation files are retained; unrelated dependency-lock churn was neutralized before merge.

## Active constraints

- Do not run project commands from ChatGPT/Codex runtime.
- Legal validation is still required before production.
- A true off-server encrypted backup destination is still required before production.
- Native PostgreSQL remains on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

## Next boundary

Sprint 3 covers M2: demandes, prospects, qualification et liste d'attente.

First selected backlog task: **Public request form (name + phone, per service)**. It is not started yet. At Sprint 3 start, inspect the applicable reusable patterns, establish Sprint 3 execution state/branch, then proceed server-first before client integration.

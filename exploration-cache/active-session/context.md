# Session Context

> Date: 2026-09-17 | Slice: Sprint 2.5 — capacity/waitlist controls

## Where we left off

Sprint 0, Sprint 1 auth, password recovery, and Sprint 2.1 through S2.4 are closed and locally validated. Sprint 2 remains active on `sprint-2/catalogue-foundation`.

## Current Sprint 2 state

S2.5 capacity/waitlist controls are implemented and committed but are NOT locally validated yet.

Implementation head before project-state sync commits: `2f13fd66aa6e469b4f302a9591e9f030ce480eb6`.

Implemented scope:

- shared capacity route/input contract;
- server `updateAdminServiceCapacity` service logic;
- capacity/waitlist validation invariants;
- controller method;
- `PATCH /admin/catalogue/services/:serviceId/capacity`;
- admin session + CSRF + same-origin protection;
- service and Express tests;
- generic admin create/update hardened to enforce the same invariants.

## Validation pending

Fred must run the shared build/contract test, server build/service test/Express test, and `db:check`. No migration is expected.

## Active constraints

- Do not run project commands from ChatGPT/Codex runtime.
- Only mark S2.5 validated after Fred provides successful local output.
- Do not update `changelog.md` until S2.5 is locally validated.
- Legal validation is required before production.
- Keep native PostgreSQL on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

## Next boundary

Wait for Fred's S2.5 validation output. If green: close S2.5, update changelog + Notion, fast-forward `main`, then choose the next Sprint 2 slice.

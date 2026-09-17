# Session Context

> Date: 2026-09-17 | Slice: Sprint 2.5 — capacity/waitlist controls

## Where we left off

Sprint 0, Sprint 1 auth, password recovery, and Sprint 2.1 through S2.5 are closed and locally validated. Sprint 2 remains active on `sprint-2/catalogue-foundation` until the next slice is explicitly selected.

## S2.5 validated state

Fred confirmed the complete local gate green:

- shared build;
- shared catalogue contract test;
- server build;
- catalogue service tests;
- catalogue Express tests;
- `db:check`;
- no migration required.

Validated scope:

- shared capacity route/input contract;
- server `updateAdminServiceCapacity` service logic;
- capacity/waitlist validation invariants;
- controller method;
- `PATCH /admin/catalogue/services/:serviceId/capacity`;
- admin session + CSRF + same-origin protection;
- service and Express tests;
- generic admin create/update hardened to enforce the same invariants.

## Active constraints

- Do not run project commands from ChatGPT/Codex runtime.
- Only mark future slices validated after Fred provides successful local output.
- Legal validation is required before production.
- Keep native PostgreSQL on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

## Next boundary

S2.5 is closed. Select the next Sprint 2 slice before opening another implementation front. Candidate paths: admin UI for catalogue capacity/waitlist controls, or transition toward the prospect request/contact workflow if that is the higher business priority.

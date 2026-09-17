# Session Context

> Date: 2026-09-17 | Slice: Sprint 2.6 — admin UI capacity / waitlist controls

## Where we left off

Sprint 0, Sprint 1 auth, password recovery, and Sprint 2.1 through S2.5 are closed and locally validated. Sprint 2 remains active on `sprint-2/catalogue-foundation`.

## Current Sprint 2 state

S2.6 admin UI capacity/waitlist controls are implemented and statically inspected but are NOT locally validated yet.

Implementation head before project-state sync commits: `87010ce5d0ca44716fae71748b9ab289add11f2b`.

Implemented scope:

- client-only integration over validated S2.5 server capacity behavior;
- admin API client lists admin catalogue services and calls the validated capacity PATCH endpoint;
- existing cookie session and CSRF helper are reused;
- authenticated admin workspace mounts after existing bootstrap/login/session gates;
- French per-service controls for availability, capacity mode, capacity limit and waitlist enablement;
- archived services are read-only;
- React Query invalidates admin and public catalogue caches after successful saves;
- loading, empty, fetch-error, save-pending, success and failure feedback are present;
- existing public `/` catalogue route remains separate and unchanged in behavior;
- no server/schema/migration change.

Relevant commits:

- `e157728` admin capacity API client;
- `7126805` admin capacity controls UI;
- `7e4b441` authenticated workspace mount;
- `b146c05` workspace styles;
- `87010ce` save feedback hardening.

## Validation pending

Fred must run client typecheck/build and manually smoke the authenticated admin capacity flow plus public catalogue regression.

## Active constraints

- Do not run project commands from ChatGPT/Codex runtime.
- Only mark S2.6 validated after Fred provides successful local output and manual smoke confirmation.
- Do not update `changelog.md` for S2.6 until that validation is confirmed.
- Legal validation is required before production.
- Keep native PostgreSQL on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

## Next boundary

Stay on S2.6 until Fred validates the client build and the admin mutation flow locally. Do not start prospect/request workflow yet.

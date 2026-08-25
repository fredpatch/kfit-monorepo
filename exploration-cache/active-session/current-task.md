# Current Task

> Sprint: Sprint 1 | Date: 2026-08-25 | Status: In progress

## Task

Build K'FIT authentication, sessions, OTP and security foundation server-first on branch `sprint-1/auth-foundation`.

## Validated Sprint 1 slices

- Auth schema and pure primitives — locally validated.
- AuditService foundation — locally validated.
- Session/token service foundation — locally validated.
- OTP challenge service foundation — locally validated.
- Drizzle auth repository adapters — locally validated.
- Server auth controllers/routes/middleware foundation — locally validated.
- Auth module structure refactor — locally validated.

Structure refactor validation included:

- `git pull`
- `rm -rf packages/server/dist`
- `find packages/server/src/modules/auth -maxdepth 3 -type f | sort`
- `npm run typecheck`
- `npm run build --workspace @kfit/server`
- all moved auth tests under `dist/modules/auth/tests/*`
- `npm run db:check`

## Current implementation task

Add shared auth contracts.

## Acceptance criteria for current task

- [ ] Add shared auth DTO/error contracts for the validated server HTTP boundary.
- [ ] Align contracts with current route manifest and stable server error codes.
- [ ] Keep French UI wording out of transport errors unless they are user-facing.
- [ ] Export contracts from `@kfit/shared`.
- [ ] Add shared typecheck/test coverage if needed.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement client UI/session restore yet.

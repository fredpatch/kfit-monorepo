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
- Shared auth contracts — locally validated.

Shared contracts validation included:

- `git pull`
- `rm -rf packages/shared/dist packages/server/dist`
- `npm run typecheck`
- `npm run build --workspace @kfit/shared`
- `node --test packages/shared/dist/auth/contracts.test.js`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/tests/auth.http.test.js`
- `npm run db:check`

## Current implementation task

Locally validate Express app/router binding.

## Express binding implementation state

- Added Express dependency to `@kfit/server`.
- Added `createExpressAuthRouter` adapter for the validated auth route manifest.
- Added `createServerApp` composition factory with JSON parsing, health route and auth router mount.
- Added index exports for app/router factories.
- Added focused Express HTTP tests using Node's built-in test runner and fetch.
- Kept concrete JWT/session resolution injectable for the next server-first slice.

## Acceptance criteria for current task

- [x] Inspect current server entrypoint/app shape before changing code.
- [x] Create or extend the concrete Express app composition point.
- [x] Mount auth routes using the validated auth route manifest/controller boundary.
- [x] Ensure cookie parsing, CSRF extraction and auth middleware assumptions are represented at app level.
- [x] Keep server-first tests focused on route/app binding; do not add client auth UI yet.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement login UI/session restore yet.

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

Repository adapter validation included:

- `git pull`
- `npm run typecheck`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/auth.repositories.integration.js`
- `npm run db:check`

Implemented repository files:

- `packages/server/src/modules/auth/auth.repositories.ts`
- `packages/server/src/modules/auth/auth.repositories.integration.ts`

## Current implementation task

Validate server auth controllers/routes/middleware foundation locally.

## Implemented for current task

- `packages/server/src/modules/auth/auth.http.types.ts`
- `packages/server/src/modules/auth/auth.cookies.ts`
- `packages/server/src/modules/auth/auth.middleware.ts`
- `packages/server/src/modules/auth/auth.controller.ts`
- `packages/server/src/modules/auth/auth.routes.ts`
- `packages/server/src/modules/auth/auth.http.test.ts`

## Acceptance criteria for current task

- [x] Existing server HTTP/app structure inspected; no Express app existed yet.
- [x] Added minimal auth route/controller boundary without client work.
- [x] Added middleware foundation for protected-route session checks.
- [x] Added cookie/CSRF contract scaffolding aligned with Cookie JWT Authentication blueprint.
- [x] Added route manifest for future Express binding.
- [x] Added focused tests for controller/middleware behavior without requiring browser/client.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Keep this server-side; do not implement frontend/client session UI yet.
- Do not implement unrelated business modules.

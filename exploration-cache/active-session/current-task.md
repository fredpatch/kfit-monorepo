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
- Express app/router binding — locally validated.

Express binding validation included:

- `git pull`
- `npm install`
- `rm -rf packages/server/dist`
- `npm run typecheck`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/tests/auth.express.test.js`
- `node --test packages/server/dist/modules/auth/tests/auth.http.test.js`
- `npm run db:check`

## Current implementation task

Locally validate JWT/cookie session resolution plus login/logout/refresh route behavior.

## JWT/cookie route implementation state

- Added HS256 access JWT signing/verification helpers.
- Added access-token cookie session resolver backed by server-side session state.
- Added AuthRouteService for login, refresh rotation and logout cookie clearing.
- Added auth user repository and session lookup/revoke repository methods.
- Expanded auth route manifest with login, refresh and logout.
- Expanded controller/Express adapter to dispatch login, refresh and logout.
- Expanded shared auth contracts with login/refresh/logout DTOs and errors.
- Added focused tests for JWT crypto/session resolution, route service and Express behavior.
- Kept password verification injectable; bootstrap/password hash policy remains a separate server-first slice.

## Acceptance criteria for current task

- [x] Inspect current auth services, repositories, schema and Express binding before changing code.
- [x] Define the minimal login/logout/refresh/session route contracts for this slice.
- [x] Resolve sessions from secure HttpOnly auth cookies at the Express boundary.
- [x] Keep refresh-token storage hash-only and rotate refresh tokens through the validated SessionService.
- [x] Apply CSRF requirements to mutating cookie-auth routes.
- [x] Add server-first tests for login/logout/refresh/session behavior.
- [x] Do not implement client auth UI/session restore yet.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement unrelated features.

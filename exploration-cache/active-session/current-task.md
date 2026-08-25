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

Implement real JWT/cookie session resolution plus login/logout/refresh route behavior.

## Acceptance criteria for current task

- [ ] Inspect current auth services, repositories, schema and Express binding before changing code.
- [ ] Define the minimal login/logout/refresh/session route contracts for this slice.
- [ ] Resolve sessions from secure HttpOnly auth cookies at the Express boundary.
- [ ] Keep refresh-token storage hash-only and rotate refresh tokens through the validated SessionService.
- [ ] Apply CSRF requirements to mutating cookie-auth routes.
- [ ] Add server-first tests for login/logout/refresh/session behavior.
- [ ] Do not implement client auth UI/session restore yet.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement unrelated features.

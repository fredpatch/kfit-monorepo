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
- JWT/cookie session resolution plus login/logout/refresh route behavior — locally validated.

JWT/cookie route validation included:

- `git pull`
- `rm -rf packages/server/dist packages/shared/dist`
- `npm run typecheck`
- `npm run build --workspace @kfit/shared`
- `node --test packages/shared/dist/auth/contracts.test.js`
- `npm run build --workspace @kfit/server`
- auth foundation/session/auth-route/access-token-session/http/express/repository tests
- `npm run db:check`

## Current implementation task

Implement bootstrap/password hashing policy before client auth.

## Acceptance criteria for current task

- [ ] Inspect current user schema, auth route service, Notion Sprint 1 contract and pattern decisions before changing code.
- [ ] Define minimal password hashing/verifier policy for V1.
- [ ] Define one-time bootstrap contract without default credentials.
- [ ] Implement server-first bootstrap/password services, controllers/routes if in scope.
- [ ] Keep login route using the validated injectable password verifier boundary.
- [ ] Add focused tests for password digesting/verification and bootstrap once-only behavior.
- [ ] Do not implement client auth UI/session restore yet.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement unrelated features.

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
- Bootstrap/password hashing policy — locally validated.

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

Prepare the client auth foundation: session restoration and login flows.

## Bootstrap/password validation

The project owner confirmed the bootstrap/password hashing policy is locally validated after the typed `scrypt` wrapper fix.

Validated command set:

- `git pull`
- `rm -rf packages/server/dist packages/shared/dist`
- `npm run typecheck`
- `npm run build --workspace @kfit/shared`
- `node --test packages/shared/dist/auth/contracts.test.js`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/tests/password.service.test.js`
- `node --test packages/server/dist/modules/auth/tests/bootstrap.service.test.js`
- `node --test packages/server/dist/modules/auth/tests/auth.http.test.js`
- `node --test packages/server/dist/modules/auth/tests/auth.express.test.js`
- `node --test packages/server/dist/modules/auth/tests/auth-route.service.test.js`
- `node --test packages/server/dist/modules/auth/tests/auth.repositories.integration.js`
- `npm run db:check`

No schema migration was required.

## Acceptance criteria for current task

- [ ] Inspect client package structure, app entry points, existing HTTP/API utilities and shared auth contracts before changing code.
- [ ] Define the minimal client auth boundary for V1: bootstrap status, login, current session, refresh, logout and CSRF header forwarding.
- [ ] Implement session restoration and login/logout flows in French UI, i18n-ready.
- [ ] Keep authorization server-authoritative; the client only adapts UX to current session state.
- [ ] Add focused client tests where the existing client stack supports them.
- [ ] Do not implement unrelated feature screens or move to staging cookie validation until this slice is locally validated.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement unrelated features.

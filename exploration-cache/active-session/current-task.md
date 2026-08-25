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
- Client auth foundation/session restore/login flows — locally validated.

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

Prepare staging-style cookies/CSRF/session validation before Sprint 1 closure.

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

## Client auth foundation validation

The project owner confirmed the client auth foundation is locally validated and the Vite app launches.

Validated command set:

- `git pull`
- `npm install`
- `rm -rf packages/client/dist packages/shared/dist packages/server/dist`
- `npm run build --workspace @kfit/shared`
- `npm run typecheck`
- `node --test packages/shared/dist/auth/contracts.test.js`
- `npm run build --workspace @kfit/client`
- `npm run build --workspace @kfit/server`
- `npm run db:check`
- `npm run dev --workspace @kfit/client`

No schema migration was required.

## Acceptance criteria for current task

- [x] Client auth foundation was locally validated by the project owner.
- [ ] Inspect Docker/Nginx/staging compose configuration and auth cookie settings before changing code.
- [ ] Define the staging-style validation path for cookies, credentials, CSRF and session restore.
- [ ] Implement only the minimal configuration/test harness changes needed for staging-style auth validation.
- [ ] Provide exact local Windows/Git Bash commands.
- [ ] Do not close Sprint 1 until the project owner confirms local staging-style validation is green.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement unrelated features.

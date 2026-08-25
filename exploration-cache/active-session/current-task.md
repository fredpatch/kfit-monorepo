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
- Staging-style cookies/CSRF/session behavior behind Nginx — locally validated.

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

Perform Sprint 1 closure review and decide the next sprint boundary.

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

## Staging-style auth validation

The project owner confirmed staging-style auth validation is locally green.

Validated command/output included:

- `docker compose -f docker-compose.staging.yml exec auth_proxy getent hosts host.docker.internal`
- `docker compose -f docker-compose.staging.yml exec auth_proxy wget -S -O- http://host.docker.internal:3001/health`
- `curl -i http://127.0.0.1:18080/health` returned `Server: nginx/1.27.5` and `{"status":"ok"}`
- `AUTH_STAGING_PROXY_URL=http://127.0.0.1:18080 npm run preflight:auth-staging`

Preflight confirmed:

- staging proxy health route reachable
- auth cookies keep `HttpOnly`/`Secure`/`SameSite`/`Path` attributes through Nginx
- readable CSRF cookie is forwarded as `x-csrf-token`
- refresh/logout reject missing CSRF and accept valid double-submit CSRF
- session restore works through the staging-style Nginx path

## Acceptance criteria for current task

- [x] Project owner locally validated the staging-style auth preflight.
- [ ] Reconcile Sprint 1 checklist, known gaps and Notion/GitHub state before closing the sprint.
- [ ] Confirm whether password reset/recovery HTTP flow is Sprint 1 closure scope or a later slice.
- [ ] Do not begin Sprint 2 implementation until Sprint 1 closure review is complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement unrelated features.

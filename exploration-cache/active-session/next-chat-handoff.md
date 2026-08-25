# K'FIT — Next Chat Handoff

## Current objective

Sprint 1 — Authentication, sessions, OTP & security foundation is complete and locally validated.

Next chat should **not restart Sprint 0/Sprint 1 planning**. It should begin from Sprint 1 closure state and choose the next boundary based on sponsor validation status.

## Execution rule still active

- Do **not** run npm, Docker, PostgreSQL, git clone/pull, migrations, pre-flight scripts, tests or project commands in the assistant runtime.
- Use connected GitHub and Notion for inspection, implementation and commits.
- When execution is required, provide exact Windows/Git Bash commands.
- Fred runs commands locally and returns output.
- Only mark something validated after Fred confirms successful local execution.
- Work one task at a time.

## Repository / branch

- Repository: `fredpatch/kfit-monorepo`
- Current branch: `sprint-1/auth-foundation`

## Sprint 1 status

Sprint 1 auth foundation is closed as locally validated.

Validated slices:

- Auth schema adaptation and pure primitives.
- Auth environment config.
- OTP crypto helpers.
- Session/fresh-OTP policy helpers.
- AuditService foundation.
- Session/token service.
- OTP challenge service.
- Drizzle auth repository adapters.
- Server auth controllers/routes/middleware foundation.
- Auth module folder structure refactor:
  - `config/`
  - `controllers/`
  - `middleware/`
  - `repositories/`
  - `routes/`
  - `services/`
  - `types/`
  - `tests/`
- Shared auth contracts in `@kfit/shared`.
- Express app/router binding.
- JWT/cookie session resolution plus login/logout/refresh route behavior.
- Bootstrap/password hashing policy.
- Client auth foundation:
  - Vite/React shell
  - TanStack Query auth state
  - auth API adapter
  - CSRF forwarding
  - French bootstrap/login/session UI
- Staging-style Nginx cookies/CSRF/session validation.

## Key validated local commands/output

Fred confirmed green:

```bash
npm run typecheck
npm run build --workspace @kfit/shared
npm run build --workspace @kfit/client
npm run build --workspace @kfit/server
npm run db:check
node --test packages/shared/dist/auth/contracts.test.js
```

Staging-style validation:

```bash
docker compose -f docker-compose.staging.yml exec auth_proxy getent hosts host.docker.internal
docker compose -f docker-compose.staging.yml exec auth_proxy wget -S -O- http://host.docker.internal:3001/health
curl -i http://127.0.0.1:18080/health
AUTH_STAGING_PROXY_URL=http://127.0.0.1:18080 npm run preflight:auth-staging
```

Confirmed output:

```text
✓ staging proxy health route reachable
✓ auth cookies keep HttpOnly/Secure/SameSite/Path attributes through Nginx
✓ readable CSRF cookie is forwarded as x-csrf-token
✓ refresh/logout reject missing CSRF and accept valid double-submit CSRF
✓ session restore works through the staging-style Nginx path
```

## Important decisions

- Password reset/recovery HTTP flow is intentionally deferred from Sprint 1 closure.
- The validated OTP/password/session/audit foundations are ready to support it later.
- Do not start scope-dependent business modules until sponsor validation confirms the V1 Core/V1.1 split with Konny.
- If sponsor validation is not available, the safest next technical task is the deferred password reset/recovery auth slice.
- If sponsor validation is available, begin Sprint 2 — catalogue/service offer foundation.

## Current blockers

- Sponsor validation of consolidated V1 Core / V1.1 scope and business rules with Konny.
- Legal validation before production.
- Real off-server backup destination before production.

## Files to inspect first next chat

1. `exploration-cache/active-session/context.md`
2. `exploration-cache/active-session/current-task.md`
3. `exploration-cache/active-session/next-actions.md`
4. `exploration-cache/active-session/blockers.md`
5. `TASKS.md`
6. `exploration-cache/project/decisions.md`
7. `docs/sprint-1-auth-adaptation-contract.md`
8. `docs/sprint-1-auth-staging-validation.md`
9. `packages/shared/src/auth/contracts.ts`
10. `packages/server/src/modules/auth/README.md`
11. `packages/server/src/modules/auth/routes/auth.routes.ts`
12. `packages/client/src/auth/api/auth-api.ts`
13. `packages/client/src/auth/state/auth-context.tsx`
14. `docker-compose.staging.yml`
15. `ops/nginx/staging-auth.conf`

## Recommended next task

Ask Fred one direct question:

**Has Konny/sponsor validation confirmed the V1 Core / V1.1 split and business rules?**

- If yes: start Sprint 2 — catalogue/service offer foundation.
- If no: implement the deferred auth slice — password reset/recovery HTTP flow.

## Ready-to-paste continuation prompt

```text
Continue the K'FIT project from Sprint 1 closure.

Sprint 1 auth foundation is complete and locally validated. Do not restart Sprint 0 or Sprint 1 planning.

First inspect:
- exploration-cache/active-session/context.md
- exploration-cache/active-session/current-task.md
- exploration-cache/active-session/next-actions.md
- exploration-cache/active-session/blockers.md
- TASKS.md
- exploration-cache/project/decisions.md
- docs/sprint-1-auth-adaptation-contract.md
- docs/sprint-1-auth-staging-validation.md
- packages/shared/src/auth/contracts.ts
- packages/server/src/modules/auth/README.md
- packages/server/src/modules/auth/routes/auth.routes.ts
- packages/client/src/auth/api/auth-api.ts
- packages/client/src/auth/state/auth-context.tsx
- docker-compose.staging.yml
- ops/nginx/staging-auth.conf

Respect the execution rule:
- Do not run npm, Docker, PostgreSQL, migrations, tests, preflight scripts, git pull/clone, or project commands in your runtime.
- Use GitHub and Notion for inspection/implementation/commits.
- Give exact Windows/Git Bash commands for local validation.
- Only mark validation after Fred confirms local command success.
- Work one task at a time.

Next decision:
Ask whether sponsor validation for V1 Core / V1.1 is confirmed.
If yes, start Sprint 2 catalogue/service offer foundation.
If no, implement the deferred password reset/recovery HTTP flow as a later auth slice.

Do not implement unrelated features.
```

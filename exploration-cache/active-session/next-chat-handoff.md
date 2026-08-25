# K'FIT — Next Chat Handoff

## Current objective

Sprint 1 — Authentication, sessions, OTP & security foundation is complete and locally validated.

The deferred post-closure auth slice — password reset/recovery HTTP flow — is also complete and locally validated, including the real SMTP/Mailpit HTTP/email preflight.

Next chat should **not restart Sprint 0/Sprint 1 planning**. It should begin from the validated closure state and choose the next boundary based on sponsor validation status.

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

## Post-closure auth recovery slice status

Password reset/recovery HTTP flow is closed as locally validated.

Validated coverage:

- Neutral account-enumeration-safe recovery request.
- Real OTP email delivery via SMTP/Mailpit.
- HTTP responses never expose OTP.
- French recovery email subject and six-digit code.
- Emailed OTP verification through HTTP.
- Short-lived reset grant.
- One-shot password reset with replay rejection.
- Atomic password update plus session and trusted-device revocation.
- Delivery and completion audit events.
- Drizzle schema check; no migration required.

Fred confirmed green:

```bash
npm run preflight:auth-recovery
```

```text
✓ unknown recovery request returns the neutral accepted response
✓ recovery request sends a real OTP email through SMTP to Mailpit
✓ HTTP responses never expose the OTP
✓ Mailpit message contains the expected French subject and six-digit code
✓ emailed OTP produces a short-lived reset grant through HTTP
✓ password reset succeeds once and replay is rejected
✓ recovery delivery and completion audit events are recorded
```

## Important decisions

- Do not start scope-dependent business modules until sponsor validation confirms the V1 Core/V1.1 split with Konny.
- If sponsor validation is available, begin Sprint 2 — catalogue/service offer foundation.
- If sponsor validation is still unavailable, explicitly choose the next pre-production/non-scope-dependent slice instead of opening Sprint 2 by default.

## Current blockers

- Sponsor validation of consolidated V1 Core / V1.1 scope and business rules with Konny.
- Legal validation before production.
- Real off-server backup destination before production.

## Files to inspect first next chat

1. `exploration-cache/active-session/context.md`
2. `exploration-cache/active-session/current-task.md`
3. `exploration-cache/active-session/next-actions.md`
4. `exploration-cache/active-session/blockers.md`
5. `exploration-cache/active-session/next-chat-handoff.md`
6. `TASKS.md`
7. `changelog.md`
8. `exploration-cache/project/decisions.md`
9. Notion page: K'FIT — Tableau de Bord Projet
10. Notion page: K'FIT - Sprint 1 · Authentification, sessions, OTP et sécurité

## Recommended next task

Ask Fred one direct question:

**Has Konny/sponsor validation confirmed the V1 Core / V1.1 split and business rules?**

- If yes: start Sprint 2 — catalogue/service offer foundation.
- If no: keep Sprint 2 blocked and select the next non-scope-dependent pre-production slice explicitly.

## Ready-to-paste continuation prompt

```text
Continue the K'FIT project from Sprint 1 auth foundation closure plus validated deferred auth recovery HTTP slice.

Do not rerun feasibility or Sprint 0/Sprint 1 planning. Sprint 1 auth foundation is locally validated and closed. Password reset/recovery HTTP flow is also locally validated and closed, including Mailpit SMTP + HTTP preflight.

First inspect:
- exploration-cache/active-session/context.md
- exploration-cache/active-session/current-task.md
- exploration-cache/active-session/next-actions.md
- exploration-cache/active-session/blockers.md
- exploration-cache/active-session/next-chat-handoff.md
- TASKS.md
- changelog.md
- exploration-cache/project/decisions.md
- Notion page: K'FIT — Tableau de Bord Projet
- Notion page: K'FIT - Sprint 1 · Authentification, sessions, OTP et sécurité

Respect the execution rule:
- Do not run npm, Docker, PostgreSQL, migrations, tests, preflight scripts, git pull/clone, or project commands in your runtime.
- Use GitHub and Notion for inspection/implementation/commits.
- Give exact Windows/Git Bash commands for local validation.
- Only mark validation after Fred confirms local command success.
- Work one task at a time.

Next decision:
Ask whether sponsor validation for V1 Core / V1.1 is confirmed.
If yes, start Sprint 2 catalogue/service offer foundation.
If no, keep Sprint 2 blocked and choose the next non-scope-dependent pre-production slice explicitly.

Do not implement unrelated features.
```

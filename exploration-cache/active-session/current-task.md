# Current Task

> Sprint: Sprint 1 | Date: 2026-08-25 | Status: In progress

## Task

Build K'FIT authentication, sessions, OTP and security foundation server-first on branch `sprint-1/auth-foundation`.

## Validated Sprint 1 slices

### Auth schema and pure primitives

Validated by project-owner local Windows/Git Bash execution:

- `npm run typecheck`
- `npm run db:check`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/auth-foundation.test.js`
- `npm run db:migrate` including repeat/no-op behavior
- PostgreSQL `\d` inspection for `auth_sessions`, `otp_challenges`, `trusted_devices`, `audit_events`

### AuditService foundation

Validated by project-owner confirmation after running:

- `git pull`
- `npm run typecheck`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/auth-foundation.test.js`
- `node --test packages/server/dist/modules/auth/audit.service.test.js`
- `npm run db:check`

### Session/token service foundation

Validated by project-owner confirmation after running:

- `git pull`
- `npm run typecheck`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/session.service.test.js`
- `npm run db:check`

Implemented files:

- `packages/server/src/modules/auth/session.service.ts`
- `packages/server/src/modules/auth/session.service.test.ts`
- `AUTH_REFRESH_TOKEN_PEPPER` documented in `.env.example`
- `loadAuthConfig` exposes `refreshTokenPepper` with fallback to `AUTH_OTP_PEPPER`

## Current implementation task

Validate OTP challenge service foundation locally.

## Implemented for current task

- `packages/server/src/modules/auth/otp-challenge.service.ts`
- `packages/server/src/modules/auth/otp-challenge.service.test.ts`

## Acceptance criteria for current task

- [x] OTP service can create hash-only OTP challenges.
- [x] Existing active challenges for the same user/session/purpose are superseded before resend.
- [x] Verification rejects expired, consumed, superseded or max-attempt challenges.
- [x] Verification increments attempts on wrong code.
- [x] Verification consumes challenge on valid code.
- [x] Fresh-OTP use case supports `sensitive_action` and session binding.
- [x] AuditService is called for OTP issue/verify/block events.
- [x] Unit tests are added.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement controllers/routes/client until service-level validation passes.
- Do not implement unrelated business modules.

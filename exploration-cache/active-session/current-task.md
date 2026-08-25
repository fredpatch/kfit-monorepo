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

Implemented files:

- `packages/server/src/modules/auth/audit.service.ts`
- `packages/server/src/modules/auth/audit.service.test.ts`
- `AUTH_AUDIT_HASH_PEPPER` documented in `.env.example`
- `loadAuthConfig` exposes `auditHashPepper` with fallback to `AUTH_OTP_PEPPER`

## Current implementation task

Implement session/token service foundation.

## Acceptance criteria for current task

- [ ] Session service can create session records with inactivity and absolute expiry.
- [ ] Refresh token digests are stored hash-only.
- [ ] Refresh rotation increments `rotationCounter` and replaces the stored refresh hash.
- [ ] Reuse detection can mark a session/token family compromised.
- [ ] Session validation uses existing inactivity/absolute/revoked/compromised policy.
- [ ] AuditService is called for session lifecycle security events.
- [ ] Unit tests are added.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement controllers/routes/client until service-level validation passes.
- Do not implement unrelated business modules.

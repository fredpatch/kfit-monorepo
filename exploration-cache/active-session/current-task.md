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

Validated locally by project owner.

### Session/token service foundation

Validated locally by project owner.

### OTP challenge service foundation

Validated locally by project owner after running:

- `git pull`
- `npm run typecheck`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/auth-foundation.test.js`
- `node --test packages/server/dist/modules/auth/audit.service.test.js`
- `node --test packages/server/dist/modules/auth/session.service.test.js`
- `node --test packages/server/dist/modules/auth/otp-challenge.service.test.js`
- `npm run db:check`

Implemented files:

- `packages/server/src/modules/auth/otp-challenge.service.ts`
- `packages/server/src/modules/auth/otp-challenge.service.test.ts`

## Current implementation task

Implement Drizzle repository adapters for the validated auth services.

## Acceptance criteria for current task

- [ ] Audit repository/service adapter can persist real audit events.
- [ ] Session repository adapter can create, find, rotate and compromise sessions.
- [ ] OTP repository adapter can supersede, create, find latest, increment attempts and consume challenges.
- [ ] Repository adapters use existing Drizzle schema without new migration unless a real schema gap appears.
- [ ] Repository tests or type-level integration tests are added without requiring uncontrolled local execution from ChatGPT/Codex.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement controllers/routes/client until repository adapter validation passes.
- Do not implement unrelated business modules.

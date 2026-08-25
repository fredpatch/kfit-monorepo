# Current Task

> Sprint: Sprint 1 | Date: 2026-08-25 | Status: In progress

## Task

Build K'FIT authentication, sessions, OTP and security foundation server-first on branch `sprint-1/auth-foundation`.

## Validated slice

The Sprint 1 schema/primitives slice is validated from the project owner's local Windows/Git Bash execution.

Validated commands/output:

- `npm run typecheck` — passed for client, server and shared workspaces.
- `npm run db:check` — Drizzle check returned "Everything's fine".
- `npm run build --workspace @kfit/server` — passed.
- `node --test packages/server/dist/modules/auth/auth-foundation.test.js` — 4 tests passed.
- `npm run db:migrate` — migration applied and repeat run completed without pending migration errors.
- PostgreSQL inspection confirmed expected columns/indexes/FKs in:
  - `auth_sessions`
  - `otp_challenges`
  - `trusted_devices`
  - `audit_events`

## Current implementation task

Implement AuditService foundation.

## Acceptance criteria for current task

- [ ] Audit service can write stable auth/security audit events.
- [ ] Actor, entity, result, request ID and metadata are stored consistently.
- [ ] IP and user-agent values are hashed before storage.
- [ ] Service API is reusable by auth/session/OTP services.
- [ ] Unit/integration tests are added.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.
- Do not implement controllers/routes/client until service-level validation passes.
- Do not implement unrelated business modules.

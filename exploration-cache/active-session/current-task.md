# Current Task

> Sprint: Sprint 1 | Date: 2026-08-25 | Status: In progress

## Task

Fix the auth module structure gap before continuing implementation.

## Validated Sprint 1 slices

- Auth schema and pure primitives — locally validated.
- AuditService foundation — locally validated.
- Session/token service foundation — locally validated.
- OTP challenge service foundation — locally validated.
- Drizzle auth repository adapters — locally validated.
- Server auth controllers/routes/middleware foundation — locally validated.

## Current implementation task

Validate auth module folder refactor locally.

## Implemented for current task

The auth module was moved from flat files under `packages/server/src/modules/auth` to responsibility folders:

- `config/`
- `controllers/`
- `middleware/`
- `repositories/`
- `routes/`
- `services/`
- `services/crypto/`
- `services/policies/`
- `types/`
- `tests/`

A module README was added:

- `packages/server/src/modules/auth/README.md`

## Acceptance criteria for current task

- [x] Flat auth implementation files moved into dedicated folders.
- [x] Imports updated to match the new structure.
- [x] Old flat files removed to avoid duplicate modules/tests.
- [x] Module README documents folder responsibilities.
- [ ] The project owner validates locally before the task is marked complete.

## Constraints

- Do not continue to shared contracts until this refactor is locally validated.
- Do not run npm, Docker, PostgreSQL, migrations, pre-flight scripts or tests from ChatGPT/Codex runtime.
- Provide exact Windows/Git Bash commands when execution is needed.

# K'FIT — Executable Tasks

> Source of truth: Notion backlog. This file is the local executable summary.

## Sprint 0 — Initialisation

- [x] Map V1 Core capabilities to reusable patterns/blueprints
- [x] Create dedicated npm-workspaces monorepo
- [x] Initialize shared/server/client TypeScript boundaries
- [x] Initialize exploration-cache project memory
- [x] Model complete V1 Core relational domain and invariants
- [x] Implement Drizzle PostgreSQL schema
- [x] Validate initial migration on PostgreSQL
- [x] Validate Docker PostgreSQL development environment
- [x] Validate SMTP/Mailpit and OTP pre-flight
- [x] Validate private files, signature rules, size limit and ClamAV
- [x] Validate Puppeteer PDF generation
- [x] Validate scheduled jobs, locking, idempotency and retry logging
- [x] Validate AES-256-GCM DB + private-file backup and isolated restore
- [x] Separate native PostgreSQL host port 5432 from Docker PostgreSQL host port 5433
- [x] Document Sprint 0 technical gotchas and closure state

## Sprint 0 closure blockers

- [x] Reusable Implementation Patterns & Blueprints source recorded: Notion project/pattern pages, not a local Markdown folder for this Sprint 1 continuation.
- [ ] Obtain sponsor validation of the consolidated V1 Core / V1.1 scope and rules with Konny.

## Sprint 1 — Authentication, sessions, OTP and security

Execution rule: implementation happens on `sprint-1/auth-foundation`. Local command execution is performed by the project owner; ChatGPT/Codex updates GitHub/Notion and only marks validation after pasted local output confirms success.

### Validated slices

- [x] Inspect/adapt `Administrative Foundation`, `Cookie JWT Authentication`, OTP/fresh-OTP, CSRF and audit patterns from Notion.
- [x] Finalize K'FIT auth/session invariants and API baseline in `docs/sprint-1-auth-adaptation-contract.md`.
- [x] Implement and locally validate auth schema adaptation and pure auth primitives:
  - trusted-device/session/OTP/audit schema gaps
  - auth environment config
  - OTP crypto helpers
  - session/fresh-OTP policy helpers
  - Node test coverage for pure primitives
- [x] Implement and locally validate AuditService foundation.
- [x] Implement and locally validate session/token service.
- [x] Implement and locally validate OTP challenge service.
- [x] Implement and locally validate Drizzle auth repository adapters.
- [x] Implement and locally validate server auth controllers/routes/middleware foundation.
- [x] Refactor auth module into responsibility folders and locally validate the structure.
- [x] Implement and locally validate shared auth contracts.
- [x] Implement and locally validate Express app/router binding.

### Current execution order

1. [x] Implement AuditService foundation.
2. [x] Locally validate AuditService event creation and metadata hashing tests.
3. [x] Implement session/token service.
4. [x] Locally validate session/token service tests.
5. [x] Implement OTP challenge service.
6. [x] Locally validate OTP challenge service tests.
7. [x] Implement auth Drizzle repository adapters.
8. [x] Locally validate auth repository adapter integration.
9. [x] Implement server auth controllers/routes/middleware foundation.
10. [x] Locally validate server auth HTTP foundation tests.
11. [x] Refactor auth module into responsibility folders.
12. [x] Locally validate auth module structure refactor.
13. [x] Add shared auth contracts.
14. [x] Locally validate shared auth contracts.
15. [x] Bind the server HTTP foundation to the concrete app/router after shared-contract validation.
16. [x] Locally validate Express app/router binding.
17. [ ] Implement real JWT/cookie session resolution plus login/logout/refresh route behavior.
18. [ ] Add client session restoration/login flows only after server behavior is tested.
19. [ ] Validate cookies/CSRF/session behavior behind the staging-style Nginx path before Sprint 1 closure.

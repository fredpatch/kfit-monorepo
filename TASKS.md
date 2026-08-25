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

### Current execution order

1. Implement AuditService foundation.
2. Add local tests for audit event creation and metadata hashing.
3. Implement session/token service only after AuditService validation.
4. Implement controllers/routes and middleware after service validation.
5. Add shared auth contracts/types.
6. Add client session restoration/login flows only after server behavior is tested.
7. Validate cookies/CSRF/session behavior behind the staging-style Nginx path before Sprint 1 closure.

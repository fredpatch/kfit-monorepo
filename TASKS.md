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
- [x] Sponsor validation of the consolidated V1 Core / V1.1 scope and rules with Konny treated as confirmed for execution.

## Sprint 1 — Authentication, sessions, OTP and security

Execution rule: implementation happened on `sprint-1/auth-foundation`. Local command execution is performed by the project owner; ChatGPT/Codex updates GitHub/Notion and only marks validation after pasted local output confirms success.

### Validated slices

- [x] Inspect/adapt `Administrative Foundation`, `Cookie JWT Authentication`, OTP/fresh-OTP, CSRF and audit patterns from Notion.
- [x] Finalize K'FIT auth/session invariants and API baseline in `docs/sprint-1-auth-adaptation-contract.md`.
- [x] Implement and locally validate auth schema adaptation and pure auth primitives.
- [x] Implement and locally validate AuditService foundation.
- [x] Implement and locally validate session/token service.
- [x] Implement and locally validate OTP challenge service.
- [x] Implement and locally validate Drizzle auth repository adapters.
- [x] Implement and locally validate server auth controllers/routes/middleware foundation.
- [x] Refactor auth module into responsibility folders and locally validate the structure.
- [x] Implement and locally validate shared auth contracts.
- [x] Implement and locally validate Express app/router binding.
- [x] Implement and locally validate JWT/cookie session resolution plus login/logout/refresh route behavior.
- [x] Implement and locally validate bootstrap/password hashing policy.
- [x] Implement and locally validate client session restoration/login flows.
- [x] Implement and locally validate staging-style cookies/CSRF/session behavior behind Nginx.
- [x] Implement and locally validate deferred password reset/recovery HTTP flow.

## Sprint 2 — Catalogue, service offers and public availability

Execution rule: implementation continues on `sprint-2/catalogue-foundation`. Sprint 1/auth and validated Sprint 2 checkpoints are fast-forwarded to `main` after local validation. Local command execution is performed by Fred; ChatGPT/Codex updates GitHub/Notion and only marks validation after pasted local output confirms success.

### Current execution order

1. [x] Implement and locally validate catalogue public API foundation: shared contracts, service/repository/controller, Express route and tests.
2. [x] Implement and locally validate initial services/variants/components/policies seed and DB-backed seed preflight.
3. [x] Implement and locally validate admin catalogue editing foundation after seed/public-read behavior is validated.
4. [ ] Implement public landing page catalogue consumption after backend behavior is validated. Status: implemented, awaiting local client validation.

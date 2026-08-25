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

- [ ] Record the local filesystem path of the Reusable Implementation Patterns & Blueprints Markdown library before Sprint 1 implementation.
- [ ] Obtain sponsor validation of the consolidated V1 Core / V1.1 scope and rules with Konny.

## Sprint 1 — Authentication, sessions, OTP and security

Do not begin implementation until Sprint 0 is formally closed in Notion and the local reusable-pattern library path is available to the development agent.

Planned first execution order:

1. Review/adapt `Administrative Foundation`, `Cookie JWT Authentication`, `OTP Account Activation`, and fresh-OTP patterns.
2. Finalize auth/session configuration and environment contract.
3. Implement server authentication services first.
4. Implement controllers/routes and middleware after services.
5. Add shared auth contracts/types.
6. Add client session restoration/login flows only after server behavior is tested.
7. Validate cookies/CSRF/session behavior behind the staging-style Nginx path before Sprint 1 closure.

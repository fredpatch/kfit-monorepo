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
- [x] Implement and locally validate JWT/cookie session resolution plus login/logout/refresh route behavior.
- [x] Implement and locally validate bootstrap/password hashing policy.
- [x] Implement and locally validate client session restoration/login flows.
- [x] Implement and locally validate staging-style cookies/CSRF/session behavior behind Nginx.

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
17. [x] Implement real JWT/cookie session resolution plus login/logout/refresh route behavior.
18. [x] Locally validate JWT/cookie session resolution plus login/logout/refresh route behavior.
19. [x] Implement bootstrap/password hashing policy before client auth.
20. [x] Locally validate bootstrap/password hashing policy.
21. [x] Implement client session restoration/login flows after server behavior was tested.
22. [x] Locally validate client session restoration/login flows.
23. [x] Implement staging-style Nginx auth proxy validation harness.
24. [x] Locally validate cookies/CSRF/session behavior behind the staging-style Nginx path before Sprint 1 closure.
25. [x] Perform Sprint 1 closure review and decide next sprint boundary.
26. [x] Later auth slice: password reset/recovery HTTP flow locally validated end-to-end, including server tests, PostgreSQL hard commit, session/trusted-device revocation, `db:check`, and real SMTP/Mailpit HTTP/email preflight.
27. [x] Start Sprint 2 after sponsor validation is treated as confirmed for execution.

## Sprint 2 — Catalogue, service offers and public availability

Execution rule: implementation continues on `sprint-1/auth-foundation` until a branch transition is explicitly decided. Local command execution is performed by Fred; ChatGPT/Codex updates GitHub/Notion and only marks validation after pasted local output confirms success.

### Current execution order

1. [x] Implement and locally validate catalogue public API foundation: shared contracts, service/repository/controller, Express route and tests.
2. [ ] Seed initial services/variants/components/policies after API foundation validation.
3. [ ] Implement admin catalogue editing after seed/public-read behavior is validated.
4. [ ] Implement public landing page catalogue consumption after backend behavior is validated.

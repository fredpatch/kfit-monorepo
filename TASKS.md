# K'FIT — Executable Tasks

> Source of truth: Notion backlog. This file is the local executable summary.

## Sprint 0 — Initialisation

- [x] Sprint 0 initialization closed and locally validated.

## Sprint 1 — Authentication, sessions, OTP and security

- [x] Sprint 1 auth foundation closed and locally validated.
- [x] Deferred password reset/recovery HTTP flow closed and locally validated.

## Sprint 2 — Catalogue, service offers and public availability

Execution rule: local command execution is performed by Fred; ChatGPT/Codex updates GitHub/Notion and only marks validation after Fred confirms successful local execution.

### Validated execution order

1. [x] S2.1 — Catalogue public API foundation — locally validated.
2. [x] S2.2 — Initial services/variants/components/policies seed — locally validated.
3. [x] S2.3 — Admin catalogue editing foundation — locally validated.
4. [x] S2.4 — Public landing page catalogue consumption — locally validated.
5. [x] S2.5 — Capacity/waitlist controls — locally validated by Fred on 2026-09-17.
6. [x] S2.6 — Admin UI capacity/waitlist controls — locally validated by Fred on 2026-09-17.

### Sprint 2 closure

- Admin bootstrap/login works against the real local PostgreSQL-backed API.
- Admin catalogue services load through the local Vite proxy.
- Open/unlimited, limited-capacity, and waitlist-only mutations were manually validated.
- Invalid combinations are blocked and archived services remain read-only.
- Persisted values survive refresh.
- Public catalogue regression passed and reflects saved availability.
- Client typecheck and production build are green.
- No new catalogue migration was required for S2.6.

Sprint 2 is closed and locally validated.

## Sprint 3 — Demandes, prospects, qualification et liste d'attente

Next selected backlog task: **Public request form (name + phone, per service)**.

Status: not started. Before implementation, inspect the Sprint 3 backlog/pattern mappings and create the Sprint 3 execution branch/state.

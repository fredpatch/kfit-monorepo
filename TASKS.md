# K'FIT — Executable Tasks

> Source of truth: Notion backlog. This file is the local executable summary.

## Sprint 0 — Initialisation

- [x] Sprint 0 initialization closed and locally validated.

## Sprint 1 — Authentication, sessions, OTP and security

- [x] Sprint 1 auth foundation closed and locally validated.
- [x] Deferred password reset/recovery HTTP flow closed and locally validated.

## Sprint 2 — Catalogue, service offers and public availability

Execution rule: implementation continues on `sprint-2/catalogue-foundation`. Local command execution is performed by Fred; ChatGPT/Codex updates GitHub/Notion and only marks validation after pasted local output confirms success.

### Current execution order

1. [x] S2.1 — Catalogue public API foundation — locally validated.
2. [x] S2.2 — Initial services/variants/components/policies seed — locally validated.
3. [x] S2.3 — Admin catalogue editing foundation — locally validated.
4. [x] S2.4 — Public landing page catalogue consumption — locally validated.
5. [x] S2.5 — Capacity/waitlist controls — locally validated by Fred on 2026-09-17.

### S2.5 validated scope

- Shared `adminServiceCapacity` route contract and `CatalogueServiceCapacityInput`.
- Server `updateAdminServiceCapacity` service operation.
- Capacity/waitlist invariants enforced in both dedicated and generic admin mutation paths.
- Protected `PATCH /admin/catalogue/services/:serviceId/capacity` route.
- Admin session, CSRF and same-origin enforcement.
- Shared contract, service and Express regression coverage.
- `db:check` green; no migration required.

### Next decision

S2.5 is closed. Before opening another implementation front, choose the next slice explicitly: admin UI for catalogue capacity/waitlist controls or the next prospect/request workflow boundary according to sprint priority.

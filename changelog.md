# K'FIT Changelog

> Only locally validated changes are recorded here.

## 2026-08-25 — Sprint 2.2 catalogue seed foundation

- Validated the initial catalogue seed for public service offers.
- Confirmed seed definition tests, `npm run seed:catalogue`, DB-backed `preflight:catalogue-seed`, and `db:check`.
- Seeded three public K'FIT services: Coaching nutrition personnalisé, Programme sportif 12 semaines, and Bilan individuel.
- Seeded variants, components and policy snapshots used by the public catalogue read model.
- Confirmed seed idempotency and public response hygiene: no duplicate business records and no admin-only fields exposed.
- Fixed the seed CLI/preflight environment loading path so `.env` is loaded before `db/client` checks `DATABASE_URL`.

## 2026-08-25 — Sprint 2.1 catalogue public API foundation

- Validated the Sprint 2.1 public catalogue API foundation after the Express router test fix in `c81c056`.
- Confirmed shared/server builds, shared catalogue contracts, catalogue service test, catalogue Express route test and `db:check`.
- Added stable public route contract `GET /catalogue/services`.
- Added shared catalogue response contracts for services, variants, components and policies.
- Added server catalogue module structure with controller, service, Drizzle repository, Express router and tests.
- Reused existing Sprint 0 catalogue schema; no migration required.

## 2026-08-25 — Sprint 1 post-closure auth recovery

- Validated the deferred password reset/recovery HTTP flow end-to-end.
- Confirmed shared/server builds, shared contracts, service/controller/Express tests, PostgreSQL hard-commit integration and `db:check`.
- Confirmed real SMTP/Mailpit HTTP/email preflight via `npm run preflight:auth-recovery`.
- Confirmed neutral unknown-account response, OTP non-disclosure over HTTP, French recovery email with six-digit code, short-lived reset grant, one-shot reset replay rejection and delivery/completion audit events.

# K'FIT Changelog

> Only locally validated changes are recorded here.

## 2026-09-17 — Sprint 2.5 capacity/waitlist controls

- Validated the server-side catalogue capacity/waitlist control slice.
- Confirmed shared build, shared catalogue contract test, server build, catalogue service tests, catalogue Express tests and `db:check`.
- Added shared `adminServiceCapacity` route contract and `CatalogueServiceCapacityInput`.
- Added `updateAdminServiceCapacity` service logic with explicit capacity/waitlist invariants.
- Added protected `PATCH /admin/catalogue/services/:serviceId/capacity` with admin session, CSRF and same-origin enforcement.
- Hardened generic admin create/update mutations so they cannot bypass the same capacity/waitlist rules.
- Added service and Express regression coverage.
- Reused the existing catalogue schema; no migration required.

## 2026-09-17 — Sprint 2.4 public landing page catalogue consumption

- Validated the client-side public catalogue landing page consumption.
- Confirmed `npm run typecheck --workspace @kfit/client`, including shared build and TypeScript no-emit check.
- Confirmed `npm run build --workspace @kfit/client` with Vite production build.
- Added a public `/` landing page that consumes `GET /catalogue/services` through a dedicated catalogue API client.
- Preserved the existing admin login/session shell under `/admin`.
- Displayed French public service cards with XAF pricing, availability, duration, capacity, components, variants and a demand CTA.
- Added loading, empty and error states plus responsive mobile/desktop styling.
- Kept prospect request workflow, real contact routing, admin UI editors, capacity computation and server/schema changes out of scope.

## 2026-09-17 — Sprint 2.3 admin catalogue editing foundation

- Validated the server-first admin catalogue editing foundation.
- Confirmed shared build, server build, shared catalogue contracts, catalogue service tests, catalogue Express route tests and `db:check`.
- Added admin catalogue routes under `/admin/catalogue/services` for service-level list, create, update, publish, archive and reorder.
- Enforced admin-only access using the existing authenticated session context.
- Protected admin mutations with CSRF and same-origin checks.
- Reused existing Sprint 0 catalogue tables; no migration required.
- Kept admin UI, variant/component/policy editing, capacity computation and landing page consumption out of scope for later Sprint 2 slices.

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

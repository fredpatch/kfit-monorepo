# K'FIT Changelog

> Only locally validated changes are recorded here.

## 2026-09-17 — Sprint 3.3 admin request queue + contact attempts

- Validated the authenticated admin request-management slice end-to-end against the real local PostgreSQL database and browser UI.
- Added shared admin request routes, DTOs, stable `REQUEST_*` error codes, contact-attempt vocabularies, request-status vocabulary and the locked S3.3 transition subset.
- Added an admin queue with status filtering and request detail including prospect, service/variant and ordered contact history.
- Added structured contact-attempt logging with approved channel/direction/outcome values and no implicit request-status mutation.
- Added guarded status progression limited to `submitted→contacting`, `contacting→qualification_in_progress`, `contacting→abandoned`, `qualification_in_progress→abandoned`, and `abandoned→qualification_in_progress`; qualification/waitlist-owned targets remain rejected.
- Enforced admin authentication on all new endpoints and same-origin + CSRF protection on mutations.
- Enforced hard audit atomicity for contact-attempt creation and status changes: the domain write and corresponding audit row share the same Drizzle transaction.
- Reused the existing audit envelope/hash helper while bypassing the long-lived `AuditService` instance for those two transaction-critical writes.
- Confirmed audit metadata contains only safe domain fields and no prospect name, WhatsApp, email or free-text note content.
- Added Catalogue / Demandes admin navigation plus queue/detail/contact-attempt/status-transition UI without adding a router dependency.
- Confirmed no database migration was required.
- Confirmed root typecheck/build, shared/server unit tests and `db:check` green.
- Fred validated the real-PostgreSQL integration suite, browser queue/detail/filter/contact-attempt/status flows, forbidden-transition behavior, DBeaver persistence/audit inspection, and S3.2 public-form regression.

## 2026-09-17 — Sprint 3.2 public request form

- Validated the public client request form end-to-end against the real local API and PostgreSQL database.
- Replaced the public catalogue `mailto:` CTA with an inline expandable request form for open services.
- Added required full-name and WhatsApp fields plus service-scoped variant selection when variants exist.
- Added a dedicated public requests API client consuming the validated S3.1 `POST /requests` contract.
- Added stable client `submissionToken` lifecycle: one token per request intent, reused across transient retries and accidental duplicate submits.
- Sent S3.1 anti-abuse fields (`website` honeypot and `formRenderedAt`) without exposing bot-specific feedback.
- Added centralized French localization for typed `REQUEST_*` errors and success confirmation with the persisted request reference.
- Kept temporarily-closed services non-submittable and waitlist-only services informational; actual waitlist enrollment remains S3.5.
- Added `/requests` to the Vite dev proxy and retained the validated forwarded-host behavior for same-origin-protected admin mutations.
- Confirmed no server/shared/schema/migration changes and no new client dependencies.
- Confirmed shared build, client typecheck and client production build green.
- Fred validated valid submission, variant selection, transient retry, unavailable/waitlist/race states, required-field handling, honeypot accessibility, mobile behavior and catalogue regression.
- Fred verified through DBeaver that a rapid double-submit persisted exactly one `service_requests` row.

## 2026-09-17 — Sprint 3.1 public request/prospect intake foundation

- Validated the server-first anonymous public request intake slice end-to-end against the local PostgreSQL database.
- Added shared `POST /requests` route/input/response contracts and stable `REQUEST_*` error codes.
- Added request module layering with repository, service, controller, Express router and tests.
- Added `service_requests.submission_token` with a unique constraint via additive migration `0002_rapid_boomerang.sql`; Fred applied the migration locally.
- Validated concurrency-safe idempotent replay against real PostgreSQL: concurrent submissions with the same token persist one request and return one created + one replayed result referencing the same row.
- Added prospect reuse by normalized WhatsApp number and enforced request creation in `submitted` state only.
- Enforced service gating: archived, temporarily closed, waitlist-only and non-public/unpublished services are rejected with typed public errors.
- Enforced requested-variant ownership while collapsing nonexistent/cross-service failures to `REQUEST_VARIANT_INVALID` publicly.
- Added layered public-abuse safeguards: origin check, process-local per-IP limiting, honeypot and minimum completion time.
- Added anonymous/public audit events with no PII in metadata.
- Kept waitlist entry creation, admin request queue, qualification and client form UI out of S3.1 scope.
- Confirmed shared build/tests, server typecheck/build/tests, `db:check`, real-PostgreSQL repository integration test, and client typecheck regression green.

## 2026-09-17 — Sprint 2.6 admin capacity/waitlist workspace

- Validated the authenticated admin catalogue capacity/waitlist UI end-to-end.
- Confirmed client typecheck and production build green.
- Confirmed real local PostgreSQL-backed bootstrap/login flow and active admin session restoration.
- Added authenticated admin catalogue reads and capacity mutation through the existing S2.5 server contracts.
- Added French controls for availability, unlimited/limited capacity, positive-integer capacity limit and waitlist enablement.
- Confirmed open/unlimited, limited-capacity and waitlist-only saves persist after refresh.
- Confirmed invalid combinations are blocked and archived services remain read-only.
- Confirmed public `/` catalogue regression and updated availability reflection after refresh.
- Added the real local dev API launcher and Vite proxy routing for `/auth`, `/catalogue`, `/admin/catalogue` and `/health`.
- Changed bootstrap-status failure handling so local API failures are surfaced explicitly instead of falling through to login.
- Reused existing catalogue/auth schema and business rules; no S2.6 migration required.

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
- Confirmed shared build, server build, shared catalogue contracts, catalogue service test, catalogue Express route test and `db:check`.
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

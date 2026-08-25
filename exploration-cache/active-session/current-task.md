# Current Task

> Slice: Sprint 2.2 — initial catalogue seed | Date: 2026-08-25 | Status: Closed, locally validated

## Task

Seed initial K'FIT services, variants, components and policies so the validated public catalogue API can return realistic business content.

## Implemented scope

- Deterministic, idempotent catalogue seed data.
- Three public K'FIT service offers:
  - Coaching nutrition personnalisé
  - Programme sportif 12 semaines
  - Bilan individuel
- Service variants for Standard/Premium and programme follow-up.
- Package components for WhatsApp follow-up, individual session, training plan and initial assessment.
- Service policies for follow-up frequency, late cancellation, missed sessions and medical-clearance behavior.
- Root/server npm scripts:
  - `seed:catalogue`
  - `preflight:catalogue-seed`
- Seed definition test.
- DB-backed preflight that runs the seed twice and validates the real Drizzle repository + CatalogueService public response.
- Validation fix `8905d4a`: seed CLI and preflight load `.env` before importing `db/client`, avoiding `DATABASE_URL is required` when run from npm scripts.

## Validation confirmed by Fred

- [x] `node --test packages/server/dist/db/seeds/catalogue.seed.test.js`
- [x] `npm run seed:catalogue`
- [x] `npm run preflight:catalogue-seed`
- [x] `npm run db:check`
- [x] Seed is idempotent and does not create duplicate services/variants/components/policies.
- [x] Public catalogue output includes realistic K'FIT content and hides admin-only fields.

## Explicitly out of scope for this slice

- Landing page UI.
- Admin catalogue CRUD.
- Capacity computation from active subscriptions.
- Prospect request form.
- Waitlist workflow behavior beyond seeded availability flags.

## Next boundary

S2.2 is closed. Next decision: S2.3 admin catalogue editing or S2.4 public landing page catalogue consumption.

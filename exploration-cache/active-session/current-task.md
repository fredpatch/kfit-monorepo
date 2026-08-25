# Current Task

> Slice: Sprint 2.1 — catalogue public API foundation | Date: 2026-08-25 | Status: Completed and locally validated

## Task

Start Sprint 2 with the backend/public catalogue foundation before client UI or admin CMS editing.

## Completed implementation

- Shared catalogue contracts exported from `@kfit/shared`.
- Stable public catalogue route: `GET /catalogue/services`.
- Server catalogue module structure aligned with Sprint 1 folder conventions.
- CatalogueService assembles public services with variants, components and policies.
- DrizzleCatalogueRepository reads from the existing Sprint 0 catalogue tables.
- Express catalogue router exposes the public read endpoint without auth.
- `createServerApp` can mount the catalogue router when a catalogue controller is provided.
- Unit/route tests added for shared contracts, service assembly and Express route behavior.
- Express router test fixed by mounting the router through an Express app before creating the HTTP server.

## Locally validated by Fred

- `npm run build --workspace @kfit/shared`
- `npm run build --workspace @kfit/server`
- `node --test packages/shared/dist/catalogue/contracts.test.js`
- `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js`
- `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js`
- `npm run db:check`

## Acceptance criteria

- [x] `npm run build --workspace @kfit/shared` passes.
- [x] `npm run build --workspace @kfit/server` passes.
- [x] `node --test packages/shared/dist/catalogue/contracts.test.js` passes.
- [x] `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js` passes.
- [x] `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js` passes.
- [x] `npm run db:check` passes; no migration required for this slice.
- [x] Public catalogue response includes services, variants, components and policies without exposing admin-only data.

## Explicitly out of scope for this slice

- Client landing page UI.
- Admin catalogue CMS editing.
- Capacity computation from active subscriptions.
- Prospect request form.
- Waitlist workflow.
- Catalogue seed content beyond existing DB/table support.

## Next boundary

Next Sprint 2 slice: seed initial services/variants/components/policies so the public API has realistic K'FIT catalogue content to serve.

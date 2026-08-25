# Current Task

> Slice: Sprint 2 — catalogue/service offers foundation | Date: 2026-08-25 | Status: Implemented, awaiting local validation

## Task

Start Sprint 2 with the backend/public catalogue foundation before client UI or admin CMS editing.

## Implemented scope

- Shared catalogue contracts exported from `@kfit/shared`.
- Stable public catalogue route: `GET /catalogue/services`.
- Server catalogue module structure aligned with Sprint 1 folder conventions.
- CatalogueService assembles public services with variants, components and policies.
- DrizzleCatalogueRepository reads from the existing Sprint 0 catalogue tables.
- Express catalogue router exposes the public read endpoint without auth.
- `createServerApp` can mount the catalogue router when a catalogue controller is provided.
- Unit/route tests added for shared contracts, service assembly and Express route behavior.

## Acceptance criteria

- [ ] `npm run build --workspace @kfit/shared` passes.
- [ ] `npm run build --workspace @kfit/server` passes.
- [ ] `node --test packages/shared/dist/catalogue/contracts.test.js` passes.
- [ ] `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js` passes.
- [ ] `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js` passes.
- [ ] `npm run db:check` passes; no migration should be required for this slice.
- [ ] Public catalogue response includes services, variants, components and policies without exposing admin-only data.

## Explicitly out of scope for this slice

- Client landing page UI.
- Admin catalogue CMS editing.
- Capacity computation from active subscriptions.
- Prospect request form.
- Waitlist workflow.
- Catalogue seed content beyond existing DB/table support.

## Next boundary after validation

After Fred validates this slice locally, update GitHub/Notion/changelog, then implement the next Sprint 2 slice: catalogue seed/admin editing or public landing page consumption.

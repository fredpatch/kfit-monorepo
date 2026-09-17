# Sprint 2 — Catalogue, service offers and public availability

> Branch: `sprint-2/catalogue-foundation`

## Objective

Build the K'FIT catalogue foundation before prospects/client workflows: public services, admin editing, seeded offers, and public landing page consumption.

## Validated slices

- [x] S2.1 — Catalogue public API foundation.
- [x] S2.2 — Initial services/variants/components/policies seed.

## Current slice

- [x] S2.3 — Admin catalogue editing foundation.

Status: closed and locally validated by Fred.

Validation commands:

```bash
npm run build --workspace @kfit/shared
npm run build --workspace @kfit/server
node --test packages/shared/dist/catalogue/contracts.test.js
node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js
node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js
npm run db:check
```

## Remaining Sprint 2 slices

- [ ] S2.4 — Public landing page catalogue consumption.
- [ ] S2.5 — Capacity/waitlist controls.

## Notes

- `changelog.md` records validated work only.
- S2.3 must not be marked complete until Fred confirms green local output.
- Current S2.3 scope is service-level admin editing only; variant/component/policy editors remain later work.

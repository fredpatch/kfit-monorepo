# Sprint 2 — Catalogue, service offers and public availability

> Branch: `sprint-2/catalogue-foundation`

## Objective

Build the K'FIT catalogue foundation before prospects/client workflows: public services, admin editing, seeded offers, public landing page consumption, and catalogue-level capacity/waitlist controls.

## Validated slices

- [x] S2.1 — Catalogue public API foundation.
- [x] S2.2 — Initial services/variants/components/policies seed.
- [x] S2.3 — Admin catalogue editing foundation.
- [x] S2.4 — Public landing page catalogue consumption.
- [x] S2.5 — Capacity/waitlist controls.

## S2.5 closure

Fred confirmed the full local validation gate green on 2026-09-17.

Validated commands:

```bash
npm run build --workspace @kfit/shared
node --test packages/shared/dist/catalogue/contracts.test.js
npm run build --workspace @kfit/server
node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js
node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js
npm run db:check
```

Validated boundary:

- shared `adminServiceCapacity` route contract and `CatalogueServiceCapacityInput`;
- service-level capacity/waitlist mutation rules;
- controller + authenticated/CSRF/same-origin protected PATCH route;
- service and Express coverage;
- generic admin create/update paths hardened so they cannot bypass the same capacity/waitlist invariants;
- no migration required.

## Next decision

Do not open the next implementation front until the next slice is explicitly selected. Candidate continuation: admin UI for capacity/waitlist controls or prospect request/contact workflow according to business priority.

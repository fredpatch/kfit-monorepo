# Sprint 2 — Catalogue, service offers and public availability

> Branch: `sprint-2/catalogue-foundation`

## Objective

Build the K'FIT catalogue foundation before prospects/client workflows: public services, admin editing, seeded offers, public landing page consumption, and catalogue-level capacity/waitlist controls.

## Validated slices

- [x] S2.1 — Catalogue public API foundation.
- [x] S2.2 — Initial services/variants/components/policies seed.
- [x] S2.3 — Admin catalogue editing foundation.
- [x] S2.4 — Public landing page catalogue consumption.

## Current slice

- [ ] S2.5 — Capacity/waitlist controls.

Status: implemented, statically committed, awaiting Fred local validation.
Implementation head before state-sync commits: `2f13fd66aa6e469b4f302a9591e9f030ce480eb6`.

Implemented boundary:

- shared `adminServiceCapacity` route contract and `CatalogueServiceCapacityInput`;
- service-level capacity/waitlist mutation rules;
- controller + authenticated/CSRF/same-origin protected PATCH route;
- service and Express coverage;
- generic admin create/update paths hardened so they cannot bypass the same capacity/waitlist invariants.

## Validation gate

```bash
git switch sprint-2/catalogue-foundation
git pull

npm run build --workspace @kfit/shared
node --test packages/shared/dist/catalogue/contracts.test.js

npm run build --workspace @kfit/server
node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js
node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js

npm run db:check
```

Expected: all green; no migration expected.

## Notes

- `changelog.md` records validated work only and must not be updated before Fred confirms this gate.
- Do not mark S2.5 complete before local validation.

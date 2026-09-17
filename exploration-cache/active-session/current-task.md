# Current Task

> Slice: Sprint 2.5 — capacity/waitlist controls | Date: 2026-09-17 | Status: Implemented, awaiting Fred validation

## Task

Validate the S2.5 server-side capacity/waitlist control slice locally before closure.

## Implemented scope

- Shared `adminServiceCapacity` endpoint contract.
- `CatalogueServiceCapacityInput`.
- Server `updateAdminServiceCapacity` service operation.
- Capacity/waitlist business invariants enforced in dedicated and generic admin mutations.
- Controller method and protected PATCH route.
- Service + Express tests.

## Acceptance criteria

- [ ] Shared build passes.
- [ ] Shared catalogue contract test passes.
- [ ] Server build passes.
- [ ] Catalogue service tests pass.
- [ ] Catalogue Express tests pass.
- [ ] `db:check` passes.
- [ ] Confirm no migration is required.

## Validation commands

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

## Closure rule

Do not mark S2.5 complete or update `changelog.md` until Fred confirms the full gate green.

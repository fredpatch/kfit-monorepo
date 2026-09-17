# Current Task

> Slice: Sprint 2.5 — capacity/waitlist controls | Date: 2026-09-17 | Status: Closed, locally validated

## Task

S2.5 capacity/waitlist controls are complete and locally validated.

## Validated scope

- Shared `adminServiceCapacity` endpoint contract.
- `CatalogueServiceCapacityInput`.
- Server `updateAdminServiceCapacity` service operation.
- Capacity/waitlist business invariants enforced in dedicated and generic admin mutations.
- Controller method and protected PATCH route.
- Service + Express tests.

## Validation confirmed by Fred

- [x] Shared build passes.
- [x] Shared catalogue contract test passes.
- [x] Server build passes.
- [x] Catalogue service tests pass.
- [x] Catalogue Express tests pass.
- [x] `db:check` passes.
- [x] No migration required.

## Next boundary

S2.5 is closed. Select the next slice before implementation begins.

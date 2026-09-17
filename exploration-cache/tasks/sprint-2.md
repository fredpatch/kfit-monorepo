# Sprint 2 — Catalogue, service offers and public availability

> Branch: `sprint-2/catalogue-foundation`

## Objective

Build the K'FIT catalogue foundation before prospects/client workflows: public services, admin editing, seeded offers, public landing page consumption, catalogue-level capacity/waitlist controls, and an operator-facing admin capacity workspace.

## Validated slices

- [x] S2.1 — Catalogue public API foundation.
- [x] S2.2 — Initial services/variants/components/policies seed.
- [x] S2.3 — Admin catalogue editing foundation.
- [x] S2.4 — Public landing page catalogue consumption.
- [x] S2.5 — Capacity/waitlist controls.

## Current slice

- [ ] S2.6 — Admin UI capacity / waitlist controls.

Status: implemented and statically inspected; awaiting Fred local validation.
Implementation head before project-state sync commits: `87010ce5d0ca44716fae71748b9ab289add11f2b`.

Implemented boundary:

- client-only integration over validated S2.5 server behavior;
- admin catalogue API client with authenticated cookie session and existing CSRF helper;
- React Query admin catalogue read and capacity mutation;
- French capacity/waitlist editor per service;
- availability, unlimited/limited capacity, positive integer limit and waitlist controls;
- archived services are read-only;
- client feedback for invalid combinations, loading, empty, fetch error, saving, save success and save failure;
- admin/public catalogue cache invalidation after successful mutation;
- existing `/admin` auth/bootstrap/login shell preserved;
- existing `/` public catalogue route preserved;
- no server/schema/migration change.

Relevant implementation commits:

- `e157728` — feat(catalogue): add admin capacity api client
- `7126805` — feat(catalogue): add admin capacity controls ui
- `7e4b441` — feat(catalogue): mount admin capacity workspace
- `b146c05` — style(catalogue): add admin capacity workspace styles
- `87010ce` — fix(catalogue): surface admin capacity save feedback

## Validation gate

```bash
git switch sprint-2/catalogue-foundation
git pull
npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

Manual local smoke:

- authenticate at `/admin`;
- confirm admin catalogue services load;
- update open/unlimited state;
- update limited capacity using a positive integer;
- enable waitlist and set `Liste d’attente uniquement`;
- confirm invalid combinations are rejected in UI and by the server if attempted;
- confirm archived services cannot be edited;
- refresh and confirm persistence;
- confirm the public `/` catalogue still loads and reflects saved availability after refresh.

## Notes

- `changelog.md` records validated work only; do not update it before Fred confirms the full S2.6 gate.
- S2.6 introduces no new authoritative business rule. S2.5 remains the server source of truth.
- Prospect/request workflow remains out of scope until this slice is locally validated and closed.

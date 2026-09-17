# Sprint 2 — Catalogue, service offers and public availability

> Branch: `sprint-2/catalogue-foundation`

## Objective

Build the K'FIT catalogue foundation before prospects/client workflows: public services, admin editing, seeded offers, and public landing page consumption.

## Validated slices

- [x] S2.1 — Catalogue public API foundation.
- [x] S2.2 — Initial services/variants/components/policies seed.
- [x] S2.3 — Admin catalogue editing foundation.

## Current slice

- [ ] S2.4 — Public landing page catalogue consumption.

Status: implemented and awaiting Fred's local client validation.

Validation commands:

```bash
npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

Optional browser smoke check:

```bash
npm run dev --workspace @kfit/client
```

Open `/` for the public catalogue landing page and `/admin` for the existing admin shell.

## Remaining Sprint 2 slices

- [ ] S2.5 — Capacity/waitlist controls.

## Notes

- `changelog.md` records validated work only.
- S2.4 must not be marked complete until Fred confirms green local output.
- Current S2.4 scope consumes the existing public catalogue API only; no server/schema changes and no prospect workflow.

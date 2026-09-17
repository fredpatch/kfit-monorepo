# Sprint 2 — Catalogue, service offers and public availability

> Branch: `sprint-2/catalogue-foundation`

## Objective

Build the K'FIT catalogue foundation before prospects/client workflows: public services, admin editing, seeded offers, and public landing page consumption.

## Validated slices

- [x] S2.1 — Catalogue public API foundation.
- [x] S2.2 — Initial services/variants/components/policies seed.
- [x] S2.3 — Admin catalogue editing foundation.
- [x] S2.4 — Public landing page catalogue consumption.

## Current slice

S2.4 is closed and locally validated by Fred.

Validation commands:

```bash
npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

Confirmed output:

- shared build completed through client typecheck;
- TypeScript no-emit check completed;
- Vite production build completed successfully.

## Remaining Sprint 2 slices

- [ ] S2.5 — Capacity/waitlist controls.

## Notes

- `changelog.md` records validated work only.
- Current S2.4 scope consumes the existing public catalogue API only; no server/schema changes and no prospect workflow.
- After S2.4 closure, `main` should be fast-forwarded to the validated Sprint 2 branch head.

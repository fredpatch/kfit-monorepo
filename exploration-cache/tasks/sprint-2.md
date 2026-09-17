# Sprint 2 — Catalogue, service offers and public availability

> Branch: `sprint-2/catalogue-foundation`  
> Status: Closed and locally validated on 2026-09-17

## Objective

Build the K'FIT catalogue foundation before prospects/client workflows: public services, admin editing, seeded offers, public landing page consumption, catalogue-level capacity/waitlist controls, and an operator-facing admin capacity workspace.

## Validated slices

- [x] S2.1 — Catalogue public API foundation.
- [x] S2.2 — Initial services/variants/components/policies seed.
- [x] S2.3 — Admin catalogue editing foundation.
- [x] S2.4 — Public landing page catalogue consumption.
- [x] S2.5 — Capacity/waitlist controls.
- [x] S2.6 — Admin UI capacity / waitlist controls.

## S2.6 validated boundary

- authenticated admin catalogue API client using existing cookie session and CSRF handling;
- React Query admin catalogue read and capacity mutation;
- French per-service controls for availability, capacity mode, capacity limit and waitlist enablement;
- archived services read-only;
- invalid combinations blocked in UI while S2.5 remains authoritative server validation;
- admin/public catalogue cache invalidation after successful mutation;
- local real API composition against PostgreSQL/Drizzle for development;
- Vite proxy for `/auth`, `/catalogue`, `/admin/catalogue` and `/health`;
- explicit bootstrap-status failure UI instead of false login fallback;
- first-run local bootstrap creates the privileged V1 admin without seeded credentials.

## Local validation confirmed by Fred

- client typecheck green;
- client production build green;
- real bootstrap/login flow works locally;
- admin catalogue services load;
- open/unlimited save succeeds;
- limited positive-integer capacity save succeeds;
- waitlist enabled + `waitlist_only` save succeeds;
- invalid combinations are blocked;
- archived services are read-only;
- refresh restores persisted values;
- public `/` catalogue remains functional and reflects saved availability.

## Sprint acceptance result

Sprint 2 delivers a working catalogue loop from seeded/server-managed offers through public consumption and authenticated operator capacity/waitlist controls. No S2.6 database migration was required.

## Next dependency boundary

Sprint 3 starts the M2 acquisition workflow. First selected backlog task: **Public request form (name + phone, per service)**. Do not implement it on the Sprint 2 branch.

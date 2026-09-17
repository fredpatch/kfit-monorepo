# Current Task

> Slice: Sprint 2.3 — admin catalogue editing foundation | Date: 2026-09-17 | Status: Closed, locally validated

## Task

Implement the server-first foundation for admin catalogue service editing.

## Validated scope

- Shared catalogue admin route and response contracts.
- Admin service list endpoint.
- Admin service create/update endpoints.
- Admin service publish/archive endpoints.
- Admin service reorder endpoint.
- Admin-only access guard using the existing authenticated session context.
- CSRF and same-origin protection for admin mutations.
- Drizzle repository commands over the existing Sprint 0 catalogue tables.
- Service-level validation for slugs, prices, capacity, durations, publication guards and reorder payloads.
- Tests for shared contracts, catalogue service rules and Express admin route behavior.

## Validation confirmed by Fred

- [x] `npm run build --workspace @kfit/shared`
- [x] `node --test packages/shared/dist/catalogue/contracts.test.js`
- [x] `npm run build --workspace @kfit/server`
- [x] `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js`
- [x] `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js`
- [x] `npm run db:check`

## Explicitly out of scope for this slice

- Admin UI.
- Variant/component/policy editors.
- Public landing page consumption.
- Capacity computation from active subscriptions.
- Prospect request and waitlist workflow.

## Next boundary

S2.3 is closed. Next recommended slice: S2.4 public landing page catalogue consumption.

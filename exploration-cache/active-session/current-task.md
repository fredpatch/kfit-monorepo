# Current Task

> Slice: Sprint 2.3 — admin catalogue editing foundation | Date: 2026-08-25 | Status: Implemented, awaiting local validation

## Task

Implement the server-first foundation for admin catalogue service editing.

## Implemented scope

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

## Explicitly out of scope for this slice

- Admin UI.
- Variant/component/policy editors.
- Public landing page consumption.
- Capacity computation from active subscriptions.
- Prospect request and waitlist workflow.

## Validation pending from Fred

- [ ] `npm run build --workspace @kfit/shared`
- [ ] `npm run build --workspace @kfit/server`
- [ ] `node --test packages/shared/dist/catalogue/contracts.test.js`
- [ ] `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js`
- [ ] `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js`
- [ ] `npm run db:check`

## Notes

Do not update `changelog.md` or mark the Notion task as `Terminé` until Fred confirms green local output.

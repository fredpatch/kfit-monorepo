# Next Actions

> Updated: 2026-08-25

1. Fred pulls the latest `sprint-1/auth-foundation`.
2. Fred validates the Sprint 2 catalogue foundation locally:
   - `npm run build --workspace @kfit/shared`
   - `npm run build --workspace @kfit/server`
   - `node --test packages/shared/dist/catalogue/contracts.test.js`
   - `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js`
   - `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js`
   - `npm run db:check`
3. If validation fails, diagnose exact output and apply the smallest correction.
4. After green validation, mark the catalogue foundation validated/completed and update GitHub, Notion, TASKS and changelog.
5. Continue Sprint 2 with the next explicit slice.

# Next Actions

> Updated: 2026-08-25

1. Fred switches to `sprint-2/catalogue-foundation` and pulls latest changes.
2. Fred validates S2.2 locally:
   - `npm run build --workspace @kfit/server`
   - `node --test packages/server/dist/db/seeds/catalogue.seed.test.js`
   - `npm run seed:catalogue`
   - `npm run preflight:catalogue-seed`
   - `npm run db:check`
3. If validation fails, diagnose the exact output and apply the smallest correction.
4. After green validation, mark S2.2 validated/completed and update GitHub, Notion, TASKS and changelog.
5. Then choose the next Sprint 2 slice: admin catalogue editing or public landing page consumption.

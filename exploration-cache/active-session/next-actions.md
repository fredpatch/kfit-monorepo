# Next Actions

> Updated: 2026-08-25

1. Fred validates S2.3 locally:
   - `npm run build --workspace @kfit/shared`
   - `npm run build --workspace @kfit/server`
   - `node --test packages/shared/dist/catalogue/contracts.test.js`
   - `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js`
   - `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js`
   - `npm run db:check`
2. If validation fails:
   - inspect the exact output,
   - patch the smallest failing server/shared slice,
   - keep S2.3 as implemented but not validated.
3. If validation passes:
   - mark S2.3 complete in TASKS.md, Notion and exploration-cache,
   - add a validated-only changelog entry,
   - decide whether to fast-forward `main` to the S2.3 checkpoint.
4. Next Sprint 2 slice after S2.3:
   - S2.4 public landing page catalogue consumption.

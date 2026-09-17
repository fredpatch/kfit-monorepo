# K'FIT — Next Chat Handoff

## Current objective

Finish Sprint 2.6 — admin UI capacity / waitlist controls — on `sprint-2/catalogue-foundation`. Do **not** mark it complete yet.

## Validated prior work

- Sprint 0 closed.
- Sprint 1 auth closed.
- Password recovery closed.
- Sprint 2.1 public catalogue API closed.
- Sprint 2.2 catalogue seed closed.
- Sprint 2.3 admin catalogue editing closed.
- Sprint 2.4 public landing page catalogue consumption closed.
- Sprint 2.5 capacity/waitlist controls closed and locally validated.
- `main` is at validated S2.5 closure head `88f6b9cb1428848411179a1ed1a0733ad49fd3f6`.

## S2.6 implementation state

Implementation head before project-state sync commits: `87010ce5d0ca44716fae71748b9ab289add11f2b`.

Implemented:

- `catalogueApiClient.listAdminServices()` using authenticated admin HTTP client;
- `catalogueApiClient.updateAdminServiceCapacity()` using validated S2.5 PATCH route;
- existing CSRF helper reused for admin mutations;
- `AdminCatalogueCapacityPage` with per-service French controls;
- availability, unlimited/limited capacity, positive integer capacity limit and waitlist enablement;
- archived services read-only;
- React Query cache invalidation for admin and public catalogue after save;
- loading/empty/error/pending/success/failure UI states;
- authenticated `/admin` workspace mounted behind existing bootstrap/login/session flow;
- public `/` catalogue preserved;
- responsive admin workspace styling;
- no server/schema/migration changes.

Implementation commits:

- `e157728` feat(catalogue): add admin capacity api client
- `7126805` feat(catalogue): add admin capacity controls ui
- `7e4b441` feat(catalogue): mount admin capacity workspace
- `b146c05` style(catalogue): add admin capacity workspace styles
- `87010ce` fix(catalogue): surface admin capacity save feedback

## Current validation gate

Fred must run:

```bash
git switch sprint-2/catalogue-foundation
git pull

npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

Then manually confirm:

1. `/admin` login/session works.
2. Admin catalogue services load.
3. Open + unlimited save works.
4. Limited capacity with a positive integer saves.
5. Waitlist enabled + `Liste d’attente uniquement` saves.
6. Invalid combinations are blocked.
7. Archived services are read-only.
8. Refresh shows persisted values.
9. Public `/` catalogue still loads and reflects the saved availability after refresh.

## After Fred confirms green

1. Close S2.6 in repo state.
2. Update `changelog.md` with validated S2.6 changes.
3. Close S2.6 in Notion.
4. Fast-forward `main` to the validated S2.6 closure head.
5. Only then inspect/plan the prospect request/contact workflow.

## Execution rule

Do not run project commands in assistant runtime. Fred validates locally. A commit/static inspection is not validation.

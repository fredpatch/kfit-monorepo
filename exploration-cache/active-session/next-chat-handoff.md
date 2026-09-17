# K'FIT — Next Chat Handoff

## Current objective

Finish Sprint 2.5 — capacity/waitlist controls — on `sprint-2/catalogue-foundation`. Do **not** mark it complete yet.

## Validated prior work

- Sprint 0 closed.
- Sprint 1 auth closed.
- Password recovery closed.
- Sprint 2.1 public catalogue API closed.
- Sprint 2.2 catalogue seed closed.
- Sprint 2.3 admin catalogue editing closed.
- Sprint 2.4 public landing page catalogue consumption closed.
- `main` was already fast-forwarded to validated S2.4 head `6b2fe6d...`.

## S2.5 implementation state

Implementation head before project-state sync commits: `2f13fd66aa6e469b4f302a9591e9f030ce480eb6`.

Implemented:

- shared `adminServiceCapacity: "/admin/catalogue/services/:serviceId/capacity"` contract;
- `CatalogueServiceCapacityInput`;
- server `updateAdminServiceCapacity` logic and capacity/waitlist validation;
- controller method;
- `PATCH /admin/catalogue/services/:serviceId/capacity` protected by admin session + CSRF + same-origin;
- service and Express tests;
- generic admin create/update hardening so capacity/waitlist invariants cannot be bypassed.

Important S2.5 commits:

- `c1e9e90` feat(catalogue): add capacity control contract
- `fd61f6a` test(catalogue): cover capacity route contract
- `dc53778` feat(catalogue): enforce capacity control rules
- `ef0fa11` feat(catalogue): expose capacity control controller
- `6e3ffed` feat(catalogue): add admin capacity route
- `2d0fda4` test(catalogue): cover capacity control service rules
- `29f475f` test(catalogue): cover capacity control route
- `9d8ac07` fix(catalogue): align admin capacity mutation rules
- `2f13fd6` test(catalogue): enforce generic capacity mutation consistency

## Current validation gate

Fred must run:

```bash
git switch sprint-2/catalogue-foundation
git pull

npm run build --workspace @kfit/shared
node --test packages/shared/dist/catalogue/contracts.test.js

npm run build --workspace @kfit/server
node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js
node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js

npm run db:check
```

Expected: all green; no migration expected.

## After Fred confirms green

1. Close S2.5 in repo state.
2. Update `changelog.md` with validated changes.
3. Close S2.5 in Notion.
4. Fast-forward `main` to the validated branch head.
5. Decide next slice: admin capacity/waitlist UI or prospect request/contact workflow.

## Execution rule

Do not run project commands in assistant runtime. Fred validates locally. A commit/static inspection is not validation.

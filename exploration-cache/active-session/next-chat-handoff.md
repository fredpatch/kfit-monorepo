# K'FIT — Next Chat Handoff

## Current objective

Sprint 2 — catalogue/service offers foundation is active on `sprint-2/catalogue-foundation`.

Do **not** restart feasibility, Sprint 0, Sprint 1 planning, auth closure, Sprint 2.1, or Sprint 2.2. Sprint 1 auth foundation, password reset/recovery HTTP flow, Sprint 2.1 catalogue public API foundation and Sprint 2.2 catalogue seed foundation are closed and locally validated.

## Execution rule still active

- Do **not** run npm, Docker, PostgreSQL, git clone/pull, migrations, pre-flight scripts, tests or project commands in the assistant runtime.
- Use connected GitHub and Notion for inspection, implementation and commits.
- When execution is required, provide exact Windows/Git Bash commands.
- Fred runs commands locally and returns output.
- Only mark something validated after Fred confirms successful local execution.
- Work one task at a time.

## Repository / branch

- Repository: `fredpatch/kfit-monorepo`
- Main: fast-forwarded to validated head `3cf4138` before Sprint 2 branch creation
- Current branch: `sprint-2/catalogue-foundation`

## Validated Sprint 2 state

Sprint 2.1 — public catalogue API foundation:

- Shared catalogue contracts.
- Public route `GET /catalogue/services`.
- Server catalogue controller/service/repository/router/tests.
- Express app binding.

Sprint 2.2 — initial catalogue seed:

- Seeded services:
  - Coaching nutrition personnalisé
  - Programme sportif 12 semaines
  - Bilan individuel
- Seeded variants, components and policy snapshots.
- Scripts:
  - `npm run seed:catalogue`
  - `npm run preflight:catalogue-seed`
- Preflight validates idempotency and public read model through the real Drizzle repository/service.
- Validation fix `8905d4a`: seed CLI and preflight load `.env` before importing `db/client`.

Fred confirmed all green for S2.2:

```bash
node --test packages/server/dist/db/seeds/catalogue.seed.test.js
npm run seed:catalogue
npm run preflight:catalogue-seed
npm run db:check
```

## Current blockers

- Legal validation before production.
- Real off-server backup destination before production.

## Next decision

Choose the next Sprint 2 slice:

1. S2.3 admin catalogue editing, if the business needs editable service setup first.
2. S2.4 public landing page catalogue consumption, if the priority is showing validated offers to prospects first.

Before merging to `main`, decide whether to merge S2.2 as a clean checkpoint now or keep `sprint-2/catalogue-foundation` open through the next related catalogue slice.

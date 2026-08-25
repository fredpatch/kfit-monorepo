# K'FIT — Next Chat Handoff

## Current objective

Sprint 2 — catalogue/service offers foundation is active on `sprint-2/catalogue-foundation`.

Do **not** restart feasibility, Sprint 0, Sprint 1 planning, auth closure, or Sprint 2.1. Sprint 1 auth foundation, password reset/recovery HTTP flow and Sprint 2.1 catalogue public API foundation are closed and locally validated.

## Execution rule still active

- Do **not** run npm, Docker, PostgreSQL, git clone/pull, migrations, pre-flight scripts, tests or project commands in the assistant runtime.
- Use connected GitHub and Notion for inspection, implementation and commits.
- When execution is required, provide exact Windows/Git Bash commands.
- Fred runs commands locally and returns output.
- Only mark something validated after Fred confirms successful local execution.
- Work one task at a time.

## Repository / branch

- Repository: `fredpatch/kfit-monorepo`
- Main: fast-forwarded to validated head `3cf4138`
- Current branch: `sprint-2/catalogue-foundation`

## Current implemented slice

Sprint 2.2 — initial catalogue seed is implemented and awaiting local validation.

Implemented:

- Deterministic seed in `packages/server/src/db/seeds/catalogue.seed.ts`.
- Seeded services:
  - Coaching nutrition personnalisé
  - Programme sportif 12 semaines
  - Bilan individuel
- Seeded variants, components and policies.
- Scripts:
  - `npm run seed:catalogue`
  - `npm run preflight:catalogue-seed`
- Preflight validates idempotency and public read model through the real Drizzle repository/service.

## Validation commands to request from Fred

```bash
git switch sprint-2/catalogue-foundation
git pull
npm run build --workspace @kfit/server
node --test packages/server/dist/db/seeds/catalogue.seed.test.js
npm run seed:catalogue
npm run preflight:catalogue-seed
npm run db:check
```

## Current blockers

- Legal validation before production.
- Real off-server backup destination before production.
- Sprint 2.2 local validation pending.

## Next after green validation

- Update TASKS, changelog, exploration-cache and Notion.
- Then choose S2.3 admin catalogue editing or S2.4 public landing page consumption.

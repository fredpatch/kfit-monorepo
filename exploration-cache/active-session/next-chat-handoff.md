# K'FIT — Next Chat Handoff

## Current objective

Sprint 2 — catalogue/service offers foundation has started.

Do **not** restart feasibility, Sprint 0, Sprint 1 planning, or auth closure. Sprint 1 auth foundation and password reset/recovery HTTP flow are closed and locally validated.

## Execution rule still active

- Do **not** run npm, Docker, PostgreSQL, git clone/pull, migrations, pre-flight scripts, tests or project commands in the assistant runtime.
- Use connected GitHub and Notion for inspection, implementation and commits.
- When execution is required, provide exact Windows/Git Bash commands.
- Fred runs commands locally and returns output.
- Only mark something validated after Fred confirms successful local execution.
- Work one task at a time.

## Repository / branch

- Repository: `fredpatch/kfit-monorepo`
- Current branch: `sprint-1/auth-foundation`

## Current implemented slice

Sprint 2 catalogue foundation is implemented and awaiting local validation.

Implemented:

- Shared catalogue API contracts in `packages/shared/src/catalogue/contracts.ts`.
- Public route contract: `GET /catalogue/services`.
- Server catalogue module:
  - controller
  - service
  - Drizzle repository
  - Express router
  - tests
- Optional catalogue router binding in `createServerApp`.
- Existing Sprint 0 catalogue schema is reused; no migration should be needed.

## Validation commands to request from Fred

```bash
git pull
npm run build --workspace @kfit/shared
npm run build --workspace @kfit/server
node --test packages/shared/dist/catalogue/contracts.test.js
node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js
node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js
npm run db:check
```

## Current blockers

- Legal validation before production.
- Real off-server backup destination before production.
- Sprint 2 catalogue foundation local validation pending.

## Next after green validation

- Update TASKS, changelog, exploration-cache and Notion.
- Then continue Sprint 2 with one explicit next slice: catalogue seed/admin editing or public landing page consumption.

# K'FIT — Next Chat Handoff

## Current objective

Sprint 2 — catalogue/service offers foundation is active.

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
- Previous auth branch: `sprint-1/auth-foundation` should no longer receive Sprint 2 work

## Validated Sprint 2.1 slice

Catalogue public API foundation is closed as locally validated.

Validated:

- Shared catalogue API contracts in `packages/shared/src/catalogue/contracts.ts`.
- Public route contract: `GET /catalogue/services`.
- Server catalogue module:
  - controller
  - service
  - Drizzle repository
  - Express router
  - tests
- Optional catalogue router binding in `createServerApp`.
- Existing Sprint 0 catalogue schema reused; no migration required.
- Express router test fixed in `c81c056`.

Fred confirmed all green for:

- `npm run build --workspace @kfit/shared`
- `npm run build --workspace @kfit/server`
- `node --test packages/shared/dist/catalogue/contracts.test.js`
- `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js`
- `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js`
- `npm run db:check`

## Current blockers

- Legal validation before production.
- Real off-server backup destination before production.

## Next task

Continue on `sprint-2/catalogue-foundation`, then start Sprint 2.2 — seed initial services/variants/components/policies.

Inspect first:

1. `packages/server/src/db/schema/catalogue.ts`
2. `packages/server/src/db/migrations/`
3. `packages/server/scripts/`
4. `exploration-cache/project/database-schema.md`
5. Notion page: K'FIT — Plan Projet Consolidé
6. Notion page: K'FIT — Étude de Faisabilité Consolidée
7. Notion page: K'FIT — Décisions Métier Consolidées
8. Notion Sprint 2 page

Keep S2.2 server/data-first. Do not implement landing page UI or admin catalogue CMS until seed/public-read behavior is validated.

## Ready-to-paste continuation prompt

```text
Continue K'FIT from Sprint 2.1 catalogue public API foundation closure on `sprint-2/catalogue-foundation`.

Do not rerun feasibility or Sprint 0/Sprint 1 planning. Sprint 1 auth foundation, password reset/recovery HTTP flow and Sprint 2.1 catalogue public API foundation are locally validated and closed.

First inspect:
- exploration-cache/active-session/context.md
- exploration-cache/active-session/current-task.md
- exploration-cache/active-session/next-actions.md
- exploration-cache/active-session/blockers.md
- exploration-cache/active-session/next-chat-handoff.md
- TASKS.md
- changelog.md
- packages/server/src/db/schema/catalogue.ts
- packages/server/src/db/migrations/
- packages/server/scripts/
- Notion page: K'FIT — Tableau de Bord Projet
- Notion page: K'FIT - Sprint 2 · Catalogue, services, forfaits et disponibilité

Next task:
Start Sprint 2.2 — seed initial services/variants/components/policies.

Respect workflow:
inspect → implement/commit → give Fred exact local Windows/Git Bash commands → Fred validates → diagnose/fix → update GitHub/Notion state.
```

# K'FIT — Next Chat Handoff

## Current objective

Sprint 2 — catalogue/service offers foundation is active on `sprint-2/catalogue-foundation`.

Do **not** restart feasibility, Sprint 0, Sprint 1 planning, auth closure, S2.1, S2.2 or S2.3. Sprint 1 auth foundation, password reset/recovery HTTP flow, S2.1 catalogue public API foundation, S2.2 catalogue seed foundation and S2.3 admin catalogue editing foundation are closed and locally validated.

## Execution rule still active

- Do **not** run npm, Docker, PostgreSQL, git clone/pull, migrations, pre-flight scripts, tests or project commands in the assistant runtime.
- Use connected GitHub and Notion for inspection, implementation and commits.
- When execution is required, provide exact Windows/Git Bash commands.
- Fred runs commands locally and returns output.
- Only mark something validated after Fred confirms successful local execution.
- Work one task at a time.

## Repository / branch

- Repository: `fredpatch/kfit-monorepo`
- Current branch: `sprint-2/catalogue-foundation`
- `main` and `sprint-2/catalogue-foundation` were aligned at validated S2.3 head `98e0a0f` before S2.4.
- `sprint-2/catalogue-foundation` is now ahead with S2.4 implementation and pending-validation docs.

## Current slice

S2.4 — public landing page catalogue consumption is implemented, awaiting Fred validation.

Implemented:

- `packages/client/src/catalogue/api/catalogue-api.ts`
- `packages/client/src/catalogue/components/PublicCataloguePage.tsx`
- public `/` route renders catalogue landing page;
- `/admin` route keeps existing admin login/session shell;
- React Query fetches `GET /catalogue/services`;
- French service cards show XAF price, availability, duration, capacity, components, variants and demand CTA;
- loading, empty and error states;
- auth provider scoped to admin path.

Fred should run:

```bash
git switch sprint-2/catalogue-foundation
git pull
npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

Optional smoke check:

```bash
npm run dev --workspace @kfit/client
```

Open `/` and `/admin`.

## Current blockers

- S2.4 local validation pending.
- Legal validation before production.
- Real off-server backup destination before production.

## After green validation

1. Mark S2.4 complete in TASKS/changelog/exploration-cache.
2. Mark Notion S2.4 task `Terminé` and update Sprint 2/dashboard.
3. Fast-forward `main` to validated S2.4 head as Fred requested.
4. Decide next slice: S2.5 capacity/waitlist controls or a small prospect request handoff slice if business priority changes.

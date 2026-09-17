# K'FIT — Next Chat Handoff

## Current objective

Sprint 2 — catalogue/service offers foundation is active on `sprint-2/catalogue-foundation`.

Do **not** restart feasibility, Sprint 0, Sprint 1 planning, auth closure, S2.1, S2.2, S2.3 or S2.4. Sprint 1 auth foundation, password reset/recovery HTTP flow, S2.1 catalogue public API foundation, S2.2 catalogue seed foundation, S2.3 admin catalogue editing foundation and S2.4 public landing page catalogue consumption are closed and locally validated.

## Execution rule still active

- Do **not** run npm, Docker, PostgreSQL, git clone/pull, migrations, pre-flight scripts, tests or project commands in the assistant runtime.
- Use connected GitHub and Notion for inspection, implementation and commits.
- When execution is required, provide exact Windows/Git Bash commands.
- Fred runs commands locally and returns output.
- Only mark something validated after Fred confirms successful local execution.
- Work one task at a time.

## Repository / branch

- Repository: `fredpatch/kfit-monorepo`
- Current Sprint branch: `sprint-2/catalogue-foundation`
- `main` should be fast-forwarded to the validated S2.4 closure head before the next feature slice continues.

## Validated Sprint 2 state

S2.1 — public catalogue API foundation:

- Shared catalogue contracts.
- Public route `GET /catalogue/services`.
- Server catalogue controller/service/repository/router/tests.
- Express app binding.

S2.2 — initial catalogue seed:

- Seeded services, variants, components and policy snapshots.
- `seed:catalogue` and `preflight:catalogue-seed` validated.

S2.3 — admin catalogue editing foundation:

- Admin list/create/update/publish/archive/reorder routes.
- Admin role, CSRF and same-origin protection.
- Service-level validation and tests.

S2.4 — public landing page catalogue consumption:

- Public `/` route renders catalogue landing page.
- `/admin` route keeps existing admin login/session shell.
- React Query fetches `GET /catalogue/services`.
- French service cards show XAF price, availability, duration, capacity, components, variants and demand CTA.
- Loading, empty and error states.
- Client typecheck and Vite production build validated by Fred.

## Current blockers

- Legal validation before production.
- Real off-server backup destination before production.

## Next decision

Start S2.5 capacity/waitlist controls unless business priority changes.

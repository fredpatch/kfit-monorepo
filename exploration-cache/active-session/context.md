# Session Context

> Date: 2026-08-25 | Slice: Sprint 2 — catalogue/service offers foundation

## Where we left off

Sprint 1 auth foundation is complete and locally validated. The post-closure deferred auth slice for password reset/recovery HTTP flow is also complete and locally validated, including the real SMTP/Mailpit HTTP/email preflight. Sponsor/Konny scope validation is treated as confirmed for execution, so Sprint 2 is active on `sprint-2/catalogue-foundation`.

## Pattern source

The reusable implementation patterns for K'FIT are recorded as Notion pages, not a local Markdown folder. Relevant sources for Sprint 2 include:

- K'FIT dashboard/project board
- K'FIT plan projet consolidé
- K'FIT étude de faisabilité consolidée
- K'FIT décisions métier consolidées
- Reusable pattern reference, especially Shared API Contracts, Domain Error Taxonomy and catalogue/reference-data style module boundaries

## Validated prior work

- Sprint 0 is closed.
- Sprint 1 auth foundation is closed and locally validated.
- Password reset/recovery HTTP flow is closed and locally validated.
- Sprint 2.1 catalogue public API foundation is closed and locally validated.
- Sprint 2.2 initial catalogue seed is closed and locally validated.

## Current Sprint 2 state

Sprint 2 is active on `sprint-2/catalogue-foundation`.

Validated in Sprint 2.1:

- Shared catalogue API contracts in `@kfit/shared`.
- Public catalogue route contract: `GET /catalogue/services`.
- Server catalogue module folder structure:
  - `controllers/`
  - `repositories/`
  - `routes/`
  - `services/`
  - `types/`
  - `tests/`
- Catalogue service snapshot assembly for services, variants, components and policies.
- Drizzle catalogue repository using existing Sprint 0 catalogue tables.
- Express public catalogue router.
- Optional `createServerApp` catalogue router binding.
- Express router test fix in `c81c056`.

Validated in Sprint 2.2:

- Deterministic seed data for three public K'FIT services.
- Variants, components and policy snapshots for public catalogue content.
- `seed:catalogue` script inserts expected counts: 3 services, 3 variants, 5 components, 3 policies.
- `preflight:catalogue-seed` validates idempotency and public API read model through the real Drizzle repository/service.
- Seed CLI/preflight environment loading fix ensures `.env` is loaded before `db/client` checks `DATABASE_URL`.

Fred confirmed all green for Sprint 2.2:

- `node --test packages/server/dist/db/seeds/catalogue.seed.test.js`
- `npm run seed:catalogue`
- `npm run preflight:catalogue-seed`
- `npm run db:check`

## Active constraints

- Do not run local project commands from ChatGPT/Codex runtime.
- Only mark validation after Fred provides successful local output.
- Legal validation is required before production.
- Keep native PostgreSQL on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

## Branch hygiene

- `main` was fast-forwarded to validated head `3cf4138` after Sprint 2.1 validation.
- `sprint-2/catalogue-foundation` was created from `main` for continuing Sprint 2.
- No further Sprint 2 work should be committed to `sprint-1/auth-foundation`.

## Next decision

Choose the next Sprint 2 slice:

1. S2.3 admin catalogue editing, if Konny/Fred need back-office service configuration first.
2. S2.4 public landing page catalogue consumption, if the priority is exposing the validated offers in the client UI first.

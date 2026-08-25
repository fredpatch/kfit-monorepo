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

Fred confirmed all green for:

- `npm run build --workspace @kfit/shared`
- `npm run build --workspace @kfit/server`
- `node --test packages/shared/dist/catalogue/contracts.test.js`
- `node --test packages/server/dist/modules/catalogue/tests/catalogue.service.test.js`
- `node --test packages/server/dist/modules/catalogue/tests/catalogue.express.test.js`
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

## Current S2.2 implementation pending validation

- Initial deterministic catalogue seed implemented.
- Seed content covers services, variants, components and policies.
- `preflight:catalogue-seed` validates idempotency and public API read model through the real Drizzle repository/service.
- This slice is not locally validated until Fred runs the commands and confirms green output.

# Session Context

> Date: 2026-09-17 | Slice: Sprint 2.4 — public landing page catalogue consumption

## Where we left off

Sprint 1 auth foundation is complete and locally validated. The deferred password reset/recovery HTTP flow is complete and locally validated. Sponsor/Konny scope validation is treated as confirmed for execution. Sprint 2 is active on `sprint-2/catalogue-foundation`.

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
- Sprint 2.3 admin catalogue editing foundation is closed and locally validated.
- Sprint 2.4 public landing page catalogue consumption is closed and locally validated.

## Current Sprint 2 state

Sprint 2 is active on `sprint-2/catalogue-foundation`.

S2.4 validated boundaries:

- client-only slice;
- public `/` route consumes `GET /catalogue/services`;
- `/admin` keeps the existing admin auth shell;
- public page displays French service cards with XAF pricing, availability, duration, capacity, components, variants and demand CTA;
- loading, empty and error states are present;
- auth provider/bootstrap checks are scoped to `/admin` only;
- no server/schema/prospect workflow changes.

Fred confirmed green:

```bash
npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

## Active constraints

- Do not run local project commands from ChatGPT/Codex runtime.
- Only mark validation after Fred provides successful local output.
- Legal validation is required before production.
- Keep native PostgreSQL on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

## Branch hygiene

- `main` and `sprint-2/catalogue-foundation` were identical at validated S2.3 head `98e0a0f` before S2.4 started.
- After S2.4 closure docs, fast-forward `main` to the validated S2.4 head.
- Continue Sprint 2 work on `sprint-2/catalogue-foundation` unless a new branch boundary is explicitly chosen.

## Next boundary

Start S2.5 capacity/waitlist controls unless business priority changes.

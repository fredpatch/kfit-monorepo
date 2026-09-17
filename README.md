# K'FIT Monorepo

Web platform for K'FIT coaching operations.

## Status

Sprint 3 in progress on `sprint-3`. Current slice and workflow state: see [`TASKS.md`](TASKS.md).

## Workspaces

- `packages/shared` — shared contracts, schemas and types
- `packages/server` — Node.js + Express + TypeScript API (Drizzle ORM, PostgreSQL 16)
- `packages/client` — React + TypeScript + Vite application

## Quick start

```bash
cp .env.example .env        # fill secrets locally, never commit
npm install
npm run db:up               # Docker PostgreSQL on host port 5433
npm run db:migrate
npm run dev:api
npm run dev:client
```

Validation: `npm run typecheck`, `npm run build`, `npm test`, `npm run db:check`, `npm run test:integration` (local DB).

## AI-assisted workflow

- [`PROJECT.md`](PROJECT.md) — K'FIT facts: stack, layout, commands, runtime rules, docs map
- [`AGENTS.md`](AGENTS.md) — portable agent rules (Agent Kit, version in `.agent-kit-version`)
- [`WORKFLOW.md`](WORKFLOW.md) — portable Planner → Implementer → Reviewer → QA → developer gates
- `.github/agents/`, `.github/skills/` — portable agents and skills (do not edit per project)
- `exploration-cache/` — schema, state machines, decisions, sprint specs
- Notion — backlog and sprint history

## Operating rules

- Server-first; Service → Controller → Route.
- Business rules explicit, server-authoritative and tested.
- Reuse the Notion *Reusable Implementation Patterns & Blueprints* before reimplementing known logic.

## Legacy website

`fredpatch/kfit_website` is reference material only.

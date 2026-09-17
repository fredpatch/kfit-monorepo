# PROJECT.md — K'FIT

Project-specific facts for AI agents. `AGENTS.md`, `WORKFLOW.md`, `.github/agents` and `.github/skills` come unchanged from the portable Agent Kit (version in `.agent-kit-version`). Put project facts here, not there.

---

## Identity

```text
Name        K'FIT
Purpose     Coaching operations platform: public catalogue, request/prospect intake,
            qualification, waitlist, admin management
Users       public visitors; one privileged coach/admin in V1
```

## Stack

```text
Runtime           Node >= 22 (tests use `node --test` glob patterns)
Package manager   npm workspaces — never yarn/pnpm/bun
Backend           Express 5 + TypeScript (ESM)
Frontend          React 18 + Vite 7 + TanStack Query + axios
Test framework    node:test (shared, server); no client test framework
```

## Layout

```text
packages/shared   @kfit/shared — contracts, schemas, types, stable error codes
packages/server   @kfit/server — HTTP API, domain services, Drizzle schema/migrations, scripts
packages/client   @kfit/client — public catalogue, request form, admin UI
Shared contracts  packages/shared → consumers: packages/server, packages/client
Server modules    packages/server/src/modules/<name>/ (auth, catalogue, requests, …)
```

## Architecture

```text
Backend layering   Service → Controller → Route/Middleware; business rules in services
Slice order        shared contracts → service → controller → route/middleware
                   → server tests → client (French UI) → developer validation
Conventions        server-first; typed domain errors (e.g. REQUEST_*); server-authoritative gating;
                   audit events without PII; client never shows raw error codes
```

## Data

```text
Database          PostgreSQL 16 (Docker, postgres:16-alpine)
Local target      localhost:5433 (Docker). Native PostgreSQL owns 5432 — never target it by accident.
ORM / migrations  Drizzle ORM + drizzle-kit; migrations in packages/server/src/db/migrations
Generated files   packages/server/src/db/migrations/** (SQL + meta snapshots), packages/*/dist/**
Seeds             npm run seed:catalogue (ask tier)
```

## Security

```text
Authentication    access + refresh JWT in HttpOnly cookies; refresh bound to DB session + token family;
                  OTP for recovery, unknown/suspicious device and sensitive actions; trusted devices
Authorization     single coach/admin role in V1 (schema future-role-ready); enforced server-side
CSRF / origin     CSRF on cookie-authenticated mutations; origin check on public writes
Public writes     origin check + in-memory per-IP limit + honeypot + minimum completion time
Sensitive data    passwords, OTPs, token/session/device digests, prospect PII — never logged or in audit metadata
```

## Commands

Validation set (root):

```text
typecheck           npm run typecheck          (client typecheck builds shared first)
build               npm run build
unit tests          npm test                   (shared + server, no DB)
integration tests   npm run test:integration   (server, real local DB)
schema check        npm run db:check
lint                not configured
client tests        none — client acceptance = typecheck + build + developer browser check
```

Tiers (mirrored in `.vscode/settings.json`):

```text
auto    git status · git diff · git log · git show · git branch --show-current
        npm run typecheck · npm run build · npm test · npm run db:check
ask     npm run db:migrate · npm run db:generate · npm run test:integration
        npm run seed:* · npm run preflight:* · npm run db:up / db:down · docker compose …
        npm install / ci / any lockfile change · git add · git commit
        npm run dev:api · npm run dev:client (QA runtime checks; stop afterwards)
never   npm run db:reset · docker compose down -v  (+ AGENTS §4 list)
```

## Runtime

```text
Local VS Code agents     auto tier only; ask tier with explicit approval
ChatGPT / Codex cloud    never run project commands — prepare changes and commands for Fred
Who closes validation    Fred's local execution only
```

## Docs

```text
Active state          TASKS.md

Specs                 exploration-cache/tasks/sprint-N.md

Business rules        exploration-cache/project/
                      - relational-contract.md
                      - state-machines.md
                      + sprint specs

Schema / data model   exploration-cache/project/database-schema.md
                      exploration-cache/project/drizzle-layout.md

State machines        exploration-cache/project/state-machines.md

Decisions log         exploration-cache/project/decisions.md
                      newest first

Gotchas               exploration-cache/technical/gotchas.md

Environment docs      docs/
                      preflight, Docker environments, auth contracts

Project tracker       Notion
                      "K'FIT — Tableau de Bord Projet"
                      authoritative for roadmap, backlog, sprint history,
                      project-management state and acceptance notes

Pattern library       Notion
                      "AI Project Kickoff — Reusable Implementation Patterns & Blueprints"
                      engineering reference only — never authoritative
                      for K'FIT business rules

Pattern access        Preferred:
                      use the configured Notion connector/MCP when available

                      Fallback:
                      use pattern content explicitly supplied by Fred
                      or by the project discussion/handoff

                      If a referenced pattern cannot be accessed:
                      report PATTERN REFERENCE NOT AVAILABLE
                      and continue only if the implementation plan can
                      be produced safely without pretending the pattern
                      was inspected

Pattern usage         Reuse mechanisms, safeguards and invariants.
                      Never copy historical project names, roles,
                      routes, database names or domain vocabulary
                      without confirming they belong in K'FIT.

Changelog             changelog.md

Session history       exploration-cache/sessions/
```

## Language

```text
UI              French (public and admin)
Code / ids      English
Commits         English — type(scope): description
Technical docs  English
```

## Branches

```text
Protected   main
Active      sprint-3
Naming      sprint-N (one branch per sprint, created from validated main)
```

## Developer

```text
Name        Fred
Approves    plans, migrations, dependencies, commits, merges, deployment
Validates   functional acceptance locally (commands, browser, DBeaver inspection)
```

## Gotchas

- Docker PostgreSQL is on host 5433; native PostgreSQL on 5432. Check `DATABASE_URL` before any DB command.
- `requests.repository.integration.ts` cleanup deletes prospects by fixed WhatsApp `+24100000000` — run only against a disposable local DB.
- Vite dev proxy must include every public API prefix (`/auth`, `/catalogue`, `/requests`, `/health`) and preserve the forwarded host for origin-protected mutations.
- Per-IP rate limiting is process-local; `trust proxy` is not yet configured for staging/production.
- Development is on Windows: watch CRLF/LF churn and path separators.

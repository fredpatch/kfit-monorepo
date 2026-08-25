# K'FIT Monorepo

Web platform for K'FIT coaching operations.

## Current phase

Sprint 0 — Initialization. No functional V1 feature code is considered started until Sprint 0 foundations are validated.

## Workspaces

- `packages/shared` — shared contracts, schemas and types
- `packages/server` — Node.js + Express + TypeScript API
- `packages/client` — React + TypeScript + Vite application

## Project operating rules

- Server-first implementation.
- Service → Controller → Route for backend modules.
- Business rules remain explicit and testable.
- Reuse patterns from the Notion reference **AI Project Kickoff — Reusable Implementation Patterns & Blueprints** before reimplementing known logic.
- `exploration-cache/` is the persistent project memory layer.
- Notion is the primary backlog and sprint source of truth.

## Legacy website

The previous `fredpatch/kfit_website` repository is reference material only and is not the application base for this monorepo.

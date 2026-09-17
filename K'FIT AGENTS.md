# K'FIT Repository Facts

This section belongs at the top of the repository `AGENTS.md`, before the universal operating rules.

## Project

K’FIT is a monorepo containing:

```text
apps/
  client/
  server/

packages/
  shared/
```

Primary goals:

- public fitness-service catalogue
- authentication and account flows
- admin management
- future booking/capacity/waitlist workflows

---

## Package Management

Package manager:

```text
npm
```

Workspace model:

```text
npm workspaces
```

Do not use Yarn, pnpm, Bun, or another package manager.

Any dependency or lockfile change requires explicit approval.

---

## Applications

### `apps/client`

Frontend application.

Technology:

```text
React
TypeScript
Vite
```

Responsibilities include:

- public catalogue
- authenticated client experience
- admin-facing UI where currently implemented
- API consumption
- UI state and validation

---

### `apps/server`

Backend application.

Technology:

```text
Node.js
TypeScript
```

Responsibilities include:

- HTTP API
- authentication
- authorization
- catalogue business logic
- admin operations
- future capacity/waitlist rules

Business rules must not rely solely on frontend enforcement.

---

### `packages/shared`

Shared contracts consumed by server and client.

Typical contents:

- API route definitions
- request/response types
- shared schemas/types
- common contracts

A change to `packages/shared` is a **shared-package change** and therefore non-trivial.

Validate all consumers after changing it.

---

## Authentication / Security

Authentication work from Sprint 1 has already been validated.

Do not casually refactor authentication while working on unrelated features.

Security-sensitive work includes:

- session handling
- CSRF
- password recovery
- authentication
- permissions
- protected admin endpoints

Any such change requires impact analysis and explicit approval.

---

## Validation Commands

Inspect workspace scripts before running commands.

Known validation flow includes:

```bash
npm run typecheck
npm run build
```

The current workspace validation has previously executed package-level checks including:

```text
@kfit/shared build
@kfit/server typecheck
@kfit/client typecheck
@kfit/client build
```

If test or lint scripts exist, include them in the validation flow.

CI configuration takes precedence when it defines additional required checks.

---

## Git

Primary protected branch:

```text
main
```

Never implement directly on `main` without explicit authorization.

Current Sprint 2 development branch:

```text
sprint-2/catalogue-foundation
```

Do not merge, rebase, push, or commit unless explicitly authorized under the Git rules in `AGENTS.md`.

---

## Current Documentation

Agent state should be derived from:

```text
AGENTS.md
TASKS.md
README.md
package.json
workspace package.json files
Git history
```

If additional architecture or business-rule documents are added later, list them here.

---

## Language

Unless a task explicitly requires otherwise:

```text
Code / identifiers → English
Git commits → English
Technical documentation → English
UI strings → follow existing K'FIT product language
```

Do not silently translate existing UI terminology.

---

## Current Development Rules

For Sprint 2:

- work in small feature slices
- preserve already validated slices
- do not reopen previous sprint work without a regression reason
- shared-contract changes require validation of server and client consumers
- compilation/build success does not equal functional acceptance
- Fred performs local functional validation before a slice is considered closed

---

## Completion Rule

A Sprint 2 item is not fully closed until:

```text
✅ implementation complete
✅ automated validation complete
✅ diff reviewed
✅ Fred validates locally
```

Agents must never mark Fred's validation complete on his behalf.

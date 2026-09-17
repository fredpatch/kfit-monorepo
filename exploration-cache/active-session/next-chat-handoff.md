# K'FIT — Next Chat Handoff

## Current objective

Sprint 2 is closed and locally validated. Do not reopen catalogue implementation unless a regression is discovered.

## Validated work

- Sprint 0 closed.
- Sprint 1 auth closed.
- Password recovery closed.
- Sprint 2.1 public catalogue API closed.
- Sprint 2.2 catalogue seed closed.
- Sprint 2.3 admin catalogue editing closed.
- Sprint 2.4 public landing page catalogue consumption closed.
- Sprint 2.5 server capacity/waitlist controls closed.
- Sprint 2.6 admin capacity/waitlist UI closed and locally validated on 2026-09-17.

## S2.6 validation confirmed

- real local API/bootstrap/login path works;
- admin catalogue services load;
- open/unlimited save works;
- limited positive-integer capacity save works;
- waitlist enabled + waitlist-only save works;
- invalid combinations are blocked;
- archived services are read-only;
- refresh restores persisted values;
- public `/` catalogue remains functional and reflects saved availability;
- client typecheck/build are green.

## Local-development fix included

- real PostgreSQL/Drizzle dev API launcher;
- root `.env` loading;
- Vite proxy for `/auth`, `/catalogue`, `/admin/catalogue`, `/health`;
- explicit bootstrap-status error state;
- no seeded/default admin credentials.

## User-pushed agent files

Retained on the Sprint 2 branch:
- `.github/agents/implementer.agent.md`
- `.github/agents/planner.agent.md`
- `AGENTS.md`
- `K'FIT AGENTS.md`
- `K'FIT TASKS.md`

Unrelated dependency-lock churn from that documentation push was neutralized before Sprint 2 merge.

## Next implementation boundary

Sprint 3 — M2 demandes, prospects, qualification et liste d'attente.

First selected backlog task: **Public request form (name + phone, per service)**.

Before implementation:
1. inspect Sprint 3 backlog and reusable patterns;
2. create Sprint 3 execution page/cache/branch;
3. define server request/prospect contract and invariants first;
4. implement Service → Controller → Route and validate server;
5. only then integrate the public form client.

## Remaining production blockers

- legal validation for applicable Gabon requirements;
- true encrypted off-server backup destination.

## Execution rule

Do not run project commands in assistant runtime. Fred validates locally. Only locally confirmed work is marked validated.

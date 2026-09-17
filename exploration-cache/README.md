# exploration-cache

Persistent project knowledge for agents and developers.

| Folder | Content | Authority |
|---|---|---|
| `project/` | database schema, relational contract, state machines, Drizzle layout, decisions | business/architecture reference |
| `technical/` | gotchas and environment traps | engineering reference |
| `tasks/` | sprint specifications (`sprint-N.md`) and closed sprint summaries | slice scope |
| `sessions/` | dated session logs | history only |

Active execution state (branch, slice, workflow state, blockers, handoff) lives **only** in `/TASKS.md`. Do not recreate per-session state files here.

Record durable decisions in `project/decisions.md` (newest first).

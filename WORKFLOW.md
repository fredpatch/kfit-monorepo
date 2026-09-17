# WORKFLOW.md

How a slice moves from request to closure. Portable across projects.
Permissions and safety: `AGENTS.md`. Project facts: `PROJECT.md`. Active state: `TASKS.md`.

"Developer" below means the person named in `PROJECT.md §Developer`.

---

## 1. Flow

```text
Planner ──plan──▶ Gate 1: developer approves
   ▲                     │
   │ scope escalation    ▼
   └──────────────── Implementer ──▶ Reviewer ──pass──▶ QA ──pass──▶ Gate 2: developer validates
                          ▲             │                │                    │
                          └──fixes──────┴────failures────┴──── rejected ──────┘
                                                                               │
                                                             Gate 3: developer says "commit"
                                                                               │
                                                                 commit → TASKS.md sync → tracker sync
```

No stage is skipped because a change looks simple. For trivial work (AGENTS §6) Planner and Implementer may be the same session, but review, validation and the developer's gates still apply.

---

## 2. Roles

| Role        | Owns                                                                                  | Never                          |
| ----------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| Planner     | inspection, impact analysis, acceptance criteria, slices, change budget               | edits files                    |
| Implementer | approved code + tests, focused validation, implementation report                      | expands scope, approves itself |
| Reviewer    | independent diff/business-rule/security/regression review                             | fixes code silently            |
| QA          | acceptance-criteria evidence, runtime/edge-case checks                                | edits production code          |
| Developer   | business rules, plan approval, migrations, functional acceptance, commit/merge/deploy | —                              |

---

## 3. Workflow states

Recorded in `TASKS.md` → `Workflow state`.

```text
PLANNING → AWAITING_PLAN_APPROVAL → APPROVED_FOR_IMPLEMENTATION → IMPLEMENTING
→ AWAITING_REVIEW ⇄ CHANGES_REQUIRED
→ AWAITING_QA → QA_FAILED (→ CHANGES_REQUIRED)
→ AWAITING_HUMAN_VALIDATION → VALIDATED → READY_FOR_COMMIT → COMMITTED → CLOSED
BLOCKED (from any state, with reason)
```

Only the developer moves a slice to `APPROVED_FOR_IMPLEMENTATION`, `VALIDATED`, `READY_FOR_COMMIT` or `CLOSED`.

---

## 4. Sources of truth

| Source                                                  | Authoritative for                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| Repository                                              | code, tests, migrations, scripts, CI                              |
| `AGENTS.md`                                             | permissions, safety, gates, validation integrity                  |
| `TASKS.md`                                              | current branch, active slice, workflow state, next step, blockers |
| `PROJECT.md`                                            | stack, layout, commands, runtime rules, doc locations             |
| Business/architecture docs (`PROJECT.md §Docs`)         | business rules, schema, state machines, decisions                 |
| External tracker (`PROJECT.md §Docs`, e.g. Notion/Jira) | roadmap, backlog, sprint history, acceptance notes                |
| Reusable Patterns library                               | engineering reference only                                        |

Any two sources disagree → **STOP** and report:

```text
Source A says … / Source B says … / Repository shows … / Decision required …
```

---

## 5. Stage 1 — Planning

Planner output:

```text
Goal · Current state · Business rules (with source) · Dependencies
Affected layers · Expected files · Consumers · Security impact · Data impact
Reusable patterns + adaptations · Acceptance criteria · Validation plan
Change budget · Risks · Deferred / out of scope · Implementation slices
```

Slice order: as defined in `PROJECT.md §Architecture`. Fallback: shared contract → domain/service → transport (controller/route) → backend tests → frontend → validation.

Planner stops at `AWAITING_PLAN_APPROVAL`.

## 6. Gate 1 — Plan approval

Only explicit wording counts ("Approved", "Go ahead with <slice>", "Implement this plan"). Silence, praise or a question is not approval.

## 7. Stage 2 — Implementation

Handoff payload from Planner: task id, approved scope, business rules, expected files, acceptance criteria, validation plan, change budget, risks, out of scope.

Implementer re-reads `AGENTS.md` + `TASKS.md`, checks branch and tree, runs baseline, then implements slice by slice (inspect → edit → focused check).

Scope/budget exceeded, unexpected schema change, new dependency, security-model change or rule ambiguity → back to Planner → developer.

Implementer finishes with the AGENTS §13 report and moves to `AWAITING_REVIEW`.

## 8. Stage 3 — Review

Reviewer inspects the real diff and repository, not only the report.

Results: `REVIEW PASSED` · `REVIEW PASSED WITH NOTES` · `CHANGES REQUIRED` · `BLOCKED`.

Findings are classified BLOCKER / MAJOR / MINOR / NOTE. Only confirmed findings go back to Implementer, who fixes only those and returns to Reviewer. Loop breaker (AGENTS §8) applies.

## 9. Stage 4 — QA

QA reports per criterion:

```text
criterion → check performed → expected → actual → PASS | FAIL | NOT VALIDATED
```

Results: `QA PASSED` · `QA PASSED WITH LIMITATIONS` · `QA FAILED` · `QA BLOCKED`.

UI criteria without browser tooling are `NOT VALIDATED` and go to the developer explicitly.

QA passed → `AWAITING_HUMAN_VALIDATION`, with a short checklist the developer can execute locally.

## 10. Gate 2 — Developer functional validation

The developer runs the checklist (commands, browser flow, DB inspection). Outcomes: accepted → `VALIDATED`; rejected → `CHANGES_REQUIRED`.

## 11. Gate 3 — Commit

After `VALIDATED`, on the developer's explicit "commit":

- re-check branch, tree and final diff
- stage only slice files
- commit `type(scope): description`

Push and merge are separate approvals.

## 12. State sync

After commit, update `TASKS.md` (state, validation evidence summary, commit hash, next slice) and prepare the tracker update:

```text
status · delivered · developer validation · key decisions · commit · limitations · next slice
```

Example tracker status mapping (adapt names in `PROJECT.md`):

```text
PLANNING, AWAITING_PLAN_APPROVAL                        → À faire
APPROVED…, IMPLEMENTING, AWAITING_REVIEW/QA, CHANGES…   → En cours
AWAITING_HUMAN_VALIDATION                               → En validation
VALIDATED, COMMITTED, CLOSED                            → Terminé
BLOCKED                                                  → Bloqué
```

No diffs in the tracker. Record durable decisions in the decisions log (`PROJECT.md §Docs`).

## 13. Sprint closure

Closed only when every slice is `CLOSED`, tracking is synced, open blockers are documented, and the developer approves closure.

## 14. Handoff block

Every agent-to-agent handoff and every interrupted session carries:

```text
Branch · Slice · Workflow state · Approved goal · ✅ Done · ⏳ Pending
Acceptance criteria · Files/layers · Validation done · Not validated
Assumptions · Out of scope · Risks/blockers · Next action (agent or developer)
```

Persist it in `TASKS.md` → `Handoff`. Never rely on hidden chat context.

## 15. Pattern feedback

After a significant validated slice, note in the report whether a reusable mechanism, improvement or anti-pattern emerged. Updating the shared pattern library is a separate, reviewed task.

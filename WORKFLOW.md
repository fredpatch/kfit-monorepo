# WORKFLOW.md

## 1. Purpose

This file defines the standard AI-assisted development workflow used across projects.

It coordinates:

- Planner
- Implementer
- Reviewer
- QA
- Human developer
- Git
- `TASKS.md`
- Notion project tracking
- reusable implementation patterns and blueprints

`AGENTS.md` defines what agents are allowed to do.

`WORKFLOW.md` defines how work moves from one stage to another.

---

# 2. Core Principle

The workflow is:

```text
Plan
→ Approve
→ Implement
→ Review
→ Validate
→ Human Acceptance
→ Commit
→ Project Sync
```

No agent may skip a stage because the implementation appears simple.

Human approval remains required at defined gates.

---

# 3. Responsibilities

## Planner

Owns:

- repository inspection
- task understanding
- impact analysis
- reusable-pattern discovery
- dependency analysis
- implementation planning
- acceptance-criteria definition
- risk identification

Does not modify implementation files.

---

## Implementer

Owns:

- approved code changes
- scoped tests
- focused validation
- implementation reporting

Does not:

- redefine requirements
- expand scope silently
- approve its own implementation
- mark human acceptance complete

---

## Reviewer

Owns:

- independent diff review
- business-rule verification
- architecture review
- security review
- regression analysis
- scope verification

Does not silently fix implementation.

---

## QA

Owns:

- automated validation
- acceptance-criteria verification
- runtime checks
- edge-case verification
- regression evidence

Does not modify production implementation code.

---

## Human Developer

Owns:

- business decisions
- architecture approval
- implementation-plan approval
- migration approval
- scope changes
- final functional acceptance
- commit approval
- merge approval
- deployment approval

---

# 4. Sources of Truth

Use each source for its intended purpose.

## Repository

Authoritative for:

- current code
- tests
- migrations
- executable behavior
- package configuration
- CI configuration

---

## `AGENTS.md`

Authoritative for:

- agent permissions
- safety constraints
- Git rules
- validation integrity
- DB safety
- approval gates

---

## `TASKS.md`

Authoritative for:

- currently active execution state
- current branch
- active task/slice
- completed implementation work
- pending work
- validation status
- next concrete step

It should remain concise.

Do not turn `TASKS.md` into a full project-history document.

---

## Project documentation

Examples:

```text
ARCHITECTURE.md
BUSINESS_RULES.md
DECISIONS.md
docs/
```

Authoritative for:

- architecture
- domain rules
- technical decisions
- state machines
- invariants

---

## Notion

When used by the project, Notion is authoritative for:

- roadmap
- sprint planning
- project backlog
- project-management state
- project traceability
- development history
- acceptance notes

Notion must not override executable repository facts.

If Notion and repository state conflict:

**STOP and report the inconsistency.**

---

## Reusable Implementation Patterns & Blueprints

Authoritative only as engineering reference.

Used for:

- reusable implementation mechanisms
- known safeguards
- transaction strategies
- security patterns
- concurrency patterns
- prior implementation evidence

Never treat reusable patterns as project-specific business rules.

---

# 5. Workflow State Model

Every active task should be in one of these states:

```text
PLANNING
AWAITING_PLAN_APPROVAL
APPROVED_FOR_IMPLEMENTATION
IMPLEMENTING
AWAITING_REVIEW
CHANGES_REQUIRED
AWAITING_QA
QA_FAILED
AWAITING_HUMAN_VALIDATION
VALIDATED
READY_FOR_COMMIT
COMMITTED
CLOSED
BLOCKED
```

Do not invent alternate states unless the project requires them.

---

# 6. Stage 1 — Planning

The Planner receives:

```text
active task
project context
TASKS.md
AGENTS.md
relevant project docs
repository state
reusable-pattern references
```

The Planner must return:

```text
Goal
Current state
Business rules
Dependencies
Affected layers
Expected files
Security impact
Data impact
Reusable patterns
Change budget
Acceptance criteria
Validation plan
Risks
Deferred / out of scope
Implementation slices
```

For non-trivial work:

```text
PLANNING
→ AWAITING_PLAN_APPROVAL
```

The Planner must stop.

---

# 7. Gate 1 — Human Plan Approval

The human developer reviews:

- task interpretation
- business rules
- proposed architecture
- scope
- file/layer impact
- risks
- migration needs
- reusable-pattern adaptations

Possible outcomes:

```text
Approve
Request changes
Reject
Defer
```

Only explicit approval allows implementation.

Examples:

```text
Approved.
Proceed with S3.1.
Implement this plan.
Go ahead with this slice.
```

Silence is not approval.

An agent-generated plan never approves itself.

On approval:

```text
AWAITING_PLAN_APPROVAL
→ APPROVED_FOR_IMPLEMENTATION
```

---

# 8. Planner → Implementer Handoff

Required handoff payload:

```text
Task ID

Approved goal

Approved scope

Business rules

Affected layers

Expected files

Reusable patterns referenced

Acceptance criteria

Validation requirements

Change budget

Known risks

Explicitly out of scope
```

The Implementer must re-read:

```text
AGENTS.md
TASKS.md
```

before starting.

Do not rely only on chat history.

---

# 9. Stage 2 — Implementation

Before editing, the Implementer:

1. checks branch
2. checks `git status`
3. checks for unrelated changes
4. runs baseline validation when practical
5. confirms approved scope still matches repository reality

Then:

```text
APPROVED_FOR_IMPLEMENTATION
→ IMPLEMENTING
```

Implementation proceeds in small coherent slices.

For each slice:

```text
inspect
→ edit
→ focused validation
→ inspect result
```

If implementation exceeds the approved scope or change budget:

**STOP and return to Planner.**

Do not expand scope automatically.

---

# 10. Implementation Completion Report

When implementation is complete, the Implementer reports:

```text
Files changed

Behavior implemented

Business rules applied

Reusable patterns used

Pattern adaptations / deviations

Validation executed

Not validated

Assumptions made

Deferred / out of scope

Risks

Suggested commit
```

The Implementer then stops.

State:

```text
IMPLEMENTING
→ AWAITING_REVIEW
```

---

# 11. Implementer → Reviewer Handoff

Required payload:

```text
Approved plan

Implementation report

Git diff

Acceptance criteria

Business-rule references

Validation results

Known limitations
```

The Reviewer should inspect the actual repository state, not rely solely on the Implementer's report.

---

# 12. Stage 3 — Review

The Reviewer independently evaluates:

- scope compliance
- business-rule correctness
- architecture
- security
- permissions
- concurrency
- data integrity
- tests
- regressions
- diff cleanliness

Possible results:

```text
REVIEW PASSED
REVIEW PASSED WITH NOTES
CHANGES REQUIRED
BLOCKED
```

If changes are required:

```text
AWAITING_REVIEW
→ CHANGES_REQUIRED
```

Return only confirmed findings to Implementer.

If review passes:

```text
AWAITING_REVIEW
→ AWAITING_QA
```

---

# 13. Review Fix Loop

When Reviewer sends work back:

```text
Reviewer
→ Implementer
→ Reviewer
```

The Implementer must only address confirmed findings.

Do not use review feedback as permission for unrelated cleanup.

After fixes:

- run relevant validation
- update implementation report
- return to Reviewer

Maximum repeated fix attempts should follow the loop-breaker rule in `AGENTS.md`.

---

# 14. Reviewer → QA Handoff

Required payload:

```text
Approved acceptance criteria

Review result

Known risks

Known limitations

Validation already performed

Relevant test/runtime targets
```

QA must independently verify observable behavior.

---

# 15. Stage 4 — QA

QA validates:

```text
acceptance criteria
focused tests
package tests
consumer tests
typecheck
lint
build
CI-equivalent commands
runtime/API/UI behavior
relevant edge cases
```

Possible outcomes:

```text
QA PASSED
QA PASSED WITH LIMITATIONS
QA FAILED
QA BLOCKED
```

If QA fails:

```text
AWAITING_QA
→ QA_FAILED
→ Implementer
```

Confirmed failures return to Implementer.

If QA passes:

```text
AWAITING_QA
→ AWAITING_HUMAN_VALIDATION
```

---

# 16. QA Evidence

For every acceptance criterion report:

```text
Criterion
Expected behavior
Check performed
Actual result
PASS / FAIL / NOT VALIDATED
```

Compilation alone does not satisfy behavioral acceptance criteria.

---

# 17. Gate 2 — Human Functional Validation

After QA, the developer performs project-appropriate validation.

Examples:

- browser workflow
- API smoke test
- business-flow check
- UI behavior
- persistence check
- role/permission check

Only the human developer may declare:

```text
VALIDATED
```

Agents must never assume human acceptance.

Possible outcomes:

```text
Accepted
Rejected
Needs correction
```

If correction is required:

```text
AWAITING_HUMAN_VALIDATION
→ CHANGES_REQUIRED
→ Implementer
```

---

# 18. Gate 3 — Commit Approval

After human acceptance:

```text
VALIDATED
→ READY_FOR_COMMIT
```

Before commit:

- inspect final `git diff`
- verify branch
- verify working tree
- verify no unrelated files
- verify no secret exposure
- confirm commit message

Agent may commit only with explicit authorization.

Example:

```text
Commit this slice.
```

After successful commit:

```text
READY_FOR_COMMIT
→ COMMITTED
```

Push/merge remain separate approvals.

---

# 19. Project-State Sync

After a validated/committed slice, synchronize project tracking.

## `TASKS.md`

Update:

```text
completed
validation
commit
pending
next step
```

Do not retain excessive historical detail.

---

## Notion

When Notion is used, update the corresponding project/sprint state with:

```text
task/slice status

what was delivered

developer validation status

important implementation decisions

commit reference

known limitations

next planned slice
```

Do not copy full Git diffs into Notion.

Notion should preserve project traceability, not implementation noise.

---

# 20. Notion Sync Authority

Agents may prepare a Notion update automatically.

Agents should only mark a task complete after required human acceptance.

Recommended statuses:

```text
À faire
En cours
En validation
Terminé
Bloqué
```

Mapping example:

```text
PLANNING / AWAITING_PLAN_APPROVAL
→ À faire

IMPLEMENTING / AWAITING_REVIEW / AWAITING_QA
→ En cours

AWAITING_HUMAN_VALIDATION
→ En validation

VALIDATED / COMMITTED / CLOSED
→ Terminé

BLOCKED
→ Bloqué
```

Adapt status names to the existing project database.

---

# 21. Sprint / Milestone Closure

A sprint or milestone is closed only when:

- all required slices are validated
- required commits are complete
- project tracking is synchronized
- unresolved blockers are explicitly documented
- the developer approves closure

Do not close a sprint because the last code change was committed.

---

# 22. Handoff Format

Every agent-to-agent handoff should include:

```text
Project

Branch

Task / Slice

Current workflow state

Approved goal

✅ Completed

⏳ Pending

Business rules

Acceptance criteria

Files / layers affected

Validation completed

Not validated

Reusable patterns referenced

Assumptions

Deferred / out of scope

Risks / blockers

Next agent action
```

Do not depend on hidden chat context.

---

# 23. Interrupted Session Protocol

If work stops unexpectedly, preserve state before resuming.

Minimum handoff:

```text
Branch
Task
Workflow state
Last completed action
Files modified
Validation completed
Known failures
Pending decision
Next concrete step
```

Persist it in:

```text
TASKS.md
```

or the project's designated handoff note.

Notion may receive the broader project-level update afterward.

---

# 24. Conflict Protocol

If any two authoritative sources disagree:

```text
STOP
```

Report:

```text
Source A says:
...

Source B says:
...

Observed repository state:
...

Decision required:
...
```

Do not silently reconcile conflicts.

---

# 25. Scope Escalation

Return to Planner if implementation reveals:

- unexpected schema changes
- significant new dependency
- architectural change
- materially larger file count
- security-model change
- permission-model change
- new external integration
- business-rule ambiguity
- unexpected cross-module impact

Flow:

```text
Implementer
→ Planner
→ Human Approval
→ Implementer
```

---

# 26. Reusable Pattern Feedback Loop

The reusable pattern library should evolve from completed projects.

After a significant implementation is validated, evaluate:

```text
Did we discover a reusable mechanism?

Did we improve an existing pattern?

Did we identify an alternative implementation?

Did multiple patterns form a reusable blueprint?

Did we discover an anti-pattern?
```

Do not automatically modify the shared library during feature development.

Pattern-library extraction is a separate reviewed task.

---

# 27. Standard End-to-End Flow

```text
Notion / Backlog / Request
          │
          ▼
       Planner
          │
      impact plan
          │
          ▼
   Human approval
          │
          ▼
     Implementer
          │
      code + tests
          │
          ▼
       Reviewer
       │       │
    issues    pass
       │       │
       ▼       ▼
 Implementer   QA
               │
          tests / smoke
               │
               ▼
             Fred
       functional validation
               │
               ▼
          Commit approval
               │
               ▼
          Git commit
               │
               ▼
     TASKS.md + Notion sync
               │
               ▼
           Next slice
```

---

# 28. Minimal Workflow Rule

Do not create unnecessary agent bureaucracy.

For very small tasks, roles may be compressed only when permitted by `AGENTS.md`.

However:

- implementation must still be reviewed
- validation must still occur
- human acceptance remains required when applicable
- destructive or security-sensitive work must never skip approval gates

---

# 29. Workflow Success Criteria

The agent workflow is working correctly when the developer can provide a high-level task and the system can reliably maintain:

```text
what are we building?
what is already done?
what is approved?
what changed?
what passed?
what failed?
what remains?
what requires human action?
what is the next concrete step?
```

without repeatedly reconstructing project context from chat history.

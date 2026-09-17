---
name: database-safety
description: Analyze, implement, review, or validate database-related changes safely. Use for schema changes, migrations, constraints, indexes, transactions, concurrency, idempotency, backfills, destructive operations, ORM-generated migrations, and database-dependent integration tests.
---

# Database Safety

Use this skill whenever a task touches:

- schema definitions
- migrations
- database constraints
- indexes
- transactions
- concurrency
- idempotency
- backfills
- seed data
- destructive operations
- ORM-generated database artifacts
- database-dependent integration tests

This skill supplements:

- `AGENTS.md`
- `WORKFLOW.md`
- approved project business rules

Those sources always take precedence.

If this skill conflicts with an approved project rule or repository convention, follow the project rule and report the deviation.

> Detailed guidance: [references/guide.md](references/guide.md). Read only the sections relevant to the task.

## Core Principle

Database work must preserve:

```text
data integrity
+
transaction correctness
+
migration safety
+
application compatibility
+
recoverability
```

A migration that compiles is not necessarily safe.

A transaction that works sequentially is not necessarily correct under concurrency.

## Review Checklist

When reviewing database work, check:

```text
[ ] schema matches business invariant
[ ] existing rows remain compatible
[ ] migration SQL inspected
[ ] destructive operations identified
[ ] indexes/constraints correct
[ ] transaction boundaries correct
[ ] concurrent execution considered
[ ] idempotency behavior defined
[ ] soft-delete/archive behavior considered
[ ] integration coverage exists where DB semantics matter
[ ] rollback/recovery understood
[ ] environment safety respected
```

## Planner Usage

When the Planner uses this skill, return:

```text
Database impact
Migration classification
Existing-row risk
Concurrency risk
Transaction requirements
Index/constraint strategy
Integration-test requirements
Rollback implications
Open decisions
```

Do not implement.

## Implementer Usage

When the Implementer uses this skill:

- follow the approved DB plan
- inspect generated SQL
- implement only approved schema changes
- preserve migration safety
- add appropriate database-backed safeguards
- add integration tests when DB semantics matter
- report anything not validated

Do not introduce a migration merely because one seems cleaner if the approved plan does not require it.

## Reviewer Usage

When Reviewer uses this skill, independently inspect:

```text
migration correctness
constraint correctness
transaction behavior
concurrency behavior
integration coverage
existing-row compatibility
data-loss risk
```

Do not trust the Implementer's "all tests green" report as proof of database semantics.

Inspect actual code/migration artifacts.

## QA Usage

When QA uses this skill:

- run database-dependent integration tests when safe
- verify required migrations are applied
- exercise relevant concurrency/idempotency scenarios
- distinguish code failure from environment/migration-state failure

If real DB behavior has not been tested where it materially matters:

report it as:

```text
NOT VALIDATED
```

## Required Report

For database-impacting work include:

```text
Database impact

Migration
- required / not required
- generated / manual

Existing-row compatibility

Constraints / indexes

Transaction behavior

Concurrency / idempotency

Integration validation

Not validated

Rollback / recovery

Risks
```

## Core Rules

Prefer:

```text
database constraint > application-only assumption

real integration test > mock
when DB semantics matter

explicit transaction boundary > accidental transaction scope

verified existing rows > assumption

additive migration > destructive migration

recoverable change > irreversible shortcut

safe stop > uncertain database command
```

## Reference sections

- 1. Inspect Before Changing
- 2. Environment Safety
- 3. Migration Classification
- 4. Existing-Row Compatibility
- 5. Backfill Strategy
- 6. Index and Uniqueness Safety
- 7. Transactions
- 8. PostgreSQL Transaction Failure Semantics
- 9. Concurrency Analysis
- 10. Idempotency
- 11. State Transitions
- 12. Soft Deletes and Archived Records
- 13. Generated Migrations
- 14. Lock and Availability Risk
- 15. Deployment Ordering
- 16. Rollback and Recovery
- 17. Integration Testing
- 18. Integration Test Safety

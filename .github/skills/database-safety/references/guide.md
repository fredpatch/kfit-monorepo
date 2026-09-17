# database-safety — detailed guide

Loaded on demand from `../SKILL.md`.

## Inspect Before Changing

Before proposing or modifying database behavior, inspect:

1. current schema
2. existing migrations
3. ORM configuration
4. relevant indexes and constraints
5. existing rows / data assumptions
6. related service/domain logic
7. transaction boundaries
8. existing integration tests
9. production/staging environment conventions

Do not infer schema solely from application types.

The database schema is authoritative for database constraints.


## Environment Safety

Before executing any database-changing command:

1. identify which environment file/configuration is loaded
2. determine the target host/database
3. prove that the target is local or explicitly approved
4. stop if the environment cannot be confidently identified

Never run destructive commands against staging or production unless explicitly authorized.

Forbidden by default:

```text
DROP DATABASE
DROP TABLE
TRUNCATE
DELETE without a bounded predicate
force reset
schema reset
destructive seed
migration reset
```

Never assume `localhost` configuration without checking repository/runtime configuration.


## Migration Classification

Classify each database change before implementation.

## Additive / Low Risk

Examples:

- nullable column
- new table
- new non-unique index
- additive enum/table representation
- optional foreign key

Still inspect lock and runtime behavior.

## Constraint Increasing

Examples:

- `NOT NULL`
- `UNIQUE`
- foreign key
- enum restriction
- CHECK constraint
- narrower data type

Require existing-row validation first.

## Transformative

Examples:

- column rename
- type conversion
- data backfill
- table split/merge
- relationship redesign

Require an explicit migration strategy.

## Destructive

Examples:

- drop column
- drop table
- truncate
- lossy type conversion
- deletion/backfill replacing original data

Requires explicit developer approval and rollback planning.


## Existing-Row Compatibility

Before applying a stricter constraint, answer:

```text
Can existing rows violate this constraint?
```

For:

```text
NOT NULL
UNIQUE
foreign key
enum restriction
CHECK constraint
```

require a check query or equivalent inspection.

Example reasoning:

```text
new NOT NULL column
→ existing rows?
→ default/backfill?
→ migration order?
→ application deployment order?
```

Do not rely on "the table should be empty."

Verify when practical.


## Backfill Strategy

For changes requiring backfills:

1. define source data
2. define transformation
3. define invalid/legacy-row behavior
4. define batching requirements
5. define locking impact
6. define rollback or recovery path
7. verify the result before enabling stricter constraints

Prefer:

```text
add permissive structure
→ backfill
→ verify
→ enforce constraint
```

rather than applying a strict constraint before legacy rows are compatible.


## Index and Uniqueness Safety

When adding uniqueness, determine:

- what exact business invariant is represented
- whether soft-deleted rows participate
- whether archived rows participate
- whether nullable values are allowed
- whether case normalization matters
- whether concurrency depends on this constraint

An application-level pre-check is not a concurrency guarantee.

For concurrency-sensitive uniqueness:

```text
database constraint
= final guard
```

The service may perform a pre-check for UX or clearer errors, but correctness must not depend on it.


## Transactions

Explicitly identify transaction boundaries for multi-step business commands.

Ask:

```text
Which writes must succeed or fail together?
```

Typical examples:

- invoice + ledger
- stock adjustment + movement
- request + audit event
- state transition + history record
- payment + balance update

Avoid transactions that are unnecessarily broad.

Be aware that locks are generally held until transaction completion.


## PostgreSQL Transaction Failure Semantics

In PostgreSQL, after a statement fails inside a transaction, the transaction may remain aborted until rollback.

Do not assume application code can catch a constraint violation and continue issuing queries in the same transaction.

When recovery from a known risky statement is required, consider:

```text
SAVEPOINT
→ risky statement
→ constraint failure
→ ROLLBACK TO SAVEPOINT
→ recovery query
```

or restructure execution so recovery occurs in a fresh transaction/connection.

This must be verified with real PostgreSQL behavior when correctness depends on it.

Do not rely only on fake repositories or mocks for database transaction semantics.


## Concurrency Analysis

For commands that can execute concurrently, inspect:

- duplicate submission
- double approval
- stale reads
- lost updates
- duplicate numbering
- repeated payment
- stock double decrement
- simultaneous state transition
- idempotent replay

Ask:

```text
What happens if two valid requests arrive at the same time?
```

Then identify the database-backed safeguard.

Possible safeguards:

- unique constraint
- conditional update
- row lock
- advisory lock
- serializable transaction
- optimistic version column
- idempotency key
- append-only ledger design

Do not rely on frontend disabling or process-local state for correctness.


## Idempotency

Separate:

```text
idempotency
≠
business duplicate detection
```

Idempotency answers:

> Is this the same command being retried?

Business duplicate detection answers:

> Is this a new command that resembles an earlier business action?

Do not overload one field or rule to solve both unless explicitly designed that way.

For idempotent commands:

- use a stable command/token identity
- persist the identity
- protect it with a database constraint
- define replay behavior
- define concurrent collision behavior
- integration-test the real DB path


## State Transitions

Database-backed workflows should use explicit state transitions.

Avoid unrestricted status updates such as:

```text
PATCH { status: "anything" }
```

Prefer named domain commands.

Example:

```text
approveRequest()
rejectRequest()
cancelPayment()
consolidateCommission()
```

Each command should:

1. verify current state
2. verify actor/permission
3. validate invariants
4. execute atomic side effects
5. update state
6. write audit/history when required


## Soft Deletes and Archived Records

Whenever uniqueness, counts, lookups, or foreign references are involved, determine how these affect:

```text
deleted_at
archived_at
is_active
status
```

Do not automatically assume archived records disappear from uniqueness requirements.

Explicitly define expected behavior.


## Generated Migrations

If the project uses an ORM migration generator:

- modify schema through the intended schema source
- generate migration using repository tooling
- inspect generated SQL
- do not hand-edit generated artifacts unless repository convention explicitly permits it

Review generated SQL for:

- destructive changes
- unexpected drops
- incorrect defaults
- table rewrites
- index changes
- constraint naming
- type casts

Generated does not mean safe.


## Lock and Availability Risk

For production-oriented changes, consider:

- table locks
- index creation locks
- table rewrites
- migration duration
- transaction duration
- application downtime

Large tables may require different strategies than development databases.

Where supported and appropriate, operations such as concurrent index creation may reduce blocking but have their own transaction constraints.

Do not invent zero-downtime complexity when the project does not need it.

Report the tradeoff.


## Deployment Ordering

For schema/application changes, determine whether deployment order matters.

Common safe pattern:

```text
backward-compatible schema
→ deploy application
→ backfill
→ tighten constraint
```

Avoid migrations that require new application code to exist before the migration completes unless deployment guarantees that ordering.


## Rollback and Recovery

For meaningful migrations, identify:

```text
Can this be rolled back?
```

Distinguish:

- schema rollback
- data rollback
- application rollback

Dropping a column is not truly reversible unless the data can be recovered.

A down migration that recreates an empty column does not restore lost data.

Report irreversible changes explicitly.


## Integration Testing

Use real database integration tests when behavior depends on database semantics.

Especially for:

- unique constraint races
- transaction abort behavior
- savepoints
- isolation
- locking
- trigger behavior
- generated defaults
- foreign keys
- database-specific SQL
- concurrency

Mocks/fake repositories may test domain logic, but they cannot prove PostgreSQL transaction semantics.


## Integration Test Safety

Before running an integration test:

- verify test database identity
- verify migrations are applied
- isolate test data
- avoid production/staging connections
- clean up test records safely
- do not reset shared developer databases unless explicitly approved

If DB state is missing required migrations, report:

```text
NOT VALIDATED
```

Do not silently migrate unless repository workflow permits it.

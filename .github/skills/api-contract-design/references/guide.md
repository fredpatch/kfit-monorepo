# api-contract-design — detailed guide

Loaded on demand from `../SKILL.md`.

## Inspect Before Designing

Before proposing or modifying an API contract, inspect:

1. existing route conventions
2. shared-contract structure
3. request/response naming
4. error-code conventions
5. validation approach
6. authentication/authorization model
7. controller/service separation
8. client API wrapper conventions
9. query/mutation patterns
10. existing tests
11. every known consumer

Prefer the repository's established style over introducing a new API pattern.


## Contract Layers

Keep these responsibilities distinct:

```text
API route
→ transport boundary

request DTO
→ allowed external input

controller
→ transport adaptation

service/domain command
→ business behavior

response DTO
→ externally exposed result

DB entity
→ persistence model
```

Do not expose ORM/database entities directly unless the project explicitly uses that architecture.


## Request DTOs

A request DTO should contain only fields the caller is allowed to control.

Do not expose:

- internal IDs unnecessarily
- audit fields
- timestamps controlled by the server
- authorization-derived fields
- server-calculated status
- internal state flags
- ownership fields derived from session/user context

Prefer explicit input types over generic objects.

Example:

```text
CreateRequestInput
```

is preferable to:

```text
Partial<RequestEntity>
```


## Response DTOs

Responses should expose only information required by consumers.

Check for:

- sensitive fields
- internal-only metadata
- implementation details
- database-specific structure
- audit internals
- secrets/tokens
- unnecessary PII

Prefer stable API-facing field names even if underlying database column names differ.


## Shared Contracts

When a monorepo contains a shared contract package (for example `packages/shared` or `libs/contracts`, as defined in `PROJECT.md`):

treat changes as cross-application changes.

Before editing:

- identify all consumers
- inspect usages
- determine whether change is additive or breaking

After editing:

- validate shared package
- validate server
- validate client
- inspect compilation and runtime assumptions

A shared package compiling alone is insufficient.


## Contract Change Classification

Classify changes before implementation.

## Additive

Examples:

- optional request field
- optional response field
- new error code
- new route
- new enum value handled safely by consumers

Usually lower risk.

## Behavior-changing

Examples:

- changed validation
- changed error mapping
- changed default behavior
- changed state-transition semantics
- changed sorting/filtering

Requires explicit acceptance criteria.

## Breaking

Examples:

- removing fields
- renaming fields
- changing field type
- changing required/optional status
- changing response structure
- changing route path/method
- changing error semantics

Requires explicit developer approval and migration/compatibility strategy.


## Server Authority

Business rules must be enforced server-side.

Frontend validation is supplementary.

Never rely solely on:

```text
hidden buttons
disabled forms
client-side enums
client-side validation
route visibility
```

for correctness or authorization.

Server must independently validate:

- permissions
- ownership
- state transitions
- input invariants
- resource relationships


## Resource Relationships

When one request references multiple entities, verify ownership/cardinality explicitly.

Example:

```text
serviceId
requestedVariantId
```

Do not assume the variant belongs to the service.

Validate relationship ownership server-side.

Avoid leaking whether a referenced resource exists when disclosure is unnecessary.

Prefer a single typed invalid-reference error when appropriate.


## Commands vs Generic Updates

For stateful business workflows, prefer named commands over unrestricted updates.

Avoid:

```text
PATCH /request/:id
{
  "status": "approved"
}
```

when transitions have rules.

Prefer:

```text
POST /request/:id/approve
POST /request/:id/reject
POST /request/:id/cancel
```

or an equivalent command-oriented service API.

The exact HTTP shape should follow repository conventions.

The important rule is:

```text
caller expresses intent
server owns transition
```


## HTTP Method Semantics

Use repository conventions first.

As a general guide:

```text
GET
→ read

POST
→ create or execute command

PUT
→ full replacement when the project uses true replacement semantics

PATCH
→ partial update where arbitrary field mutation is actually valid

DELETE
→ remove/archive when API semantics define it
```

Do not choose HTTP methods based only on aesthetics.

Preserve existing project consistency.


## Error Taxonomy

Use stable machine-readable error codes.

Prefer:

```text
REQUEST_INVALID_INPUT
REQUEST_NOT_FOUND
REQUEST_CONFLICT
REQUEST_INVALID_TRANSITION
```

over exposing raw exception strings.

Separate:

```text
machine code
human message
internal diagnostic cause
```

Public API responses should not expose:

- SQL errors
- stack traces
- internal table names
- sensitive existence details
- raw third-party errors


## Error Families

Common categories:

```text
VALIDATION
NOT_FOUND
UNAUTHORIZED
FORBIDDEN
CONFLICT
INVALID_TRANSITION
RATE_LIMITED
DEPENDENCY_FAILURE
INTERNAL
```

Map them consistently to HTTP status codes according to project conventions.

Do not invent a new mapping style inside one module.


## Error Stability

Consumers may depend on error codes.

Therefore:

- codes should be stable
- semantics should not silently change
- old codes should not be repurposed
- new cases should receive new codes when behavior differs materially

Human-readable messages may evolve more freely than machine-readable codes.


## Validation

Validate at the API boundary:

- required fields
- type
- format
- limits
- basic structure

Validate business invariants inside the appropriate service/domain layer:

- ownership
- state
- availability
- capacity
- allowed transitions
- uniqueness
- cross-resource consistency

Do not put domain logic only in controller-level validation.


## Normalization

Define normalization explicitly for inputs such as:

- email
- phone
- identifiers
- usernames
- whitespace-sensitive text

Normalization must occur consistently.

Example:

```text
normalize
→ validate
→ compare
→ persist
```

Do not compare normalized and non-normalized versions inconsistently across modules.


## Idempotent Commands

For retry-prone commands, determine whether idempotency is required.

Examples:

- payments
- public submissions
- approvals
- stock movements
- external webhooks
- document issuance

If required, define:

```text
idempotency identity
persistence
uniqueness enforcement
replay response
concurrency behavior
```

Do not confuse idempotency with business duplicate detection.

Use the `database-safety` skill when persistence/concurrency guarantees are involved.


## Concurrency-sensitive APIs

For commands that modify state, ask:

```text
What happens if two valid requests arrive simultaneously?
```

Review:

- stale state
- duplicate execution
- lost updates
- double approval
- repeated payment
- repeated request submission

API correctness must not rely on frontend disabling.

Use database-backed safeguards where needed.


## Authorization

For protected routes verify:

```text
authentication
→ actor identity
→ authorization
→ resource ownership / permission
→ command execution
```

Do not authorize based only on UI role visibility.

For permission-matrix changes, check both:

```text
client visibility
+
server enforcement
```


## Public Endpoints

For unauthenticated write endpoints, consider:

- abuse protection
- rate limiting
- origin policy
- honeypot/bot strategy
- idempotency
- input size limits
- data minimization
- audit requirements

Do not automatically apply authenticated-route CSRF rules when no authenticated session exists.

Follow project security architecture.


## Audit

When business actions require auditability, determine:

```text
actor
action
target
result
timestamp
correlation
metadata
```

Do not include unnecessary PII or secrets.

If the caller is anonymous, use the project's approved anonymous/public actor model rather than inventing a fake user.


## Pagination

For list APIs, define:

- page/cursor model
- stable ordering
- page size limits
- filtering
- search semantics
- total-count behavior if required

Do not allow unbounded list responses by default for potentially large datasets.

Ensure sort order is deterministic.


## Filtering and Search

Specify whether filters are:

```text
exact
prefix
substring
case-insensitive
normalized
```

Do not leave search semantics implicit if consumers depend on them.

Keep filtering behavior server-authoritative.


## Dates

API date/time contracts must define:

- representation
- timezone
- nullable behavior
- date-only vs timestamp semantics

Prefer an unambiguous standard representation such as ISO 8601.

Do not mix local timestamps and UTC semantics implicitly.

Use project-specific timezone rules.


## Currency and Numeric Values

For monetary APIs define:

```text
currency
storage unit
decimal/integer semantics
rounding rule
```

Do not use floating-point values for monetary amounts when project architecture uses integer minor/base units.

For zero-decimal currencies (for example XAF or JPY), store integer amounts and follow the currency rules in `PROJECT.md`.


## Enums

When exposing enums:

- define allowed values explicitly
- validate unknown values
- consider forward compatibility
- do not expose database enum names blindly if they are implementation-specific

When adding enum values, inspect consumers for exhaustive switches.

A compile-safe shared enum change may still break runtime assumptions.


## Null vs Missing

Define whether these are different:

```text
field omitted
field = null
field = ""
```

Particularly important for PATCH/update semantics.

Do not silently treat them as equivalent unless business rules define that behavior.


## Backward Compatibility

Before modifying a contract, identify all consumers.

Ask:

```text
Can existing clients continue to operate?
```

Additive changes are usually safer.

For breaking changes, define:

- migration strategy
- coordinated client rollout
- route/version transition
- deprecation behavior

Do not break internal clients merely because they live in the same monorepo.


## Versioning

Do not introduce versioning prematurely.

Use versioning when contract evolution genuinely requires incompatible behavior.

Follow existing project conventions.

Possible strategies:

```text
/v1/...
header versioning
media type versioning
internal coordinated rollout
```

Do not mix strategies within the same project without explicit architecture approval.


## Client Integration

When a server contract changes, inspect client impact:

```text
API wrapper
query/mutation
cache invalidation
loading state
error mapping
success state
form contract
permission handling
```

Do not let frontend components call raw endpoints differently from existing API-client conventions.


## Query vs Mutation

Keep read and write behavior conceptually distinct.

Queries:

```text
read
cache
refetch
pagination/filtering
```

Mutations:

```text
business command
validation
error handling
success feedback
cache invalidation
```

Follow the project's existing TanStack Query or equivalent patterns when present.


## Contract Tests

Contract tests should verify:

- route constants
- error codes
- DTO assumptions where runtime schemas exist
- backward compatibility where relevant

Do not make tests merely duplicate TypeScript compilation.

Tests should protect behavior or stable contract expectations.


## Server Tests

For each endpoint, consider:

```text
happy path
invalid input
not found
authorization
conflict
invalid state
edge relationship
idempotent retry
concurrency
```

Only add relevant cases.


## Client Tests / Smoke Checks

Where appropriate verify:

- request payload
- response handling
- typed errors
- loading state
- success state
- validation feedback
- cache refresh
- duplicate submission prevention

Manual smoke remains valuable for user-facing flows.

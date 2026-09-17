---
name: api-contract-design
description: Design, implement, review, or validate API contracts safely across shared types, server routes, controllers, domain services, clients, errors, versioning, and consumers. Use for new endpoints, DTO changes, shared contracts, API errors, state-changing commands, pagination, compatibility, or client/server contract changes.
---

# API Contract Design

Use this skill whenever work touches:

- API routes
- request DTOs
- response DTOs
- shared contracts
- shared enums
- typed errors
- client API functions
- mutations or queries
- state-changing commands
- pagination/filtering
- API compatibility
- route versioning
- API consumers

This skill supplements:

- `AGENTS.md`
- `WORKFLOW.md`
- approved project business rules
- repository architecture

Those sources always take precedence.

> Detailed guidance: [references/guide.md](references/guide.md). Read only the sections relevant to the task.

## Core Principle

An API contract is a boundary between systems.

Treat changes to it as changes to a public interface, even when the API is currently internal.

A safe contract must preserve:

```text
business correctness
+
server authority
+
consumer compatibility
+
stable semantics
+
clear failure behavior
```

Do not treat a database model as an API contract.

## API Contract Review Checklist

```text
[ ] route follows project conventions
[ ] request DTO exposes only caller-controlled fields
[ ] response DTO exposes only required data
[ ] DB entity is not leaked unintentionally
[ ] validation split is correct
[ ] business rules enforced server-side
[ ] authorization enforced server-side
[ ] resource relationships validated
[ ] errors use stable typed codes
[ ] HTTP mappings are consistent
[ ] shared consumers identified
[ ] backward compatibility considered
[ ] concurrency/idempotency considered
[ ] audit requirements considered
[ ] client impact checked
[ ] tests cover meaningful behavior
```

## Planner Usage

When Planner uses this skill, report:

```text
API goal

Existing contract pattern

Proposed route(s)

Request DTO

Response DTO

Typed errors

Authorization

Business invariants

Consumer impact

Compatibility risk

Idempotency / concurrency needs

Validation plan

Open decisions
```

Do not implement.

## Implementer Usage

When Implementer uses this skill:

1. follow approved contract exactly
2. reuse existing shared-contract conventions
3. implement server enforcement
4. update affected consumers
5. add/update contract tests
6. validate every consumer
7. report contract deviations

Do not silently change contract semantics during implementation.

## Reviewer Usage

Reviewer should independently verify:

```text
contract matches approved plan
request/response boundaries
server authority
error stability
authorization
resource relationships
consumer compatibility
idempotency/concurrency
test coverage
```

Do not approve merely because server and client compile together.

## QA Usage

QA should validate:

```text
real request behavior
response shape
error behavior
boundary inputs
authorization failures
retry/idempotency behavior
client consumption
```

When possible, verify through actual HTTP/API behavior rather than only code inspection.

## Required Report

For API-impacting work include:

```text
API impact

Routes

Request contract

Response contract

Error codes

Authorization

Business rules

Consumers affected

Compatibility

Concurrency / idempotency

Validation performed

Not validated

Risks
```

## Core Rules

Prefer:

```text
explicit contract > implicit object shape

shared contract > duplicated client/server types

server authority > client assumption

typed error > raw exception

named business command > unrestricted status patch

stable semantics > convenient shortcut

consumer compatibility > local compile success

observable behavior test > implementation-only test
```

## Reference sections

- 2. Inspect Before Designing
- 3. Contract Layers
- 4. Request DTOs
- 5. Response DTOs
- 6. Shared Contracts
- 7. Contract Change Classification
- 8. Server Authority
- 9. Resource Relationships
- 10. Commands vs Generic Updates
- 11. HTTP Method Semantics
- 12. Error Taxonomy
- 13. Error Families
- 14. Error Stability
- 15. Validation
- 16. Normalization
- 17. Idempotent Commands
- 18. Concurrency-sensitive APIs
- 19. Authorization
- 20. Public Endpoints
- 21. Audit
- 22. Pagination
- 23. Filtering and Search
- 24. Dates
- 25. Currency and Numeric Values
- 26. Enums
- 27. Null vs Missing
- 28. Backward Compatibility
- 29. Versioning
- 30. Client Integration
- 31. Query vs Mutation
- 32. Contract Tests
- 33. Server Tests
- 34. Client Tests / Smoke Checks

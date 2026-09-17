---
name: security-review
description: Review application changes and code paths for security risks including authentication, authorization, input validation, injection, sensitive data exposure, secrets, rate limiting, abuse controls, audit logging, session/CSRF behavior, insecure dependencies, business-logic abuse, and privilege escalation. Use during planning, implementation, review, and QA when a task touches security-sensitive behavior.
---

# Security Review

Use this skill when work touches:

- authentication
- authorization
- permissions
- roles
- public write endpoints
- sessions
- cookies
- CSRF
- OTP
- password recovery
- secrets
- file uploads
- external integrations
- sensitive data
- audit logging
- rate limiting
- abuse protection
- admin actions
- payments
- state-changing privileged operations
- security-sensitive dependencies

This skill supplements:

- `AGENTS.md`
- `WORKFLOW.md`
- `TASKS.md`
- approved project business rules
- existing project security architecture

Those sources always take precedence.

> Detailed guidance: [references/guide.md](references/guide.md). Read only the sections relevant to the task.

## Core Principle

Security review asks:

```text
what can the attacker control?
→ where does that input travel?
→ what trust boundary does it cross?
→ what sensitive action or data can it reach?
→ what control prevents abuse?
```

Do not treat security as a checklist-only exercise.

Trace actual data and control flow.

## Planner Usage

When Planner uses this skill, report:

```text
Security impact

Trust boundary

Authentication

Authorization

Sensitive data

Public endpoint concerns

Abuse controls

Audit requirements

Concurrency/idempotency concerns

Security validation needed

Open security decisions
```

Do not invent requirements unsupported by the threat surface.

## Implementer Usage

When Implementer uses this skill:

- implement approved controls only
- preserve existing security architecture
- enforce rules server-side
- avoid secret exposure
- add relevant tests
- report unresolved security assumptions

Do not weaken controls to unblock implementation.

## Reviewer Usage

Reviewer should use this skill most heavily.

Independently inspect:

```text
input flow
authentication
authorization
ownership
state/business abuse
sensitive data
audit
rate limiting
session/CSRF
secret exposure
dependency/security impact
```

Trace across files where necessary.

GitHub’s current security-review skill explicitly recommends contextual cross-file reasoning and self-verification instead of relying only on static pattern matches; we should preserve that behavior.

## QA Usage

QA should validate security behavior safely.

Examples:

```text
unauthenticated request rejected
unauthorized role gets 403
invalid input rejected
duplicate mutation prevented
rate limit behaves as designed
sensitive error details not returned
```

Do not conduct aggressive penetration testing against shared or production-like systems without explicit authorization.

## Security Review Checklist

```text
[ ] trust boundary identified
[ ] untrusted inputs validated
[ ] dangerous sinks checked
[ ] authentication correct
[ ] authorization enforced server-side
[ ] ownership enforced where applicable
[ ] privileged actions protected
[ ] session/cookie behavior preserved
[ ] CSRF/origin controls correct where applicable
[ ] public endpoint abuse controls considered
[ ] rate-limit assumptions checked
[ ] sensitive data minimized
[ ] logs contain no secrets/unnecessary PII
[ ] audit behavior preserved where required
[ ] secrets not exposed client-side
[ ] state transitions cannot be bypassed
[ ] concurrency/replay considered
[ ] external integrations fail safely
[ ] dependency changes reviewed
[ ] findings grounded in reachable code paths
```

## Required Report

For security-sensitive work include:

```text
Security impact

Trust boundary

Inputs reviewed

Authentication

Authorization

Sensitive data

Abuse controls

Audit/logging

Concurrency/replay

External integrations

Findings

Validation

Not validated

Residual risks
```

## Core Rules

Prefer:

```text
server enforcement > UI restriction

least privilege > broad permission

typed safe error > internal disclosure

data minimization > collect everything

database-backed safeguard > frontend assumption

reachable evidence > speculative vulnerability

existing security architecture > ad hoc security mechanism

defense in depth > single fragile control

safe failure > silent bypass
```

## Reference sections

- 2. Security Scope
- 3. Threat Boundary
- 4. Input Sources
- 5. Input Validation
- 6. Injection
- 7. SQL and ORM Safety
- 8. Authentication
- 9. Authorization
- 10. Ownership
- 11. Role / Permission Matrix
- 12. Privileged Operations
- 13. Session Security
- 14. CSRF
- 15. CORS / Origin
- 16. Public Write Endpoints
- 17. Rate Limiting
- 18. Proxy Trust
- 19. Abuse Protection
- 20. Sensitive Data
- 21. Logging
- 22. Audit Logging
- 23. Secrets
- 24. Passwords
- 25. OTP / Recovery
- 26. Error Disclosure
- 27. File Uploads
- 28. Downloads / File Access
- 29. External Integrations
- 30. Webhooks
- 31. SSRF
- 32. XSS
- 33. Frontend Secrets
- 34. Dependency Security
- 35. Supply-chain Awareness
- 36. Prompt Injection
- 37. Business Logic Security
- 38. Concurrency Security
- 39. Idempotency
- 40. Denial of Service
- 41. Pagination / Query Abuse
- 42. Admin Interfaces
- 43. Multi-tenant Systems
- 44. Fail Securely
- 45. Avoid Security Theater
- 46. Severity
- 47. Evidence Standard
- 52. Security Test Safety

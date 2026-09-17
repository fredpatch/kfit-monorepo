---
name: webapp-testing
description: "Validate local web applications through real browser behavior, HTTP flows, console/network evidence, responsive checks, and user-visible acceptance criteria. Use for UI smoke tests, forms, authentication flows, permissions, browser regressions, frontend/backend integration, Playwright checks, screenshots, and runtime QA."
---

# Web Application Testing

Use this skill when validating:

- frontend features
- forms
- user flows
- authentication/session behavior
- permissions
- frontend/backend integration
- navigation
- responsive layouts
- error states
- loading states
- browser console errors
- network/API behavior
- runtime regressions

Prefer real browser behavior over implementation-only inspection when the feature is user-facing.

This skill supplements:

- `AGENTS.md`
- `WORKFLOW.md`
- `TASKS.md`
- approved acceptance criteria

Those sources always take precedence.

> Detailed guidance: [references/guide.md](references/guide.md). Read only the sections relevant to the task.

## Core Principle

Test the application as a user experiences it.

Prefer:

```text
observable behavior
>
implementation details
```

The fact that:

- TypeScript compiles
- a component renders in isolation
- an API unit test passes

does not prove the complete user flow works.

## Role Boundaries

When used by QA:

- do not modify production implementation code
- do not silently fix failures
- do not weaken tests
- do not redefine acceptance criteria
- do not mark human validation complete

If a failure requires implementation changes:

```text
QA
→ Implementer
→ Reviewer
→ QA
```

according to `WORKFLOW.md`.

## QA Workflow Usage

When QA uses this skill:

```text
1. Read acceptance criteria
2. Verify Reviewer passed the implementation
3. Identify user flows
4. Verify runtime prerequisites
5. Run focused automated checks
6. Explore/test relevant browser flows
7. Inspect console/network evidence
8. Test relevant edge cases
9. Run proportional regression smoke
10. Shut down started processes
11. Report evidence
```

## Planner Usage

Planner may use this skill to identify:

```text
required runtime tests
browser-sensitive acceptance criteria
test data needs
manual QA needs
E2E coverage expectations
```

Planner does not execute browser tests during planning unless specifically asked to investigate existing behavior.

## Implementer Usage

Implementer may use this skill to understand expected user-visible behavior and testing requirements.

The Implementer may run existing browser tests where relevant.

Do not alter acceptance criteria to match implementation.

Do not bypass the independent QA stage.

## Reviewer Usage

Reviewer may use this skill to identify missing runtime/browser coverage.

Reviewer should not duplicate the full QA pass.

Focus on:

```text
Does the implementation appear testable?
Are important user flows missing coverage?
Are acceptance criteria observable?
Are there obvious browser/UX regressions?
```

## Webapp Testing Checklist

```text
[ ] Reviewer gate passed
[ ] acceptance criteria mapped to observable behavior
[ ] runtime environment confirmed
[ ] safe test data available
[ ] required services healthy
[ ] main flow exercised
[ ] relevant invalid/error paths exercised
[ ] loading/pending behavior checked
[ ] duplicate action risk checked where relevant
[ ] browser console inspected
[ ] API/network behavior checked where relevant
[ ] responsive smoke completed where relevant
[ ] accessibility smoke completed where relevant
[ ] relevant regression path checked
[ ] started processes stopped
[ ] limitations reported honestly
```

## Core Rules

Prefer:

```text
user-visible behavior > implementation detail

real browser smoke > source inspection
for UI acceptance

semantic selectors > DOM-position selectors

semantic waits > arbitrary sleeps

real API integration > mocked frontend assumption

focused regression > exhaustive unrelated testing

evidence > confidence

NOT VALIDATED > guessed pass
```

## Reference sections

- 3. Preferred Browser Tooling
- 4. Explore Before Testing
- 5. Acceptance-Criteria First
- 6. Test Pyramid for Feature QA
- 7. User Flow Mapping
- 8. Browser Smoke Testing
- 9. Forms
- 10. Double Submission
- 11. Loading State
- 12. Error State
- 13. Success State
- 14. API / Network Inspection
- 15. Browser Console
- 16. Authentication Flows
- 17. Authorization / Roles
- 18. Public Endpoints
- 19. Responsive Testing
- 20. Accessibility Smoke Checks
- 21. Keyboard Testing
- 22. Browser Compatibility
- 23. Visual Verification
- 24. Selectors
- 25. Test Data
- 26. Data Cleanup
- 27. External Side Effects
- 28. Runtime Environment
- 29. Starting Local Servers
- 30. Health Before UI
- 31. Database-dependent Flows
- 32. API-contract Flows
- 33. Concurrency
- 34. Flaky Behavior
- 35. Timing
- 36. Runtime Failures
- 37. Regression Scope
- 38. Existing Playwright Tests
- 39. New Playwright Tests
- 40. Screenshots and Artifacts
- 45. QA Result Rules
- 46. Required Evidence Format
- 47. Runtime Report
- 48. Stop Conditions

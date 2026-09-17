---
name: webapp-testing
description: "Validate local web applications through real browser behavior, HTTP flows, console/network evidence, responsive checks, and user-visible acceptance criteria. Use for UI smoke tests, forms, authentication flows, permissions, browser regressions, frontend/backend integration, Playwright checks, screenshots, and runtime QA."
---

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

---

# 1. Core Principle

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

---

# 2. Role Boundaries

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

---

# 3. Preferred Browser Tooling

Prefer browser automation in this order:

```text
Playwright MCP / browser tool
→ existing project Playwright setup
→ project test runner with browser support
→ safe manual/runtime verification instructions
```

Do not install a new browser-testing dependency without approval.

If browser automation is unavailable, report the limitation explicitly.

---

# 4. Explore Before Testing

Before creating or running detailed browser scenarios:

1. inspect the relevant route/page
2. inspect acceptance criteria
3. inspect existing frontend patterns
4. identify the main user flow
5. identify required backend/API dependencies
6. identify authentication requirements
7. identify safe test data
8. identify destructive/external side effects

When browser access exists, explore the application before inventing selectors or assertions.

Do not assume the rendered DOM structure from source code alone.

---

# 5. Acceptance-Criteria First

Translate each approved criterion into observable behavior.

Example:

```text
Criterion:
User can submit a request.

Observable checks:
- form is visible
- required fields reject invalid input
- submit enters pending state
- duplicate click is prevented
- expected request is sent
- success state appears
- page remains usable afterward
```

Every meaningful test must trace back to an acceptance criterion or known regression risk.

---

# 6. Test Pyramid for Feature QA

Prefer the smallest useful layer first:

```text
unit
→ integration
→ API/runtime
→ browser smoke
→ full user flow
```

Do not use browser tests to replace inexpensive unit/integration tests.

Do not rely only on unit tests for user-facing behavior.

---

# 7. User Flow Mapping

For each feature, identify:

```text
entry point
→ user action
→ intermediate state
→ backend interaction
→ success/failure result
→ persistent state
```

Example:

```text
catalogue
→ click request
→ fill form
→ submit
→ POST /requests
→ success feedback
→ request persisted
```

Use this map to decide what QA evidence is needed.

---

# 8. Browser Smoke Testing

At minimum verify relevant:

- route loads
- primary UI renders
- critical CTA works
- form can be completed
- navigation works
- API call succeeds/fails as expected
- success/error feedback appears
- no critical console errors occur

Do not turn every smoke test into a full end-to-end suite.

---

# 9. Forms

For forms verify where applicable:

```text
required fields
invalid formats
normalization
minimum/maximum lengths
disabled state
pending state
double submit
server errors
success state
reset/navigation behavior
```

Also verify keyboard interaction where relevant.

Client validation is supplementary.

Where possible verify that the server still rejects invalid requests independently.

---

# 10. Double Submission

For mutations, explicitly test repeated interaction where relevant.

Examples:

```text
rapid double click
submit while pending
browser retry
refresh/retry flow
```

Confirm the UI does not create unintended duplicate actions.

When server idempotency exists, validate it separately at API/integration level.

---

# 11. Loading State

Verify that asynchronous UI has an intentional loading state.

Check:

- spinner/skeleton/progress indication
- disabled conflicting action
- no stale success/error message
- no accidental duplicate submission

Avoid asserting exact animation timing.

Test user-observable state.

---

# 12. Error State

Verify relevant failure paths:

```text
400 validation
401 unauthenticated
403 unauthorized
404 missing resource
409 conflict/business rule
429 rate limit
500/unexpected error
network unavailable
```

Use project-specific mappings.

The UI should not expose raw internal errors.

---

# 13. Success State

A successful mutation should have observable feedback.

Examples:

- confirmation message
- updated list
- redirect
- refreshed state
- disabled completed action

Confirm success reflects the persisted backend result where possible.

---

# 14. API / Network Inspection

For browser-based flows, inspect network behavior when tooling permits.

Verify:

```text
HTTP method
route
request payload
status
response shape
duplicate calls
unexpected retries
authorization/session headers where relevant
```

Never expose secrets/tokens in reports.

---

# 15. Browser Console

Check for unexpected:

```text
errors
uncaught exceptions
failed resource loads
React warnings
unhandled promise rejections
```

Do not fail a feature solely because of unrelated pre-existing console noise.

Record baseline noise separately.

---

# 16. Authentication Flows

When testing authentication:

- begin from a known session state
- verify login/logout
- verify session persistence when required
- verify protected route behavior
- verify expired/missing sessions
- verify expected redirect or error
- verify authorization separately from authentication

Never store real passwords in test source.

Use dedicated synthetic local/test accounts.

---

# 17. Authorization / Roles

For role-sensitive UI:

verify both:

```text
UI visibility
+
server enforcement
```

Examples:

```text
unauthorized button hidden
AND
direct API request receives 403
```

UI hiding alone is not a passing authorization test.

---

# 18. Public Endpoints

For unauthenticated public flows, consider:

- invalid input
- bot/honeypot behavior
- rate limiting
- duplicate submission
- origin policy
- data minimization
- typed errors

Do not trigger excessive requests against shared environments.

---

# 19. Responsive Testing

For user-facing pages, check at least the viewports relevant to the project.

Typical categories:

```text
mobile
tablet when relevant
desktop
```

Look for:

- clipped content
- horizontal overflow
- inaccessible actions
- overlapping elements
- unreadable typography
- unusable forms
- incorrect modal/dialog sizing

Do not require pixel-identical rendering across viewport sizes.

---

# 20. Accessibility Smoke Checks

Where tooling permits, check basic accessibility:

- labels connected to controls
- keyboard accessibility
- visible focus
- meaningful button/link names
- heading hierarchy
- sufficient semantic structure
- dialogs trap/restore focus appropriately
- validation errors are understandable

Do not claim full WCAG compliance from a smoke test.

Use:

```text
accessibility smoke passed
```

rather than:

```text
application is WCAG compliant
```

unless a dedicated audit was performed.

---

# 21. Keyboard Testing

For important interactions verify where relevant:

```text
Tab
Shift+Tab
Enter
Space
Escape
```

Especially:

- forms
- dialogs
- menus
- dropdowns
- modals

Do not assume mouse behavior proves keyboard accessibility.

---

# 22. Browser Compatibility

Only test multiple browser engines when required by the project's support policy.

If required, consider:

```text
Chromium
Firefox
WebKit
```

Do not multiply test execution without a requirement.

For most development smoke tests, the project's primary browser may be sufficient.

---

# 23. Visual Verification

Screenshots can be useful for:

- layout regressions
- responsive behavior
- error states
- modal/dialog state
- visual QA evidence

Do not use screenshots as proof of server-side correctness.

Prefer semantic assertions over image comparison unless the project intentionally uses visual-regression tests.

---

# 24. Selectors

Prefer resilient selectors.

Good priority:

```text
role/name
label
accessible name
test id when intentionally provided
stable semantic attribute
```

Avoid selectors tied to:

```text
generated CSS classes
DOM depth
fragile nth-child
visual position
```

Do not change production markup solely to make a one-off QA session easier without approval.

---

# 25. Test Data

Use synthetic data.

Never use real:

- customer data
- employee PII
- production credentials
- payment information
- health information

Test fixtures should be clearly recognizable as test data.

---

# 26. Data Cleanup

For tests that create records:

- know what data will be created
- use isolated test identifiers
- clean up only test-owned data
- do not truncate shared tables
- do not reset a shared developer DB

If cleanup is unsafe, leave clearly marked test data and report it.

Use `database-safety` when DB behavior matters.

---

# 27. External Side Effects

Never cause real external side effects during QA.

Do not send real:

- email
- SMS
- payment
- push notification
- webhook
- external document transmission

Use:

- mocks
- local adapters
- sandbox/test providers
- disabled integrations

when available.

---

# 28. Runtime Environment

Before browser testing determine:

```text
frontend URL
backend URL
environment
database state
authentication state
required services
```

Do not assume the application is running on a standard port.

Inspect repository configuration.

---

# 29. Starting Local Servers

If runtime validation requires servers:

- use repository scripts
- avoid modifying configuration unnecessarily
- wait only until health/readiness is confirmed
- record started processes
- shut them down after validation

Do not leave background processes running indefinitely.

---

# 30. Health Before UI

Before diagnosing the browser, verify required services are actually healthy.

Example:

```text
database
→ backend
→ frontend
→ browser
```

Avoid interpreting backend downtime as a frontend bug.

---

# 31. Database-dependent Flows

If a user flow depends on:

- migrations
- constraints
- transactions
- concurrency
- persisted state

use the `database-safety` skill as well.

Browser success alone does not prove DB concurrency correctness.

---

# 32. API-contract Flows

If browser behavior depends on new/changed API contracts, use `api-contract-design` as well.

Verify:

```text
browser payload
→ API contract
→ server result
→ client interpretation
```

This is especially important for typed business errors.

---

# 33. Concurrency

Do not use browser automation alone to prove serious concurrency guarantees.

For behaviors such as:

- idempotency
- double payment
- duplicate numbering
- simultaneous approval

prefer dedicated API/integration tests against the real database.

Browser testing may supplement them.

---

# 34. Flaky Behavior

If a browser test fails inconsistently:

1. re-run once
2. capture evidence
3. inspect timing/network/selector stability
4. classify as flaky if inconsistent

Do not blindly add arbitrary sleeps.

Avoid:

```text
wait(5000)
```

when a semantic wait can be used.

Prefer waiting for:

- visible UI state
- network completion
- enabled control
- route transition

---

# 35. Timing

Tests should avoid dependence on machine speed.

Prefer:

```text
wait for expected state
```

over:

```text
sleep fixed duration
```

If a product requirement itself is time-based, test the actual boundary intentionally.

---

# 36. Runtime Failures

When browser behavior fails, determine whether the cause is:

```text
frontend code
backend/API
database
environment
test automation
test data
external dependency
```

Do not automatically classify every UI failure as frontend.

---

# 37. Regression Scope

After validating the new behavior, smoke relevant neighboring behavior.

Examples:

```text
changed login
→ verify logout/session restore

changed shared form component
→ verify another consumer

changed catalogue API
→ verify admin + public consumers
```

Keep regression scope proportional to the change.

---

# 38. Existing Playwright Tests

If the repository already has Playwright:

- inspect its configuration
- reuse fixtures
- reuse authentication setup
- reuse selectors/helpers
- follow existing structure

Do not create a parallel browser-testing architecture.

---

# 39. New Playwright Tests

Do not automatically persist every exploratory scenario as a committed test.

Add a permanent E2E test when:

- flow is business-critical
- regression risk is meaningful
- browser integration adds value beyond unit tests
- maintenance cost is justified

Test creation is implementation work and must follow workflow approval when production repository files will change.

QA itself should not silently create committed tests.

---

# 40. Screenshots and Artifacts

Capture evidence when it materially helps diagnosis or review.

Useful artifacts:

- screenshot
- trace
- browser console
- failed network request
- test runner output

Avoid generating large artifact sets for successful trivial tests.

Do not commit artifacts unless repository convention requires it.

---

# 41. QA Workflow Usage

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

---

# 42. Planner Usage

Planner may use this skill to identify:

```text
required runtime tests
browser-sensitive acceptance criteria
test data needs
manual QA needs
E2E coverage expectations
```

Planner does not execute browser tests during planning unless specifically asked to investigate existing behavior.

---

# 43. Implementer Usage

Implementer may use this skill to understand expected user-visible behavior and testing requirements.

The Implementer may run existing browser tests where relevant.

Do not alter acceptance criteria to match implementation.

Do not bypass the independent QA stage.

---

# 44. Reviewer Usage

Reviewer may use this skill to identify missing runtime/browser coverage.

Reviewer should not duplicate the full QA pass.

Focus on:

```text
Does the implementation appear testable?
Are important user flows missing coverage?
Are acceptance criteria observable?
Are there obvious browser/UX regressions?
```

---

# 45. QA Result Rules

Use only:

```text
QA PASSED
QA PASSED WITH LIMITATIONS
QA FAILED
QA BLOCKED
```

A feature cannot receive `QA PASSED` if a required acceptance criterion is `NOT VALIDATED`.

Use `QA PASSED WITH LIMITATIONS` only when:

- the unvalidated item is explicitly non-blocking
- limitation is documented
- acceptance rules permit it

---

# 46. Required Evidence Format

For each criterion:

```text
Criterion:
...

Expected:
...

Check:
...

Actual:
...

Evidence:
...

Result:
PASS / FAIL / NOT VALIDATED
```

---

# 47. Runtime Report

Include:

```text
Environment

Services started

Browser/tool used

Routes tested

User flows tested

API/network observations

Console observations

Responsive checks

Accessibility smoke

Edge cases

Regression checks

Artifacts

Not validated

Environment limitations
```

Only include relevant sections.

---

# 48. Stop Conditions

Stop and report when:

- environment cannot be identified safely
- required migration is missing
- test account is unavailable
- test would cause real external side effects
- required backend dependency is unavailable
- test requires destructive shared-data reset
- Reviewer has unresolved BLOCKER/MAJOR findings
- acceptance criteria are missing or contradictory

Do not improvise around safety gates.

---

# 49. Webapp Testing Checklist

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

---

# 50. Core Rules

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

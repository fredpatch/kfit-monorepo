# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-4
Sprint            4 — Clients, conversion, onboarding, questionnaires et consentements
Active slice      S4.2 — Request conversion transaction
Workflow state    PLANNING
Last validated    S4.1 — 2026-10-20
Next action       Fred: review/approve S4.2 conversion invariants before implementation
```

## Sprint 4 objective

Build the customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow, preserving server-authoritative lifecycle rules and transactional audit guarantees.

## Sprint 4 execution order

1. S4.1 — Client table + phone-based search/create-inline — CLOSED, Fred validated 2026-10-20.
2. S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link — PLANNING.
3. Later Sprint 4 onboarding/questionnaire/consent slices follow dependency order from Notion and the project schema.

Do not implement S4.2 before Fred approves the plan.

## S4.2 — planning brief

Goal: convert one eligible qualified request exactly once into a stable customer + `onboarding` subscription while preserving immutable request↔subscription linkage and all hard-commit invariants.

Planner findings:
- eligible request states are `qualified` and `qualified_with_conditions`; `converted` is terminal for the request path;
- conversion backlog note says conversion occurs only once; incorrect conversion is corrected by subscription cancellation, never deletion;
- the authoritative commercial decision is the current non-superseded qualification review;
- qualified reviews already require final variant + agreed XAF price; `targetStartDate` is optional in S3.4, while the request state machine requires a target start before conversion;
- S4.1 customer writers use a transaction-scoped advisory lock keyed by normalized WhatsApp, and S4.2 must reuse it;
- `subscriptions.source_request_id` and `service_requests.converted_subscription_id` are unique and must resolve to the same pair;
- subscriptions use independent lifecycle/payment axes and conversion should create lifecycle state `onboarding`;
- conversion is a documented single-transaction boundary including customer/subscription creation, source links, component snapshots, initial status history and audit;
- detailed onboarding checklist/blockers and operational capacity-reservation review remain a later Sprint 4 task.

Proposed locked behavior:
- command route: `POST /admin/requests/:requestId/convert`;
- request must be `qualified` or `qualified_with_conditions`;
- request row is locked `FOR UPDATE`;
- reject any existing converted link / existing source subscription;
- load the current non-superseded qualification review and require outcome to match request status;
- serviceId comes from the request;
- variantId and agreedPriceXaf come only from the qualification review;
- plannedStartDate uses qualification `targetStartDate` when present; otherwise conversion input must provide it;
- currency is server-fixed to `XAF`;
- initial subscription status is `onboarding`;
- customer resolution uses normalized prospect WhatsApp under the S4.1 advisory-lock key:
  - reuse existing active/non-anonymized customer if present;
  - otherwise create a customer from the request prospect and set `prospect_id = request.prospect_id`;
  - never overwrite an existing customer's profile from prospect data during conversion;
- component snapshot includes service-level components plus components scoped to the chosen variant; snapshot fields are source component id/type/label/quantity with counters initialized to zero;
- initial `subscription_status_history` row is append-only: null → `onboarding`;
- write both links atomically: subscription.sourceRequestId + request.convertedSubscriptionId, then request status `converted`;
- write one transaction-scoped `request.converted` audit event with safe IDs/state metadata only;
- no onboarding-item generation, questionnaire/consent generation, payment plan, automatic activation, or notification in S4.2.

Capacity note:
- the schema contains `capacityReservedUntil`, but no approved reservation duration/value exists in the project sources;
- the later backlog task explicitly owns “capacity reservation and stalled-state review”;
- S4.2 therefore does not invent a reservation deadline. It leaves `capacityReservedUntil = null` and defers reservation policy/write to that task unless Fred explicitly approves another rule.

Idempotency:
- S4.2 is “exactly once”, not replay-as-success;
- a repeated or concurrent conversion attempt must resolve to a stable typed “already converted” conflict and must not create a second subscription/customer/component/history/audit set;
- request row lock + existing DB unique constraints on source-request/converted-subscription links are the final concurrency guards.

Applicable patterns:
- Explicit State Transitions
- Atomic Business Operation
- Idempotent Business Command
- Hard Commit Point
- Historical Business Snapshot
- Audit Event System
- Domain Error Taxonomy
- Shared API Contracts

## Closed

```text
Sprint 0 — Initialisation
Sprint 1 — Auth, sessions, OTP, security (+ password recovery HTTP flow)
Sprint 2 — Catalogue, offers, public availability
Sprint 3 — Demandes, prospects, qualification et liste d'attente
Sprint 4 / S4.1 — Customer identity/search/manual-create foundation
```

## Blockers

Before production:
- Legal validation for the applicable Gabon context.
- True encrypted off-server backup destination.

## Environment constraints

- Docker PostgreSQL: localhost:5433; native PostgreSQL: 5432.
- Chat/cloud runtimes do not run project commands; only Fred's local execution closes validation gates.

## Handoff

```text
Branch            sprint-4
Sprint            4
Slice             S4.2
Workflow state    PLANNING
Done              S4.1 validated and closed
Pending           Fred approval of S4.2 plan
Validation done   none for S4.2
Key risk          targetStartDate optional in S3.4; conversion requires planned start
Capacity          reservation policy deferred; do not invent capacityReservedUntil
Next action       Fred Gate 1 review
```

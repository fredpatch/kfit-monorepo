We are implementing K'FIT Sprint 6, slice S6.1.

Branch: main

Workflow state:
APPROVED_FOR_IMPLEMENTATION

Do NOT implement S6.2, quotes, payment proofs, receipts, refunds, credits, extras, finance analytics or Sprint 7 work.

Before coding, inspect:
- TASKS.md
- exploration-cache/tasks/sprint-6.md
- exploration-cache/project/database-schema.md
- exploration-cache/project/relational-contract.md
- exploration-cache/project/state-machines.md
- exploration-cache/project/decisions.md
- exploration-cache/technical/gotchas.md
- PROJECT.md
- packages/server/src/db/schema/finance.ts

Also inspect existing server module patterns for:
- Service → Controller → Route structure
- transaction-scoped audit
- typed domain errors
- shared API contracts
- row locking / concurrency
- idempotent commands
- integration-test fixtures

S6.1 goal:
Implement the authoritative K'FIT V1 Core financial ledger using the existing:

- payment_plans
- installments
- payment_events
- payment_allocations
- subscriptions.agreed_price_xaf

Do not create a parallel finance model.

==================================================
LOCKED BUSINESS RULES
==================================================

1. Currency
- XAF only.
- Money values are positive integer XAF values.
- No floating-point financial arithmetic.

2. Subscription independence
- Financial state NEVER changes subscription.status.
- Payment must not automatically activate, pause, complete or cancel a subscription.

3. Payment plans
- A subscription may have historical plans.
- At most one active payment plan per subscription.
- S6.1 total payable is subscription.agreed_price_xaf.
- Do not create a generic charges table.
- Do not use payment_allocations.extra_id in S6.1.
- No extras model exists yet.

4. Installments
- Coach explicitly provides installment amounts and due dates.
- K'FIT does not invent due dates.
- Positive-price subscriptions require one or more installments.
- Installment amounts must sum exactly to the authoritative payable total for the applicable plan representation.
- Paid history cannot be rewritten.

5. Allocation
- Confirmed payment and allocations are separate concepts.
- Default allocation is FIFO:
  dueDate ascending,
  then sequenceNumber ascending.
- Partial payment is allowed.
- One payment may allocate across several installments.
- No allocation exceeds an installment outstanding amount.
- No cross-customer or cross-subscription allocation.
- Client cannot submit paid totals, balances or allocation rows.

6. Overpayment
- Reject payment amount greater than the true remaining obligation.
- No wallet, credit balance or change behavior in V1 Core.

7. Payment method vocabulary
Closed V1 values:
- cash
- bank_transfer
- mobile_money

paymentMethod is required.

externalReference:
- optional;
- normalize safely when present;
- do not put it in generic audit metadata.

8. Payment events
Admin payment entry is immediately authoritative/confirmed.

Server sets:
- customerId from subscription
- currency = XAF
- confirmedAt
- confirmedByUserId
- allocation targets
- financial status

Confirmed events are append-only.

9. Corrections
Never edit/delete a confirmed payment event.

Correction:
- creates a compensating/referencing financial event;
- correctionOfEventId points to the original/target event;
- do not use negative ambiguous amounts;
- cannot compensate more than the remaining uncompensated amount;
- allocation effects are compensated atomically;
- business refunds remain V1.1.

10. Due/overdue
S6.1 uses read-time derivation.

No scheduled overdue job.

Derived installment read states:
- upcoming
- due
- partially_paid
- paid
- overdue

Do not silently introduce waived/cancelled financial behavior unless explicitly required by an approved payment-plan command.

11. Plan revision
Revision creates a NEW payment plan.
Never rewrite an existing committed plan/installments.

Historical:
- payment plans remain
- installments remain
- allocations remain

revisedFromPlanId links revisions.

Preferred representation:
- historical allocations remain on old installments;
- subscription-level paid total is derived across authoritative confirmed allocations;
- revised active schedule represents remaining obligation;
- do not migrate/copy old allocations into fake new payment events.

If implementation inspection shows this representation conflicts materially with current schema or invariants:
STOP implementation of revision only and report the conflict.
Do not silently choose a materially different business model.

==================================================
REUSABLE PATTERNS
==================================================

Apply the mechanisms from:

- Payment Event and Allocation
- Installment Schedule
- Append-Only Financial Ledger
- PrestiX Payment and Installment Engine
- Atomic Business Operation
- Idempotent Business Command
- Audit Event System
- Shared API Contracts
- Domain Error Taxonomy

Adapt them to K'FIT terminology and rules.
Do not copy PrestiX invoice/domain assumptions blindly.

==================================================
IMPLEMENTATION ORDER
==================================================

Follow server-first order exactly:

1. Shared contracts
2. Schema/migration hardening
3. Repository
4. Service
5. Controller
6. Route/middleware
7. Server/unit tests
8. PostgreSQL integration tests
9. Client API
10. French Finance UI
11. Static review / QA report

Do not start client behavior until authoritative server behavior is implemented and inspected.

==================================================
SCHEMA REVIEW / HARDENING
==================================================

Inspect existing data before proposing migration.

Expected minimal additive hardening:

A. payment_plans.revised_from_plan_id
- add self-FK RESTRICT if missing.

B. one active payment plan per subscription
- enforce with PostgreSQL partial unique index:
  subscription_id WHERE status = 'active'
  unless an equivalent stronger invariant already exists.

C. payment_events.correction_of_event_id
- add self-FK RESTRICT if missing.

D. DB-backed idempotency
Add a stable payment-command identity.

Preferred:
- explicit idempotencyKey / commandKey column on payment_events
- unique where applicable.

Do not rely on process memory.

A replay of the same logical payment command must return/recover the original authoritative result or reject with a stable duplicate outcome without inserting a second payment.

E. Do NOT create:
- extras table
- credit account
- refunds table
- generic ledger account hierarchy
unless explicitly required by the already-approved S6.1 rules.
Those are outside scope.

Before migration generation:
- inspect rows for FK conflicts;
- inspect whether multiple active plans already exist;
- document migration/backfill risk;
- no destructive migration.

==================================================
API
==================================================

Admin read:

GET /admin/subscriptions/:subscriptionId/finance

Return an authoritative read model with:
- subscriptionId
- subscriptionStatus
- agreedAmountXaf
- confirmedPaidXaf
- remainingXaf
- financialStatus
- overdue boolean/read modifier
- active payment plan
- installments with:
  amountXaf
  paidXaf
  remainingXaf
  effectiveStatus
- immutable payment history
- allocations grouped/readably

Payment plans:

POST /admin/subscriptions/:subscriptionId/payment-plans

POST /admin/payment-plans/:paymentPlanId/activate

POST /admin/payment-plans/:paymentPlanId/revise

POST /admin/payment-plans/:paymentPlanId/cancel

Payments:

POST /admin/subscriptions/:subscriptionId/payments

POST /admin/payment-events/:paymentEventId/correct

No generic PATCH status route.

All cookie-authenticated mutations:
- auth required
- admin role required
- existing CSRF/origin protections preserved

==================================================
COMMAND INPUT OWNERSHIP
==================================================

Client may provide for payment:
- amountXaf
- paymentMethod
- occurredAt
- optional externalReference
- stable idempotency key

Client must NOT provide:
- customerId
- currency
- confirmedAt
- confirmedByUserId
- paid total
- outstanding total
- allocation rows
- installment statuses
- plan status
- subscription status

Reject unknown fields where existing shared-contract convention supports it.

==================================================
FINANCIAL STATUS
==================================================

Subscription financial status read model:

unpaid:
paid = 0 and remaining > 0

partially_paid:
0 < paid < agreed

paid:
remaining = 0

overdue is an operational read modifier when an active obligation is past due and still outstanding.

Do not make overdue replace the settlement status unless the existing contract architecture clearly requires a single status field.
Prefer:
financialStatus + hasOverdueInstallment.

==================================================
TRANSACTION / CONCURRENCY
==================================================

Payment hard commit:

transaction:
1. lock subscription
2. validate subscription/customer relationship
3. lock current active plan / eligible installments in deterministic order
4. recompute true net confirmed paid amount
5. calculate remaining obligation
6. resolve idempotency
7. reject overpayment
8. insert confirmed payment event
9. compute FIFO allocation server-side
10. insert payment allocation rows
11. update cached installment/plan states if retained
12. insert transaction-scoped audit
13. commit

Concurrent attempts against the final outstanding amount must serialize.

Example:
remaining = 10,000 XAF
two concurrent payments of 10,000

Expected:
- only one may commit as a normal payment;
- the other gets a typed conflict/overpayment/duplicate result;
- total allocations never become 20,000.

Audit failure must roll back:
- payment event
- allocations
- cached status changes

==================================================
CORRECTION
==================================================

Correction is an explicit command.

Requirements:
- original confirmed event remains immutable;
- correction references original;
- same customer/subscription financial scope;
- compensate existing allocations safely;
- duplicate/concurrent correction cannot reverse twice;
- correction does not become a customer refund workflow;
- subscription lifecycle untouched.

Document the exact eventType vocabulary selected.

Keep it closed and typed.

==================================================
AUDIT
==================================================

Suggested events:

finance.payment_plan_created
finance.payment_plan_activated
finance.payment_plan_revised
finance.payment_plan_cancelled
finance.payment_recorded
finance.payment_corrected

Safe audit metadata only:
- paymentPlanId
- paymentEventId
- subscriptionId
- installment IDs where needed
- amountXaf
- currency
- allocationCount
- paymentMethod
- structural from/to status
- correctionOfEventId

Do NOT write into generic audit metadata:
- customer name/phone/email
- externalReference
- free-text reason
- provider payload
- sensitive notes

Use transaction-scoped audit for authoritative writes.

==================================================
ERROR TAXONOMY
==================================================

Use stable FINANCE_* domain errors, aligned with project conventions.

At minimum cover:

FINANCE_NOT_FOUND
FINANCE_INVALID_INPUT
FINANCE_PLAN_ALREADY_ACTIVE
FINANCE_PLAN_TOTAL_MISMATCH
FINANCE_INSTALLMENTS_TOTAL_MISMATCH
FINANCE_INVALID_STATE
FINANCE_PAYMENT_EXCEEDS_OUTSTANDING
FINANCE_DUPLICATE_PAYMENT
FINANCE_CORRECTION_INVALID
FINANCE_CONCURRENCY_CONFLICT
FINANCE_ROUTE_UNEXPECTED_FAILURE

Do not expose raw database errors.

==================================================
CLIENT
==================================================

After server behavior/tests are ready:

Add a French Finance area using the existing customer/subscription profile patterns.

Display:
- Montant convenu
- Payé
- Reste à payer
- Statut financier
- Échéancier
- Historique des paiements

Actions:
- Créer l'échéancier
- Réviser l'échéancier when allowed
- Enregistrer un paiement
- Corriger un paiement with explicit confirmation

Payment-method labels:
- Espèces
- Virement bancaire
- Mobile Money

Client consumes server-calculated values.
Do not duplicate allocation or financial-status logic in React.

Provide proper:
- loading
- empty
- error
- disabled
- confirmation states

==================================================
TESTS
==================================================

Unit/shared/HTTP coverage:

1. XAF integer validation.
2. valid payment method values.
3. invalid payment method rejected.
4. unknown/mass-assigned financial fields rejected.
5. plan total constraints.
6. exact installment sum.
7. positive installment values.
8. strict dates.
9. auth/admin/CSRF.
10. FIFO allocation.
11. financial status derivation.
12. overpayment rejection.
13. correction semantics.
14. original payment remains immutable.
15. subscription status is never modified.

PostgreSQL integration:

1. valid plan + installments commit atomically.
2. total mismatch creates zero rows.
3. only one active plan under concurrency.
4. partial payment FIFO.
5. one payment spanning installments.
6. final payment settles obligations.
7. overpayment rejected with zero financial writes.
8. idempotent retry creates exactly one payment event.
9. concurrent final-balance payments cannot over-allocate.
10. event + allocations atomic.
11. forced audit failure rolls everything back.
12. revision preserves historical plan/installments/allocations.
13. revision does not double-count historical paid amounts.
14. correction appends a compensating event.
15. duplicate/concurrent correction cannot compensate twice.
16. payment never modifies subscription.status.
17. correction never modifies subscription.status.
18. due/overdue changes via read-time clock/date evaluation without DB mutation.
19. audit contains no externalReference/customer PII/free text.

Do not weaken existing tests.

==================================================
VALIDATION / EXECUTION RULES
==================================================

You may run only commands permitted by the local Agent Kit / VS Code approval configuration.

Do not claim Fred validation.

At the end, report separately:

- implemented
- statically reviewed
- agent-tested
- requires Fred local validation

Do NOT mark S6.1 Terminé.
Do NOT update changelog.md with S6.1 as validated.
Do NOT start S6.2.

==================================================
EXPECTED IMPLEMENTER REPORT
==================================================

Return:

1. Existing finance foundation found.
2. Reusable patterns applied.
3. Schema changes and migration rationale.
4. Exact business invariants implemented.
5. Shared contracts/routes added.
6. Service/transaction design.
7. Concurrency/idempotency behavior.
8. Correction behavior.
9. Client integration.
10. Tests added.
11. Commands run and exact results.
12. Files changed.
13. Migration filename if any.
14. Known limitations.
15. Exact commands Fred must run next for local Gate 2.

Stop after S6.1 implementation and handoff.

==================================================
FRED-APPROVED PLANNER CLARIFICATION — 2026-10-22
==================================================

The remaining-only revision representation is retained. A valid historical-payment
correction commits without rewriting original payments, allocations, amounts or dates.
If the active schedule no longer covers the true remaining subscription obligation,
the read model exposes scheduleRequiresRevision and new payment commands are blocked
until the coach explicitly supplies a replacement schedule for that remainder.
Successful idempotent replays are resolved before the new-payment gate.

Revision atomically supersedes the previous active plan and creates/activates its
replacement under the subscription lock. Stale installment totals are rejected.
Corrections never silently reopen settled/cancelled plans. Outstanding debt with no
active plan requires explicit creation/activation of a replacement schedule, retaining
lineage. Cancellation never waives debt. Unscheduled gaps receive no invented due date
and are not themselves labeled overdue. No positive replacement schedule is accepted
when the true remainder is zero.

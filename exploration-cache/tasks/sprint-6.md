<<<<<<< HEAD
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
=======
# K'FIT — Sprint 6 execution spec

## Objective

Deliver the V1 Core finance workflow for subscription obligations, payments, quotes, payment proofs and receipts while keeping financial state independent from subscription lifecycle.

## Ordered tasks

1. S6.1 — Financial ledger: payment plans, installments, confirmed payment events and allocations — APPROVED_FOR_IMPLEMENTATION.
2. S6.2 — Versioned quotes, secure customer acceptance and subscription synchronization — CLOSED until S6.1 validation.
3. S6.3 — Customer payment-proof upload and structured coach review workflow — CLOSED until S6.2 validation.
4. S6.4 — Sequential payment receipts and secure sharing preparation — CLOSED until S6.3 validation.

Backlog rows labelled coach sign-off / bug list / full UAT are not Sprint 6 finance implementation slices; final V1 Core UAT remains a later sprint gate.

## Source business rules

- V1 currency is XAF only.
- Partial payment is allowed.
- Payment/financial state is independent from subscription status and must never silently activate, pause, complete or cancel a subscription.
- Financial history is preserved; confirmed money events are never overwritten.
- Corrections use compensating/referencing entries.
- Payment proof is evidence only and is not itself authoritative money.
- Credits/refunds/advanced cancellation settlement are V1.1 and remain out of S6.1.

## Reusable implementation patterns inspected

- PrestiX Payment and Installment Engine.
- Payment Event and Allocation.
- Installment Schedule.
- Append-Only Financial Ledger.
- Existing K'FIT Atomic Business Operation, Idempotent Business Command, Audit Event System, Shared API Contracts and Domain Error Taxonomy conventions.

### Adaptation to K'FIT

Reusable mechanisms:
- separate money received from allocation of that money;
- immutable payment/allocation history;
- server-authoritative outstanding balances and status;
- FIFO allocation by due order by default;
- transactionally lock obligations before allocating;
- never trust browser-supplied paid/outstanding totals;
- payment and allocations commit atomically;
- corrections reference/compensate prior authoritative events.

K'FIT-specific invariants:
- XAF integer arithmetic only;
- subscription agreedPriceXaf is the S6.1 payable total;
- subscription lifecycle remains independent;
- no invoice model is introduced in V1 Core;
- no generic credit/refund ledger is introduced in S6.1;
- no extras/extra-charge model is invented until an authoritative K'FIT extras domain exists.

## Existing schema reused
>>>>>>> 83f8639031348be71b14a3eeea3d95cc9eac1932

- payment_plans
- installments
- payment_events
- payment_allocations
- subscriptions.agreed_price_xaf
<<<<<<< HEAD

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
=======
- customers
- audit_events

The existing finance foundation already models the V1 obligation and allocation chain.

### Schema hardening proposed for S6.1

Minimal additive migration only where required for guarantees:

1. payment_plans.revised_from_plan_id:
   - add self-FK RESTRICT if not already present;
   - prevent self-reference in service validation.

2. Only one active payment plan per subscription:
   - partial unique index on subscription_id where status = 'active'.

3. payment_events.correction_of_event_id:
   - add self-FK RESTRICT if not already present;
   - correction/reversal commands must reference a confirmed prior payment event.

4. Idempotency:
   - add a stable command/idempotency key to payment_events OR another equivalent DB-backed unique intent identity.
   - exact implementation chosen during coding, but duplicate retry must not create a second authoritative payment.

5. Keep payment_allocations.extra_id unused/null in S6.1.
   - no new extras table or fake FK.

Before migration generation, inspect existing rows for conflicts with new FK/uniqueness rules. No destructive changes.

## S6.1 domain model

### Payment plan

One subscription may have historical payment-plan revisions, but at most one active plan.

Initial plan:
- explicitly created by the coach; never silently inferred/activated on read;
- totalExpectedXaf must equal the authoritative subscription agreedPriceXaf in S6.1;
- zero-price subscriptions do not need installments; if a zero-total plan is retained, it is immediately settled and cannot receive positive allocations;
- positive plans require one or more installments;
- installment amounts must sum exactly to totalExpectedXaf;
- each amount is a positive integer XAF;
- due dates are explicit coach input; S6.1 does not invent payment dates from subscription dates.

Plan states used:
- draft
- active
- superseded
- settled
- cancelled

Only named commands may change plan state.

### Installments

Installments are immutable obligations within a committed active/superseded plan except through explicit plan revision.

Stored fields remain:
- sequenceNumber
- amountXaf
- dueDate
- status

Authoritative paid amount is always derived from payment_allocations.

Effective installment state:
- upcoming: not yet due and no allocation;
- due: due instant reached, outstanding remains, but not yet overdue;
- partially_paid: positive allocations below amount;
- paid: allocations equal amount;
- overdue: due date passed and outstanding remains;
- cancelled/waived are reserved for explicit later commands and are not silently created by S6.1.

Because wall-clock passage alone changes due/overdue, the API read model derives effective due/overdue from dueDate + allocations. S6.1 does not add a scheduler. Sprint 7 may materialize operational overdue queues later.

### Plan revision

A schedule revision creates a new payment_plan linked by revisedFromPlanId; it never mutates the old committed plan/installments.

Proposed constraints:
- one new active plan supersedes the prior active plan atomically;
- paid/allocation history on old installments remains untouched;
- total expected remains equal to subscription agreedPriceXaf in S6.1;
- already-allocated money is carried into the financial read model, not copied into fake new payment events;
- revision cannot make total planned obligation lower than already confirmed net applied amount;
- revision reason required and audited structurally; free text stays out of generic audit metadata.

Exact allocation treatment across a revised schedule must preserve provenance. Preferred S6.1 approach:
- historical allocations stay attached to their original installments;
- subscription-level paid total derives across all confirmed allocations for the subscription;
- new active plan read model computes remaining payable as agreed total minus confirmed net allocations;
- new schedule represents only the remaining obligation OR, if the schedule represents full total, service logic must prevent double-counting historical allocations.
During implementation choose one representation and lock it with integration tests before client work. Preferred: schedule only the remaining obligation on revision, because it keeps old paid installments historical and avoids synthetic allocation migration.

### Confirmed payment event

S6.1 admin payment entry is an authoritative confirmed payment, not a payment-proof submission.

Payment event:
- customerId comes from the subscription/customer relationship;
- eventType uses a closed S6.1 vocabulary;
- amountXaf positive integer;
- currency fixed to XAF server-side;
- paymentMethod is required and uses the closed V1 vocabulary: `cash`, `bank_transfer`, `mobile_money`;
- externalReference optional but normalized when supplied;
- occurredAt explicit and cannot be future-invalid;
- confirmedAt / confirmedByUserId set server-side;
- metadataJson contains provider/technical metadata only when justified; not client free text.

### Corrections

Confirmed events are never edited/deleted.

S6.1 supports an explicit reversal/correction command for operator mistakes:
- references one prior confirmed event;
- creates a compensating financial event with explicit semantic direction;
- does not use negative ambiguous amounts;
- cannot reverse more than the remaining unreversed amount;
- allocation effects are compensated atomically;
- business refunds to customers remain V1.1 and are not represented as corrections.

### Allocation

Default allocation policy:
- same subscription only;
- oldest effective due date first, then sequence number;
- partial allocation allowed;
- no allocation may exceed installment outstanding amount;
- payment may touch multiple installments;
- no cross-customer allocation;
- no client-supplied paid/outstanding balance.

S6.1 proposes no arbitrary manual target override in the first slice. If needed later, add an explicit audited command rather than a browser-controlled allocation array.

Excess payment:
- S6.1 should reject a payment amount greater than the remaining subscription obligation.
- Do not create customer credit/change behavior because credits/refunds are V1.1 and there is no authoritative credit account model in V1 Core.

Reconciliation invariants:
- sum(payment allocations) = payment event applied amount;
- S6.1 applied amount = event amount for ordinary payments because overpayment is rejected;
- allocation sum per installment <= installment amount;
- total net confirmed allocations for subscription <= agreedPriceXaf;
- concurrency cannot over-allocate an installment or subscription.

## Financial read model

For a subscription expose:
- agreed amount;
- confirmed net paid amount;
- remaining amount;
- financial status;
- active payment plan and installments;
- immutable payment-event/allocation history.

Proposed financial status:
- unpaid: paid = 0 and remaining > 0;
- partially_paid: 0 < paid < agreed amount;
- paid: remaining = 0;
- overdue: operational modifier/read-state when at least one active-plan obligation is past due with remaining balance.

Do not introduce refunded/waived in S6.1 commands.

Subscription status is returned separately and never derived from financial status.

## API proposal — admin

Read:
- GET /admin/subscriptions/:subscriptionId/finance

Payment plans:
- POST /admin/subscriptions/:subscriptionId/payment-plans
- POST /admin/payment-plans/:paymentPlanId/activate
- POST /admin/payment-plans/:paymentPlanId/revise
- POST /admin/payment-plans/:paymentPlanId/cancel

Payments:
- POST /admin/subscriptions/:subscriptionId/payments
- POST /admin/payment-events/:paymentEventId/correct

No generic PATCH status route.
All mutations require authenticated admin + same-origin/CSRF protection.

## Shared contract rules

- closed command DTOs; reject unknown/mass-assigned fields;
- amounts are integer XAF;
- server computes customerId, currency, paid totals, allocation targets and statuses;
- no caller can submit confirmedAt, confirmedByUserId, allocation rows, paid totals or derived status;
- stable FINANCE_* error taxonomy.

Candidate errors:
- FINANCE_NOT_FOUND
- FINANCE_INVALID_INPUT
- FINANCE_PLAN_ALREADY_ACTIVE
- FINANCE_PLAN_TOTAL_MISMATCH
- FINANCE_INSTALLMENTS_TOTAL_MISMATCH
- FINANCE_INVALID_STATE
- FINANCE_PAYMENT_EXCEEDS_OUTSTANDING
- FINANCE_DUPLICATE_PAYMENT
- FINANCE_CORRECTION_INVALID
- FINANCE_CONCURRENCY_CONFLICT
- FINANCE_ROUTE_UNEXPECTED_FAILURE

## Concurrency / hard commit

Plan creation/activation/revision:
- lock subscription;
- lock current active payment plan when applicable;
- validate authoritative agreed price;
- persist plan/installments/status changes;
- write transaction-scoped audit;
- commit together.

Payment:
- lock subscription + active financial obligation rows in deterministic order;
- recompute outstanding balance inside transaction;
- resolve idempotency;
- insert confirmed payment event;
- insert allocation rows FIFO;
- update cached installment/plan settlement state where applicable;
- write audit in same transaction;
- commit.

Concurrent payments against the final outstanding amount must serialize: at most the true remaining amount commits.

Audit failure must roll back payment + allocations + cached state.

## Audit

Suggested events:
- finance.payment_plan_created
- finance.payment_plan_activated
- finance.payment_plan_revised
- finance.payment_plan_cancelled
- finance.payment_recorded
- finance.payment_corrected

Safe metadata only:
- structural IDs;
- amountXaf;
- currency;
- allocation count;
- from/to plan state;
- payment method code if non-sensitive;
- correction target ID.

Do not place customer identity, external reference, free-text reasons or provider payload in generic audit metadata.

## Client scope

Server first. Client only after server Gate is green.

French subscription Finance panel:
>>>>>>> 83f8639031348be71b14a3eeea3d95cc9eac1932
- Montant convenu
- Payé
- Reste à payer
- Statut financier
- Échéancier
- Historique des paiements
<<<<<<< HEAD

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
=======
- action Créer/modifier l'échéancier
- action Enregistrer un paiement
- explicit confirmation before correction

UI never computes authoritative balances or decides allocation targets.

## Out of scope S6.1

- quotes/quote acceptance;
- customer payment-proof upload/review;
- receipts/PDF receipts;
- online payment/provider API;
- customer credit wallet;
- refunds/reimbursements;
- waived obligations;
- penalties/late fees;
- arbitrary extras/extra-charge domain;
- automatic reminders/notifications;
- scheduled overdue jobs;
- subscription activation/cancellation/completion changes;
- finance analytics/dashboard.

## Validation target

Unit/shared/HTTP:
1. XAF integer validation and unknown-field rejection.
2. payment plan total must equal subscription agreed price.
3. installment amounts positive and exact sum.
4. due dates parse strictly.
5. auth/admin/CSRF on every mutation.
6. server-owned customer/currency/status/allocation fields.
7. stable typed errors and safe unexpected failures.
8. financial status derived independently from subscription status.
9. FIFO allocation policy unit tests.
10. correction semantics never mutate original payment.

PostgreSQL integration:
1. create valid active plan and installments atomically;
2. reject total mismatch with zero rows;
3. one active plan maximum under concurrency;
4. partial payment allocates oldest installment first;
5. payment spanning multiple installments writes separate allocations;
6. exact final payment settles plan;
7. overpayment rejected with zero financial writes;
8. duplicate/retried payment intent creates one event only;
9. concurrent final-balance payments cannot over-allocate;
10. payment event and allocations commit together;
11. audit FK failure rolls back payment/allocation;
12. plan revision preserves historical plan/installments/allocations;
13. revision cannot reduce below already paid net amount;
14. correction appends compensating event and preserves original;
15. duplicate/concurrent correction cannot reverse twice;
16. payment/correction never changes subscription.status;
17. effective overdue read state changes from dueDate without read-time DB mutation;
18. generic audit excludes external references/free text/customer PII.

Fred Gate 2:
- create an installment schedule for an existing subscription;
- record a partial payment and inspect FIFO allocation;
- record a payment spanning installments;
- finish settlement and verify paid status;
- attempt overpayment and duplicate retry;
- exercise one explicit correction;
- confirm subscription lifecycle status remains unchanged;
- DBeaver inspect payment_plans, installments, payment_events, payment_allocations and audit_events.

## Gate 1 decisions proposed

1. Reuse payment_plan/installments as the S6.1 obligation model; do not add a generic charges table.
2. Total payable for S6.1 equals subscription.agreedPriceXaf; extras remain unused/deferred.
3. Coach explicitly supplies installment dates/amounts; K'FIT invents no due-date schedule.
4. Default allocation is FIFO by dueDate then sequence; no arbitrary manual override in S6.1.
5. Overpayment is rejected; no credit/change wallet in V1 Core.
6. Confirmed admin payment is immediately authoritative; customer proof remains S6.3 evidence workflow.
7. Corrections use append-only compensating events; refunds remain V1.1.
8. Due/overdue is derived at read time in S6.1; no scheduler until Sprint 7.
9. Plan revision creates a new plan and preserves historical rows.
10. No Sprint 6 implementation before Fred approves Gate 1.

Gate 1 payment-method vocabulary approved:
- `cash`
- `bank_transfer`
- `mobile_money`

## S6.1 Gate 1 — approved 2026-10-22

Fred approved the complete S6.1 plan and the closed V1 payment-method vocabulary above. Implementation is authorized on `main` for S6.1 only, server-first. S6.2 remains closed until S6.1 is locally validated by Fred.
>>>>>>> 83f8639031348be71b14a3eeea3d95cc9eac1932

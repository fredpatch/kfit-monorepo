# K'FIT — Sprint 6 execution spec

## Objective

Deliver the V1 Core finance workflow for subscription obligations, payments, quotes, payment proofs and receipts while keeping financial state independent from subscription lifecycle.

## Ordered tasks

1. S6.1 — Financial ledger: payment plans, installments, confirmed payment events and allocations — IMPLEMENTED / Gate 2 DB acceptance pending.
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

- payment_plans
- installments
- payment_events
- payment_allocations
- subscriptions.agreed_price_xaf
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
- Montant convenu
- Payé
- Reste à payer
- Statut financier
- Échéancier
- Historique des paiements
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


## S6.1 implementation and validation status — 2026-10-22

Implementation commit: `1050fcb` (`feat(finance): implement authoritative subscription ledger`).

Implemented:
- shared finance contracts and closed payment methods `cash | bank_transfer | mobile_money`;
- additive migration `0009_puzzling_purifiers.sql`;
- one-active-plan DB protection, revision/correction self references and DB-backed payment command identity;
- finance repository/service/controller/routes using Service → Controller → Route;
- authoritative FIFO allocations, partial payments, overpayment rejection, append-only corrections and transaction-scoped audits;
- French Finance panel on customer/subscription profile;
- no subscription lifecycle writes;
- S6.2+ scope remains untouched.

Agent validation reported green:
- typecheck;
- server tests 371/371;
- shared tests 49/49;
- PostgreSQL integration 394/394, including 46 S6.1 cases;
- production build;
- schema check;
- diff whitespace check;
- six audit-failure rollback finance scenarios.

Fred validation:
- browser flow approved on 2026-10-22.

Remaining Gate 2:
- Fred DBeaver inspection of `payment_plans`, `installments`, `payment_events`, `payment_allocations` and related `audit_events`.
- Until that is green, S6.1 is not Terminé and no validated S6.1 changelog entry is allowed.

Repository merge note:
- merge commit `ee793c2` accidentally persisted literal conflict markers in `TASKS.md` and this file;
- documentation state was repaired afterward without changing S6.1 business implementation.


## S6.2 Gate 1 — approved 2026-10-22

Fred approved the complete S6.2 plan.

Locked decisions:
- Quotes are created for an existing subscription/customer after conversion; requestId is derived from subscription.sourceRequestId when present.
- Drafts have no official quote number. First issue allocates `DEV-YYYY-NNNN` under a concurrency-safe annual counter in the same transaction.
- Issued versions are immutable. Changes create a new version.
- Public response commands: `accepted`, `declined`, `changes_requested`.
- Public access uses scoped, expiring, revocable, hash-only secure tokens with rate limiting and external-access audit.
- PDFs are deterministic artifacts rendered from immutable quote-version snapshots and linked through private document storage.
- Customer acceptance never writes subscription commercial state.
- Coach synchronization is a separate explicit command.
- Synchronization records the accepted quote version and may update subscription.agreed_price_xaf only when no authoritative payment plan/payment activity exists.
- If finance activity exists and accepted amount differs, synchronization rejects with a typed conflict; no retroactive ledger rewrite.
- S6.2 does not change service, variant, component entitlements or duration; subscription-amendment semantics remain out of scope.
- Quote expiry/validity and terms are explicit coach/configured inputs. No production legal wording is invented by the app.
- Storage/API currency remains XAF; customer-facing display may show FCFA.
- S6.3 remains closed until S6.2 local validation.

Applicable reusable patterns:
- Concurrent Sequential Numbering
- Historical Business Snapshot
- Business Document PDF Generation
- Secure External Document Sharing
- Explicit State Transitions
- Hard Commit Point
- Atomic Business Operation
- Audit Event System
- Shared API Contracts
- Domain Error Taxonomy

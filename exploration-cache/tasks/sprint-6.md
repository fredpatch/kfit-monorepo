# K'FIT - Sprint 6 execution spec

## Objective

Deliver the V1 Core finance workflow for subscription obligations, payments, quotes, payment proofs and receipts while keeping financial state independent from subscription lifecycle.

## Ordered tasks

1. S6.1 - Financial ledger: payment plans, installments, confirmed payment events and allocations - CLOSED / validated 2026-10-22.
2. S6.2 - Versioned quotes, secure customer acceptance and subscription synchronization - CLOSED / validated 2026-10-22.
3. S6.3 - Customer payment-proof upload and structured coach review workflow - CLOSED / validated 2026-10-22.
4. S6.4 - Sequential payment receipts and secure sharing preparation - CLOSED / validated 2026-10-23.

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

## API proposal - admin

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
- stable FINANCE\_\* error taxonomy.

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

## S6.1 Gate 1 - approved 2026-10-22

Fred approved the complete S6.1 plan and the closed V1 payment-method vocabulary above. Implementation is authorized on `main` for S6.1 only, server-first. S6.2 remains closed until S6.1 is locally validated by Fred.

## S6.1 implementation and validation status - 2026-10-22

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

Gate 2 completed:

- Fred confirmed DBeaver finance/audit inspection green on 2026-10-22.
- S6.1 is locally validated and closed.

Repository merge note:

- merge commit `ee793c2` accidentally persisted literal conflict markers in `TASKS.md` and this file;
- documentation state was repaired afterward without changing S6.1 business implementation.

## S6.2 - Fred-approved implementation request, 2026-10-22

Implement K'FIT Sprint 6 slice S6.2 only.

Branch: main
Workflow state: APPROVED_FOR_IMPLEMENTATION

Before coding inspect:

- TASKS.md
- exploration-cache/tasks/sprint-6.md
- exploration-cache/project/database-schema.md
- exploration-cache/project/relational-contract.md
- exploration-cache/project/state-machines.md
- exploration-cache/project/decisions.md
- exploration-cache/technical/gotchas.md
- packages/server/src/db/schema/finance.ts
- packages/server/src/db/schema/documents.ts
- current documents/secure-token implementation
- current subscription/request conversion implementation
- current S6.1 finance module

Do NOT implement S6.3, payment-proof review, receipts, refunds, credits, extras, analytics or Sprint 7 work.

==================================================
GOAL
==================================================

Implement versioned quotations with:

- existing subscription/customer ownership;
- immutable issued quote versions;
- deterministic quote PDF generation;
- secure temporary public quote access;
- explicit customer response:
  accepted
  declined
  changes_requested
- explicit coach synchronization after acceptance;
- no automatic subscription mutation from public acceptance.

==================================================
LOCKED BUSINESS RULES
==================================================

1. Quote lifecycle location
   Quotes are created only for an existing subscription/customer after request conversion.

Server derives:

- customerId from subscription
- requestId from subscription.sourceRequestId when present
- subscriptionId from route/context

Do not create customers or subscriptions from the quote flow.

2. Official quote numbering
   Draft quote has no official final number.

First issue allocates:

DEV-YYYY-NNNN

Example:
DEV-2026-0001

Use Concurrent Sequential Numbering:

- PostgreSQL-backed counter
- annual partition
- row lock
- allocate inside the same transaction as first issuance
- database uniqueness constraint
- never MAX(number)+1
- never accept number from client

Reissuing a later version of the same quote keeps the same quote number.

3. Version immutability
   Draft version may be edited.

Once version is issued:

- amount frozen
- service snapshot frozen
- terms snapshot frozen
- validity/expiry frozen
- PDF frozen
- no update path may edit it

Changes require creation of version N+1.

Previous versions remain reconstructable.

4. Public response
   Closed response vocabulary:

- accepted
- declined
- changes_requested

Secure access:

- random bearer
- hash only stored
- scoped to exact quote version and quote-response action
- expiry
- revocation
- rate limiting
- external access audit
- no raw token in audit/log/database metadata

Viewing metadata/PDF does NOT accept the quote.

Successful response is single-use/idempotent.

5. PDF
   Generate deterministic French PDF from quote-version snapshots.

Do NOT render from:

- live React DOM
- mutable service catalogue
- live subscription fields after issue

Use:
Authoritative snapshot
→ normalized print model
→ pinned template version
→ Puppeteer renderer
→ private stored PDF/document version

Reuse the existing private document/PDF infrastructure where practical.

quote_versions.pdf_document_id must link the generated artifact.

Customer-facing currency label:
FCFA

Persistent/API currency:
XAF

Do not invent production legal language.

6. Acceptance vs synchronization
   Public acceptance:

- records immutable acceptance evidence
- updates quote/version lifecycle only
- DOES NOT mutate subscription.agreed_price_xaf
- DOES NOT change service
- DOES NOT change variant
- DOES NOT change duration
- DOES NOT change components
- DOES NOT change payment plan
- DOES NOT change subscription status

Coach must invoke explicit synchronization command.

Synchronization:

- requires accepted current/selected quote version
- stores exact accepted quote-version reference on subscription or equivalent authoritative linkage
- may update subscription.agreed_price_xaf if safe
- does not alter service/variant/components/duration in S6.2

If accepted quote amount differs from current agreedPriceXaf:

- allow synchronization only if there is no authoritative finance activity that would become inconsistent
- finance activity includes committed/active/settled payment plan, confirmed payment event, or payment allocation for subscription
- if incompatible finance activity exists, reject with typed conflict
- never rewrite ledger/history

7. Validity and terms
   Quote expiry/validity is explicit coach input.
   Commercial terms are explicit input/configured business data.

Do not auto-generate legal clauses.

==================================================
STATE MODEL
==================================================

Quote parent suggested states:

- draft
- issued
- accepted
- declined
- changes_requested
- cancelled

Version states should preferably be derived from timestamps/response evidence rather than redundant mutable flags where possible.

Only named commands transition state.

No generic PATCH status.

Expected lifecycle examples:

draft
→ issue V1
→ accepted

draft
→ issue V1
→ changes_requested
→ create V2 draft
→ issue V2
→ accepted

draft
→ issue V1
→ declined

Issued/accepted versions remain immutable forever.

Creating V2 must not destroy V1 acceptance/response history.

==================================================
SCHEMA HARDENING
==================================================

Inspect existing rows before migration.

Likely required changes:

quotes:

- quoteNumber nullable until first issue
- currentVersionId proper FK if absent
- status constraints/indexes as appropriate

quote_versions:

- pdfDocumentId FK if appropriate
- validity/expiry field
- issuedAt
- acceptedAt
- declinedAt
- changesRequestedAt or equivalent response representation
- immutable snapshot fields sufficient to render historical PDF
- possibly templateVersion
- possibly response evidence/reference

subscriptions:

- acceptedQuoteVersionId nullable FK or equivalent exact-version authoritative linkage

numbering:

- introduce/reuse a generic business-document counters table if project design supports future receipts
- annual quote partition
- row locking

secure_access_tokens:
reuse existing polymorphic mechanism.
Suggested:
resourceType = quote_version
action = quote_response

Do not invent a second public-token table.

If the existing schema makes a materially different but safer minimal design obvious, explain it before implementing that deviation.

No destructive migration.

==================================================
SNAPSHOT CONTENT
==================================================

At issuance snapshot all facts needed for historical rendering.

At minimum:

- quote number
- quote version number
- customer display identity needed for document
- service label
- variant label if applicable
- quoted amount XAF
- duration/commercial facts actually shown
- issue date
- valid-until date
- explicit terms
- template version

Avoid unnecessary customer PII duplication.

Historical PDFs must not change if:

- customer later edits profile
- service renamed
- variant renamed
- price catalogue changes
- subscription later synchronizes

==================================================
API PROPOSAL
==================================================

Admin:

GET
/admin/subscriptions/:subscriptionId/quotes

GET
/admin/quotes/:quoteId

POST
/admin/subscriptions/:subscriptionId/quotes

POST
/admin/quotes/:quoteId/versions

PUT or named POST
/admin/quote-versions/:versionId/edit-draft

POST
/admin/quote-versions/:versionId/issue

GET
/admin/quote-versions/:versionId/pdf

POST
/admin/quote-versions/:versionId/share

POST
/admin/quote-links/:tokenId/revoke

POST
/admin/quote-versions/:versionId/synchronize

POST
/admin/quotes/:quoteId/cancel

Prefer named commands over generic lifecycle PATCH endpoints.

Public:

GET
/public/quotes/:token

GET
/public/quotes/:token/pdf

POST
/public/quotes/:token/respond

respond body:
{
decision: "accepted" | "declined" | "changes_requested"
}

If changes_requested needs a customer message:
do not add free-text by default unless the approved product contract already requires it.
Prefer a structured response first.

==================================================
TRANSACTIONS
==================================================

First issue hard commit transaction:

1. lock quote
2. lock draft version
3. validate completeness
4. allocate annual quote number if parent has none
5. freeze snapshot
6. mark version issued
7. generate/store authoritative PDF according to existing hard-commit/file strategy
8. update parent currentVersionId/status
9. write audit
10. commit

If external/Puppeteer file generation cannot safely execute inside the DB transaction:
follow the project Hard Commit Point pattern.
Use prepare → render to temp/private staging → DB transaction finalize → cleanup/compensation.
Never leave an issued version without its required PDF.

Public response transaction:

1. resolve token hash
2. lock token
3. validate expiry/revocation/use
4. lock quote/version
5. ensure version still response-eligible
6. apply accepted/declined/changes_requested
7. consume token
8. write external access event
9. write business audit if appropriate
10. commit

Concurrent duplicate responses:
exactly one response wins.
Replay must not produce conflicting acceptance/decline state.

Synchronization transaction:

1. lock subscription
2. lock accepted quote/version
3. verify exact accepted response
4. inspect finance activity
5. if amount changes and finance activity exists → typed conflict
6. update acceptedQuoteVersionId
7. update agreedPriceXaf only if allowed
8. do not modify lifecycle/service/variant/components/duration
9. audit
10. commit

==================================================
AUDIT
==================================================

Suggested events:

quote.created
quote.version_created
quote.version_issued
quote.link_issued
quote.link_revoked
quote.accepted
quote.declined
quote.changes_requested
quote.synchronized
quote.cancelled

Generic audit metadata may contain:

- quoteId
- quoteVersionId
- subscriptionId
- quoteNumber
- versionNumber
- amountXaf
- transition
- templateVersion
- tokenId

Do not put:

- bearer token
- customer email/phone/name
- arbitrary terms text
- external/private notes
  into generic audit metadata.

Public access attempts use external_access_events.

==================================================
ERROR TAXONOMY
==================================================

Create stable QUOTE\_\* errors aligned with project conventions.

At minimum cover:

QUOTE_NOT_FOUND
QUOTE_INVALID_INPUT
QUOTE_INVALID_STATE
QUOTE_VERSION_IMMUTABLE
QUOTE_NUMBER_CONFLICT
QUOTE_VERSION_CONFLICT
QUOTE_LINK_INVALID
QUOTE_LINK_EXPIRED
QUOTE_LINK_REVOKED
QUOTE_LINK_CONSUMED
QUOTE_RESPONSE_CONFLICT
QUOTE_SYNC_REQUIRES_ACCEPTANCE
QUOTE_SYNC_FINANCE_CONFLICT
QUOTE_ROUTE_UNEXPECTED_FAILURE

Do not expose raw DB/Puppeteer/storage errors.

==================================================
CLIENT
==================================================

After server tests are ready, add French UI integrated into the existing customer/subscription profile pattern.

Admin UI:

- Devis
- Nouveau devis
- Brouillon
- Émettre
- Créer une nouvelle version
- Générer / télécharger PDF
- Partager
- Révoquer le lien
- Synchroniser avec l'abonnement

Show:

- numéro
- version
- montant
- statut
- date d'émission
- validité
- response customer
- synchronization state

Public UI:

- K'FIT branding
- quote number/version
- service
- quoted total in FCFA
- validity date
- explicit terms
- PDF download
- Accepter
- Refuser
- Demander une modification

Clear confirmation before submitting irreversible response.

Responsive + keyboard accessible.

==================================================
TESTS
==================================================

Shared/unit/HTTP:

1. contract validation
2. XAF integer amounts
3. invalid states
4. issued version cannot edit
5. closed response vocabulary
6. client cannot submit customerId/number/status/acceptedAt
7. auth/admin/CSRF
8. public rate limit
9. safe error taxonomy
10. snapshot mapper deterministic
11. PDF print model contains snapshot values only
12. sync policy detects finance conflict

PostgreSQL integration:

1. draft creation derives customer/request/subscription
2. concurrent first issue yields exactly one unique DEV-YYYY-NNNN number
3. counter + issue rollback atomically on forced failure
4. issued version immutable
5. V2 keeps V1 untouched
6. old V1 PDF remains historical after catalogue/customer changes
7. secure token stores hash only
8. expired link rejected
9. revoked link rejected
10. response replay rejected/idempotent
11. concurrent accept vs decline allows one authoritative result
12. changes_requested allows later V2
13. acceptance does not change subscription
14. sync before finance activity updates allowed commercial fields/reference
15. sync with same amount and existing finance remains safe if linkage-only
16. differing amount + finance activity → typed conflict with zero subscription/finance mutation
17. synchronization never changes service/variant/components/duration/status
18. audit rollback preserves atomicity
19. generic audit contains no token/customer PII/terms
20. PDF document/version linkage remains immutable

Browser Gate 2:

- create draft
- edit draft
- issue V1
- download PDF
- issue share link
- public accept
- verify subscription unchanged before coach sync
- coach sync
- create second quote/version scenario with changes_requested
- verify V1 historical PDF unchanged
- expired/revoked/replayed token cases
- responsive/mobile/keyboard
- DBeaver inspect quotes, quote_versions, document linkage, tokens, external access events and audits

==================================================
EXECUTION RULES
==================================================

Follow:

shared contracts
→ schema/migration
→ repository
→ service
→ controller
→ routes
→ server tests
→ PostgreSQL integration
→ client API/UI
→ static review

Do not mark S6.2 Terminé.
Do not add S6.2 to changelog.md as validated.
Do not start S6.3.

At completion return:

1. existing foundation reused
2. schema changes
3. numbering design
4. quote lifecycle
5. snapshot fields
6. PDF/storage design
7. secure-link behavior
8. response behavior
9. synchronization rules
10. routes/contracts
11. tests + exact results
12. migration filename
13. files changed
14. limitations
15. exact Fred Gate 2 commands/checks

Stop after S6.2 handoff.

## S6.2 Gate 1 - approved 2026-10-22

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

## S6.2 closure - 2026-10-22

Status: **CLOSED / LOCALLY VALIDATED**.

Implementation:

- `9fe7e1b` - `feat(quotes): add versioned quotes and secure acceptance`.

Validation evidence:

- typecheck green;
- server 400/400;
- shared 51/51;
- PostgreSQL 428/428 including 34 S6.2 cases;
- production build, schema check and diff check green;
- real Chromium quote PDF determinism green;
- Reviewer: PASSED WITH NOTES;
- QA: PASSED WITH LIMITATIONS;
- Fred confirmed browser/mobile/keyboard, ClamAV/private-storage issuance and DBeaver acceptance green.

Known non-blocking gap:

- direct synchronization-versus-finance race has no dedicated automated regression; lock ordering was reviewed and no defect was confirmed.

S6.2 is Terminé. S6.3 is now the active planning slice; no S6.3 implementation before Gate 1.

## S6.3 Gate 1 - approved 2026-10-22

Goal: customer payment-proof upload and structured coach review, integrated with the authoritative S6.1 ledger without treating evidence as money.

### Reused foundation

- payment_proofs
- documents / document_versions
- secure_access_tokens / external_access_events
- S6.1 payment_events / payment_allocations
- private storage + MIME/signature/SHA-256 + ClamAV hard-commit flow
- typed domain errors, transaction-scoped audit and Service → Controller → Route

### Locked evidence rules

1. V1 has no customer account, so upload is via secure temporary public token scoped to one subscription/proof-upload action.
2. Payment-proof files remain private/admin-only. No public proof delivery link.
3. Upload creates payment evidence only and never creates authoritative money.
4. Customer provides:
   - file;
   - claimedAmountXaf;
   - claimedPaymentMethod;
   - claimedOccurredAt/payment date.
     These are untrusted claims.
5. Optional claimedExternalReference may be accepted as evidence but is not globally unique by assumption.
6. payment methods remain the S6.1 closed vocabulary:
   - cash
   - bank_transfer
   - mobile_money
7. status vocabulary remains:
   - pending_review
   - confirmed
   - partially_confirmed
   - correction_requested
   - rejected
   - duplicate
   - superseded

### Coach review

- confirmed: coach confirms the full authoritative payment facts and amount.
- partially_confirmed: coach confirms a positive amount lower than the claimed amount.
- correction_requested: no payment; optional customer-facing message may explain what to resubmit.
- rejected: no payment.
- duplicate: no payment.
- superseded: historical proof replaced by a later proof; history preserved.

### Authoritative payment integration

For confirmed / partially_confirmed:

- lock proof;
- lock subscription / eligible finance obligations using S6.1 ordering;
- recompute outstanding balance;
- validate reviewed amount/method/date;
- create authoritative payment_event;
- create FIFO payment_allocations;
- link payment_proof.payment_event_id;
- mark proof reviewed;
- write transaction-scoped audit;
- commit atomically.

The original evidence does not become the payment event. The review command produces the payment event.

### Concurrency invariants

- two concurrent review confirmations of one proof create exactly one payment event;
- proof confirmation racing a manual S6.1 payment must serialize against the true outstanding amount;
- overpayment from review is rejected atomically;
- duplicate/replayed review cannot create duplicate allocations.

### Proof replacement

- correction request issues/permits a fresh upload path;
- replacement creates a new payment_proofs row;
- new row supersedes old proof by supersedesProofId;
- old proof and old document remain immutable;
- no in-place replacement of evidence.

### Schema hardening proposed

- payment_proofs.document_id -> documents.id FK if missing;
- payment_proofs.supersedes_proof_id self-FK RESTRICT if missing;
- payment_proofs.payment_event_id nullable FK -> payment_events.id;
- claimed_amount_xaf;
- claimed_payment_method;
- claimed_occurred_at;
- optional claimed_external_reference;
- confirmed_amount_xaf;
- confirmed_payment_method;
- confirmed_occurred_at;
- optional customer_message;
- status and amount consistency constraints/indexes where practical.

Exact minimal migration should be chosen after current-row inspection. No destructive changes.

### API proposal

Admin:

- GET /admin/subscriptions/:subscriptionId/payment-proofs
- GET /admin/payment-proofs/:proofId
- GET /admin/payment-proofs/:proofId/document
- POST /admin/subscriptions/:subscriptionId/payment-proof-links
- POST /admin/payment-proof-links/:tokenId/revoke
- POST /admin/payment-proofs/:proofId/confirm
- POST /admin/payment-proofs/:proofId/partially-confirm
- POST /admin/payment-proofs/:proofId/request-correction
- POST /admin/payment-proofs/:proofId/reject
- POST /admin/payment-proofs/:proofId/mark-duplicate

Public:

- GET /public/payment-proofs/:token
- POST /public/payment-proofs/:token/upload

No generic status PATCH.

### Audit privacy

Safe metadata only:

- proofId
- subscriptionId
- documentId / documentVersionId
- paymentEventId
- amountXaf
- paymentMethod
- structural transition
- tokenId if needed

Do not place in generic audit:

- raw bearer
- customer PII
- claimedExternalReference
- reviewNote
- customerMessage
- uploaded document content

### Validation target

Must cover:

- clean upload;
- infected/malformed file rejection;
- token expiry/revocation/replay;
- pending evidence creates no payment;
- full confirmation creates exactly one payment + allocations;
- partial confirmation creates exact reviewed amount;
- overpayment review rejects atomically;
- concurrent double-review creates one payment;
- manual payment vs proof confirmation cannot over-allocate;
- correction request -> replacement lineage;
- rejection/duplicate create no payment;
- exact proof -> payment event linkage;
- later payment correction preserves original proof evidence;
- subscription lifecycle unchanged;
- audit privacy;
- private storage SHA/DBeaver evidence.

### Out of scope

- receipts/S6.4;
- OCR or automatic proof interpretation;
- automatic financial confirmation;
- bank/mobile-money provider APIs;
- refunds;
- customer accounts;
- SMS/email/WhatsApp sending engine;
- AI review;
- finance analytics.

Fred approved the complete plan above. S6.3 implementation is authorized on main, server-first. S6.4 remains closed until local validation.

## S6.3 - Fred-approved detailed implementation request

Implement K'FIT Sprint 6 slice S6.3 only.

Branch: main
Workflow state: APPROVED_FOR_IMPLEMENTATION

Before coding inspect:

- TASKS.md
- exploration-cache/tasks/sprint-6.md
- exploration-cache/project/database-schema.md
- exploration-cache/project/relational-contract.md
- exploration-cache/project/state-machines.md
- exploration-cache/project/decisions.md
- exploration-cache/technical/gotchas.md
- packages/server/src/db/schema/finance.ts
- packages/server/src/db/schema/documents.ts
- current S6.1 finance module
- current S6.2 quotes/secure-token implementation
- current private file / ClamAV / hard-commit implementation

Do NOT implement S6.4, receipts, refunds, OCR, bank/mobile-money APIs, AI proof review, customer accounts, notifications or Sprint 7 work.

==================================================
GOAL
==================================================

Implement secure customer payment-proof submission and structured coach review while preserving the core rule:

PAYMENT PROOF IS EVIDENCE ONLY.

A submitted proof is never authoritative money by itself.

Only a coach review command may create an authoritative S6.1 payment event.

==================================================
LOCKED BUSINESS RULES
==================================================

1. Secure customer upload

V1 has no customer account.

Coach issues a temporary secure upload link for a specific subscription.

Reuse secure_access_tokens.

Suggested scope:

resourceType = subscription
action = payment_proof_upload

Requirements:

- random bearer
- bearer stored hash-only
- expiry
- revocation
- rate limiting
- external access audit
- no bearer in logs/audit metadata
- exact subscription scope

Public token metadata exposes only safe information required to submit the proof.

2. Customer submission

Customer submits:

- proof file
- claimedAmountXaf
- claimedPaymentMethod
- claimedOccurredAt
- optional claimedExternalReference

These are UNTRUSTED CLAIMS.

Allowed payment methods remain:

cash
bank_transfer
mobile_money

Customer claims must never directly create:

- payment_events
- payment_allocations
- finance status
- subscription lifecycle transitions

3. Private file handling

Reuse the existing validated file pipeline:

upload
→ size check
→ MIME/signature validation
→ ClamAV
→ SHA-256
→ opaque private storage key
→ hard commit

Accepted proof formats should follow existing safe document/image support unless current product rules require a smaller set:

- PDF
- JPEG
- PNG
- WebP

Proof files remain private/admin-only.

Do NOT issue public download links for payment proofs.

Suggested document ownership:

ownerType = payment_proof
ownerId = paymentProofId

documentType = payment_proof

If the current document-type contract needs extension, do it explicitly and update shared/server tests.

4. Proof creation

Successful upload creates:

payment_proof
status = pending_review

and its private document.

It does NOT create money.

Server derives:

- customerId from subscription
- subscriptionId from token scope
- submittedVia = public_link or equivalent closed vocabulary
- submittedAt
- document linkage

5. Review statuses

Use the existing closed vocabulary:

pending_review
confirmed
partially_confirmed
correction_requested
rejected
duplicate
superseded

No generic PATCH status route.

Every state transition must be a named command.

6. Full confirmation

Coach explicitly reviews authoritative payment facts.

For confirmed:

- confirmedAmountXaf must be positive
- normally equals the accepted full claim
- confirmedPaymentMethod required
- confirmedOccurredAt required
- optional authoritative external reference may be provided if product contract supports it

The review command must create the S6.1 authoritative payment event and FIFO allocations atomically.

Do NOT duplicate S6.1 allocation logic in the proof module.

Reuse/extract an internal S6.1 payment command/service path so manual payment and proof-confirmed payment share the same authoritative rules.

7. Partial confirmation

For partially_confirmed:

0 < confirmedAmountXaf < claimedAmountXaf

The confirmed amount becomes the authoritative payment amount.

The remaining claimed amount creates no money.

Do not invent a residual credit or pending balance tied to the proof.

8. Negative review outcomes

For:

correction_requested
rejected
duplicate

NO payment_event is created.

NO payment_allocation is created.

NO finance balance changes.

NO subscription lifecycle changes.

9. Explicit proof → payment linkage

Add:

payment_proofs.payment_event_id

nullable FK → payment_events.id

For confirmed/partially_confirmed:
payment_event_id must reference the exact authoritative payment created by review.

For pending/correction/rejected/duplicate:
payment_event_id must remain null.

Do not infer linkage later from amount/date.

10. Correction workflow

correction_requested keeps the original proof immutable.

Replacement proof:

- is a NEW payment_proofs row
- stores supersedesProofId = previous proof id
- stores its own new private document
- does not overwrite old evidence

When the replacement becomes the active proof, old evidence may be marked superseded according to explicit transition rules.

Do not mutate/remove old file history.

11. Duplicate handling

Use SHA-256 as evidence.

At minimum:

- identical file inside the same correction/replacement lineage should be guarded against accidental resubmission
- coach may explicitly mark a proof duplicate

Do NOT assume globally identical SHA means globally duplicate payment.

A duplicate status never creates money.

12. External references

claimedExternalReference is evidence only.

Do not add an unsafe global unique constraint for bank/mobile-money references.

Normalize safely when supplied.

Never write raw external references into generic audit metadata.

13. Notes

Keep private coach review notes separate from customer-facing messages.

Suggested:

reviewNote

- private admin note

customerMessage

- optional message visible to customer when correction is requested

Do NOT expose reviewNote publicly.

Do NOT put reviewNote/customerMessage into generic audit metadata.

==================================================
SCHEMA HARDENING
==================================================

Inspect current rows before migration.

Likely minimal additive changes to payment_proofs:

- document_id proper FK -> documents.id if missing
- supersedes_proof_id self-FK RESTRICT if missing
- payment_event_id nullable FK -> payment_events.id

Claim fields:

- claimed_amount_xaf integer
- claimed_payment_method text
- claimed_occurred_at timestamptz
- claimed_external_reference text nullable

Confirmed fields:

- confirmed_amount_xaf integer nullable
- confirmed_payment_method text nullable
- confirmed_occurred_at timestamptz nullable

Review communication:

- customer_message text nullable

Optional additional structural fields only if clearly needed:

- active replacement / lineage helpers
- explicit upload token linkage

Use CHECK constraints where safe:

- claimed amount > 0
- confirmed amount > 0 when set
- currency remains XAF by S6.1 rules

Do not create destructive migrations.

Before migration:

- inspect existing payment_proofs
- verify no conflicting rows
- document backfill requirement
- generate migration only after inspection

==================================================
PUBLIC API
==================================================

Admin:

GET
/admin/subscriptions/:subscriptionId/payment-proofs

GET
/admin/payment-proofs/:proofId

GET
/admin/payment-proofs/:proofId/document

POST
/admin/subscriptions/:subscriptionId/payment-proof-links

POST
/admin/payment-proof-links/:tokenId/revoke

POST
/admin/payment-proofs/:proofId/confirm

POST
/admin/payment-proofs/:proofId/partially-confirm

POST
/admin/payment-proofs/:proofId/request-correction

POST
/admin/payment-proofs/:proofId/reject

POST
/admin/payment-proofs/:proofId/mark-duplicate

Public:

GET
/public/payment-proofs/:token

POST
/public/payment-proofs/:token/upload

Use named commands.
No generic review/status PATCH.

==================================================
PUBLIC UPLOAD CONTRACT
==================================================

The upload endpoint must carry:

- file bytes
- claimedAmountXaf
- claimedPaymentMethod
- claimedOccurredAt
- optional claimedExternalReference

Use the existing upload convention if practical:
headers/query/multipart depending on current file infrastructure.

Do not weaken signature validation just for convenience.

Unknown fields must be rejected according to existing shared-contract conventions.

==================================================
REVIEW INPUT OWNERSHIP
==================================================

Coach confirmation may provide authoritative:

confirmedAmountXaf
confirmedPaymentMethod
confirmedOccurredAt
optional externalReference
optional reviewNote

Coach must NOT provide:

- paymentEventId
- allocation rows
- paid balance
- outstanding balance
- customerId
- subscriptionId
- currency
- confirmedAt
- confirmedByUserId
- finance status

All those remain server-owned.

==================================================
AUTHORITATIVE CONFIRMATION TRANSACTION
==================================================

This is the most important S6.3 path.

Transaction:

1. lock payment proof
2. assert current status = pending_review
3. load/lock subscription
4. verify proof belongs to subscription/customer
5. validate reviewed facts
6. invoke/reuse S6.1 authoritative payment machinery
7. lock eligible payment plan/installments in the same deterministic order as S6.1
8. recompute outstanding amount inside transaction
9. reject overpayment if confirmed amount > remaining
10. create payment_event
11. create FIFO payment_allocations
12. link payment_proof.payment_event_id
13. set proof status confirmed or partially_confirmed
14. set reviewedAt/reviewedByUserId
15. persist review note outside generic audit metadata
16. write transaction-scoped audit
17. commit

Payment + allocations + proof review + audit must commit together.

If any part fails:

- no payment event
- no allocation
- proof remains reviewable
- no partial finance state

==================================================
CONCURRENCY
==================================================

Add dedicated PostgreSQL coverage.

A. Double review:

Two concurrent confirm commands for same proof.

Expected:

- exactly one creates the payment
- second returns stable invalid-state/conflict result
- one payment_event only
- one allocation set only

B. Proof confirmation vs manual S6.1 payment:

Example:
remaining balance = 20,000

proof confirmation amount = 20,000
manual payment amount = 20,000
concurrent execution

Expected:

- only one financial command may consume the remaining obligation
- the other sees true recomputed balance and fails safely
- total applied amount never exceeds 20,000

Use the SAME finance lock ordering as S6.1.

This concurrency test is mandatory.

==================================================
CORRECTION REQUEST
==================================================

Named command:

request-correction

Requirements:

- only from pending_review
- no payment event
- status -> correction_requested
- customerMessage optional
- private reviewNote optional
- audited structurally

Replacement upload flow:

- issue fresh secure upload token tied to correction lineage
- public upload creates NEW proof
- new.supersedesProofId = old.id
- original proof remains immutable
- replacement starts pending_review

If transition to superseded is used:

- perform it explicitly
- preserve original correction_requested evidence in audit/history
- do not erase review timestamps/message

==================================================
REJECT / DUPLICATE
==================================================

Reject:

- pending_review -> rejected
- no payment
- reason in private reviewNote if needed
- no arbitrary reason in generic audit

Duplicate:

- pending_review -> duplicate
- no payment
- may reference duplicate-of proof if schema needs explicit linkage, but do not add it unless clearly useful
- preserve document

==================================================
SECURE TOKEN BEHAVIOR
==================================================

Upload token:

- one exact subscription/lineage
- expiry
- revocation
- max use preferably 1 successful upload
- metadata read does not consume token
- failed validation/malware does not incorrectly consume successful-use budget
- successful proof creation consumes token
- replay cannot create another proof

external_access_events:

- successful metadata access
- failed/expired/revoked attempts
- upload success/failure

No customer PII/raw bearer in generic audit.

==================================================
AUDIT
==================================================

Suggested business events:

payment_proof.link_issued
payment_proof.link_revoked
payment_proof.submitted
payment_proof.confirmed
payment_proof.partially_confirmed
payment_proof.correction_requested
payment_proof.rejected
payment_proof.duplicate
payment_proof.superseded

Safe metadata:

- proofId
- subscriptionId
- documentId
- documentVersionId
- paymentEventId
- amountXaf
- paymentMethod
- fromStatus
- toStatus
- tokenId if useful

Do NOT include:

- customer identity
- raw bearer
- external reference
- reviewNote
- customerMessage
- original filename if it can expose PII
- uploaded content

==================================================
ERROR TAXONOMY
==================================================

Use stable PAYMENT*PROOF*\* errors.

At minimum:

PAYMENT_PROOF_NOT_FOUND
PAYMENT_PROOF_INVALID_INPUT
PAYMENT_PROOF_INVALID_STATE
PAYMENT_PROOF_LINK_INVALID
PAYMENT_PROOF_LINK_EXPIRED
PAYMENT_PROOF_LINK_REVOKED
PAYMENT_PROOF_LINK_CONSUMED
PAYMENT_PROOF_UPLOAD_INVALID
PAYMENT_PROOF_DUPLICATE_UPLOAD
PAYMENT_PROOF_MALWARE_DETECTED
PAYMENT_PROOF_REVIEW_CONFLICT
PAYMENT_PROOF_AMOUNT_INVALID
PAYMENT_PROOF_FINANCE_CONFLICT
PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE

Reuse lower-level document/file errors internally but return stable payment-proof domain errors at the route boundary.

==================================================
CLIENT
==================================================

Admin:

Integrate into existing customer/subscription Finance area.

Add section:

Justificatifs de paiement

Show:

- date de dépôt
- montant déclaré
- moyen déclaré
- date de paiement déclarée
- statut
- document
- replacement lineage if applicable
- resulting payment reference/event when confirmed

Actions depending on state:

- Confirmer
- Confirmer partiellement
- Demander une correction
- Rejeter
- Marquer comme doublon
- Télécharger/voir le justificatif

Clear confirmation before creating authoritative money.

Customer public page:

Justificatif de paiement

Show only:

- safe subscription reference
- safe remaining amount/context if approved by current read model
- accepted formats
- montant déclaré
- moyen de paiement
- date du paiement
- optional reference
- file selector
- submit

After success:
"Justificatif envoyé. Il sera vérifié par votre coach."

Do not imply payment is confirmed.

French UI.
Responsive.
Keyboard accessible.

==================================================
TESTS
==================================================

Shared/unit/HTTP:

1. claimed amount integer XAF
2. closed payment method vocabulary
3. strict claimed date
4. unknown field rejection
5. public token scope/expiry/revocation
6. admin auth/CSRF
7. review state transitions
8. full vs partial amount rules
9. customer claims never become authoritative automatically
10. audit metadata privacy
11. customerMessage vs reviewNote separation
12. file validation/malware error mapping

PostgreSQL integration:

1. secure link stored hash-only
2. metadata read non-consuming
3. clean upload creates one pending proof + private document
4. successful upload consumes token
5. replay creates no duplicate proof
6. expired token rejects
7. revoked token rejects
8. infected file creates no proof/document
9. MIME/signature mismatch creates no proof
10. pending proof creates zero payment events
11. full confirmation creates exactly one payment event
12. full confirmation writes FIFO allocations
13. partial confirmation creates exact reviewed amount only
14. overpayment from review rolls back proof/finance mutation
15. rejection creates no payment
16. duplicate creates no payment
17. correction request creates no payment
18. replacement proof links supersedesProofId
19. old document remains intact
20. confirmed proof links exact paymentEventId
21. later payment correction preserves proof evidence
22. double concurrent review creates one payment
23. manual payment vs proof confirmation cannot over-allocate
24. audit failure rolls back payment + allocations + proof review
25. subscription.status unchanged
26. generic audit excludes externalReference/reviewNote/customerMessage/customer PII
27. storage SHA/size metadata matches physical file
28. duplicate SHA inside same lineage handled safely

Do not weaken existing S6.1/S6.2 tests.

==================================================
VALIDATION
==================================================

Agent may run permitted local checks.

Expected final automated suite should include:

npm run typecheck
npm test
npm run build
npm run db:check
npm run test:integration
npm run preflight:files

If a new focused proof preflight is useful, add one only if it validates behavior not already covered by integration tests.

Do not claim Fred validation.

==================================================
EXECUTION ORDER
==================================================

Follow strictly:

1. inspect existing rows/schema
2. reusable pattern adaptation
3. shared contracts
4. schema/migration
5. repository
6. service
7. controller
8. routes
9. unit/HTTP tests
10. PostgreSQL integration tests
11. client API
12. admin UI
13. public UI
14. static review
15. QA handoff

Do not start S6.4.

Do not mark S6.3 Terminé.
Do not write validated changelog entry until Fred passes Gate 2.

==================================================
EXPECTED REPORT
==================================================

Return:

1. existing foundation reused
2. schema changes
3. proof/file ownership design
4. secure upload-link design
5. claimed-vs-authoritative data handling
6. review lifecycle
7. S6.1 payment integration
8. concurrency behavior
9. correction/replacement lineage
10. routes/contracts
11. audit/privacy controls
12. client UI
13. tests added
14. exact test results
15. migration filename
16. files changed
17. limitations/open notes
18. exact Fred Gate 2 commands and browser/DBeaver checks

Stop after S6.3 implementation and handoff.

### Fred clarification - 2026-10-22

Full confirmation requires confirmedAmountXaf = claimedAmountXaf exactly. Partial confirmation requires 0 < confirmedAmountXaf < claimedAmountXaf.

## S6.3 implementation checkpoint - 2026-10-22

Status: **IMPLEMENTED / AWAITING_HUMAN_VALIDATION**.

Implementation commit:

- `8edebc7` - `feat(payment-proofs): add secure upload and coach review`.

Implemented:

- shared payment-proof contracts and closed review states;
- additive migration `0011_motionless_molly_hayes.sql`;
- secure hash-only proof-upload links;
- private scanned payment-proof documents with SHA-256 metadata;
- untrusted customer claims separated from authoritative coach-confirmed facts;
- named review commands for confirmed, partially_confirmed, correction_requested, rejected and duplicate;
- explicit proof -> payment_event linkage;
- S6.1 authoritative payment/FIFO reuse inside the proof-review transaction;
- immutable correction/replacement lineage;
- French admin Finance proof panel and public `/justificatif/:token` page.

Agent/reviewer/QA evidence reported:

- typecheck green;
- server 437/437;
- shared 53/53;
- PostgreSQL 467/467, including 39 S6.3 cases;
- production build and db:check green;
- real files/ClamAV preflight green;
- dedicated double-review concurrency coverage;
- dedicated manual-payment-vs-proof-confirmation race coverage;
- Reviewer PASSED WITH NOTES;
- QA PASSED WITH LIMITATIONS.

Known non-blocking coverage note:

- no dedicated proof expiry-during-lock-wait runtime regression; expiry is rechecked after locks.

Important validation boundary:

- Fred has not yet confirmed S6.3 Gate 2 in this chat.
- Browser/mobile/keyboard, end-to-end proof upload/review flow and DBeaver/private-storage acceptance remain human validation gates.
- No validated S6.3 changelog entry is allowed before Fred confirms those checks.
- S6.4 remains closed.

## S6.3 closure - 2026-10-22

Status: **CLOSED / LOCALLY VALIDATED**.

Implementation:

- `8edebc7` - `feat(payment-proofs): add secure upload and coach review`.

Validation evidence:

- typecheck green;
- server 437/437;
- shared 53/53;
- PostgreSQL 467/467 including 39 S6.3 cases;
- production build and db:check green;
- real files/ClamAV preflight green;
- Reviewer PASSED WITH NOTES;
- QA PASSED WITH LIMITATIONS;
- Fred explicitly confirmed browser/mobile/keyboard, end-to-end proof upload/review, private storage and DBeaver acceptance green.

Key validated invariants:

- proof evidence never creates money on upload;
- full/partial coach review creates the authoritative S6.1 payment and FIFO allocations atomically;
- negative outcomes create no money;
- proof -> payment_event linkage is exact;
- correction creates immutable replacement lineage;
- concurrent double-review creates one payment;
- manual payment vs proof confirmation cannot over-allocate;
- subscription lifecycle remains unchanged;
- generic audit excludes external reference, private review note, customer message and customer PII.

Known non-blocking coverage note:

- no dedicated expiry-during-lock-wait regression; expiry is rechecked after locks.

S6.3 is Terminé. S6.4 is now the active planning slice; no S6.4 implementation before Gate 1.

## S6.4 Gate 1 - approved 2026-10-22

Goal: issue one immutable, sequential receipt for one authoritative confirmed payment event, with deterministic PDF generation and secure temporary customer sharing.

### Reused foundation

- receipts
- payment_events / payment_allocations
- business_document_counters from S6.2
- documents / document_versions
- secure_access_tokens / external_access_events
- S6.2 deterministic PDF/private storage hard-commit pattern
- transaction-scoped audit
- Concurrent Sequential Numbering
- Historical Business Snapshot
- Business Document PDF Generation
- Secure External Document Sharing
- Hard Commit Point
- Atomic Business Operation

### Locked business rules

1. Receipt source:
   - only `payment_received`;
   - payment must be confirmed;
   - no receipt for payment proof itself;
   - no receipt for `payment_correction`.

2. Cardinality:
   - exactly one receipt per source payment event;
   - add/enforce DB uniqueness on `receipts.payment_event_id`;
   - repeated issuance may return existing receipt or stable conflict/idempotent result but never allocate a second number.

3. Number:
   - `REC-YYYY-NNNN`;
   - annual `business_document_counters` partition using documentType `receipt`;
   - counter row locked and incremented in same issuance hard commit;
   - DB uniqueness on receipt number;
   - never MAX()+1;
   - number never accepted from client.

4. Historical snapshot:
   Freeze all facts required to reconstruct the issued receipt:
   - receipt number;
   - minimal customer display identity;
   - subscription reference;
   - payment event ID;
   - payment amount XAF;
   - payment method;
   - payment occurredAt;
   - issuedAt;
   - allocation breakdown by installment/plan reference and amount;
   - subscription agreed amount;
   - paid/balance-after-this-payment as of issuance;
   - template version.
     Customer-facing display may use FCFA while persistence/API remain XAF.

5. PDF:
   - render only from the frozen snapshot;
   - deterministic French PDF;
   - scan/store privately with SHA-256, opaque name and immutable document version;
   - `receipts.pdf_document_id` becomes a proper FK to documents if missing;
   - receipt-owned PDF cannot be changed through generic personalized-document routes.

6. Sharing:
   - secure token bound to exact receipt/PDF action;
   - random bearer, hash-only DB;
   - expiry, revocation, usage limit, rate limit;
   - successful/failed access in external_access_events;
   - raw bearer never logged/audited.

7. Corrections:
   - later payment corrections never mutate receipt number/snapshot/PDF;
   - receipt read model derives current source-payment correction state separately from historical receipt snapshot.

8. Void:
   - explicit named command only;
   - allow only when source payment is fully corrected (correctable amount = 0 / full compensation according to S6.1 authoritative history);
   - partial correction does not allow void;
   - void records voidedAt and private voidReason;
   - original PDF remains preserved.

9. Preservation:
   - voided receipts never deleted;
   - receipt number never reused;
   - no re-issuance under another number for the same payment.

10. Public void behavior:

- historical public page/PDF access remains possible while token is otherwise valid;
- page clearly marks `Annulé` and current source-payment correction state;
- do not rewrite original PDF unless a separate future legal requirement explicitly demands a void-stamped derivative; not S6.4.

11. Explicit issuance:

- coach clicks `Émettre le reçu`;
- S6.1 manual payment and S6.3 proof-confirmation transactions remain independent of Chromium/ClamAV receipt work.

12. Out of scope:

- invoices;
- refunds/reimbursements;
- credit notes/avoirs;
- VAT/tax/fiscal engine;
- provider APIs;
- automatic email/WhatsApp delivery;
- accounting export;
- automatic bulk receipt generation.

### Suggested schema hardening

- `receipts.payment_event_id` unique;
- `receipts.pdf_document_id` FK -> documents.id;
- add immutable snapshot JSON or explicit snapshot columns sufficient for historical PDF/read reconstruction;
- add templateVersion if snapshot JSON does not contain it;
- keep voidReason private;
- receipt state derived from `voidedAt` unless a status column is proven necessary.

Inspect existing receipt rows before migration. No destructive migration.

### API proposal

Admin:

- GET /admin/subscriptions/:subscriptionId/receipts
- GET /admin/receipts/:receiptId
- POST /admin/payment-events/:paymentEventId/receipt
- GET /admin/receipts/:receiptId/pdf
- POST /admin/receipts/:receiptId/share
- POST /admin/receipt-links/:tokenId/revoke
- POST /admin/receipts/:receiptId/void

Public:

- GET /public/receipts/:token
- GET /public/receipts/:token/pdf

No generic receipt-status PATCH.

### Issuance hard commit

1. resolve/lock payment event and its subscription/customer scope;
2. require confirmed `payment_received`;
3. lock/check existing receipt for payment event;
4. reconstruct authoritative payment/allocation state at issuance;
5. build immutable receipt snapshot;
6. lock/increment annual receipt counter;
7. render deterministic PDF to temporary/private staging;
8. scan/store artifact;
9. insert receipt + document linkage + snapshot;
10. write audit;
11. commit;
12. compensate temporary/finalized file on rollback according to existing hard-commit pattern.

A receipt must never exist as a usable issued record without its required PDF.

### Concurrency

Mandatory integration cases:

- concurrent duplicate issue -> exactly one receipt/number/PDF;
- receipt issue vs source payment correction -> deterministic lock ordering and no inconsistent snapshot;
- counter rollback/failure -> no duplicate number or orphan receipt;
- concurrent void commands -> one void transition;
- partial-correction vs void race -> void cannot win unless payment is fully corrected.

### Audit

Suggested events:

- receipt.issued
- receipt.link_issued
- receipt.link_revoked
- receipt.voided

Safe metadata:

- receiptId
- receiptNumber
- paymentEventId
- subscriptionId
- documentId/versionId
- amountXaf
- paymentMethod
- allocationCount
- structural state

Exclude:

- raw token
- customer PII
- external payment reference
- voidReason
- free text
- PDF content

### Validation target

- only confirmed payment_received is issuable;
- correction events rejected;
- one receipt per payment;
- annual sequence concurrent safety;
- snapshot uses authoritative allocation/payment state;
- historical PDF unchanged after later customer/subscription/payment changes;
- deterministic PDF hashes for identical snapshot;
- private storage/scan/SHA linkage;
- token hash-only/expiry/revoke/use-limit;
- metadata/PDF access semantics;
- payment correction never rewrites receipt;
- partial correction keeps issued/non-voidable;
- full correction permits explicit void;
- void preserves number/PDF/history;
- public page shows Annulé for voided receipt;
- audit privacy;
- subscription lifecycle untouched.

Fred approved the complete S6.4 plan above. Implementation is authorized on main, server-first. Sprint 6 is not closed until Fred locally validates S6.4.

## S6.4 detailed approved implementation request - 2026-10-22

Implement K'FIT Sprint 6 slice S6.4 only.

Branch: main
Workflow state: APPROVED_FOR_IMPLEMENTATION

Do not implement Sprint 7 or unrelated finance features.

Before coding inspect:

- TASKS.md
- exploration-cache/tasks/sprint-6.md
- exploration-cache/project/database-schema.md
- exploration-cache/project/relational-contract.md
- exploration-cache/project/state-machines.md
- exploration-cache/project/decisions.md
- exploration-cache/technical/gotchas.md
- packages/server/src/db/schema/finance.ts
- packages/server/src/db/schema/documents.ts
- current S6.1 finance implementation
- current S6.2 quote numbering/PDF/share implementation
- current S6.3 payment-proof integration
- existing document/PDF/private-storage/secure-token infrastructure

==================================================
GOAL
==================================================

Implement sequential payment receipts with:

- exactly one receipt per authoritative confirmed payment_received event;
- concurrency-safe REC-YYYY-NNNN numbering;
- immutable historical receipt snapshots;
- deterministic private PDF generation;
- secure temporary customer sharing;
- explicit void semantics after full payment correction.

==================================================
LOCKED BUSINESS RULES
==================================================

1. Receipt source

Receipt may be issued only for:

payment_event.eventType = payment_received

and:

- confirmedAt != null
- authoritative allocations exist
- event belongs to exactly one subscription scope
- customer matches subscription

Never issue receipt for:

- payment proof itself
- payment_correction
- unconfirmed event
- arbitrary balance
- installment alone

2. One receipt per payment

Exactly one official receipt per payment_event.

Enforce DB uniqueness:
receipts.payment_event_id UNIQUE

Concurrent/repeated issue attempts:

- one receipt only
- one number only
- one PDF only
- subsequent identical request returns existing receipt or stable typed conflict/idempotent result

Never allocate another receipt number for the same payment.

3. Sequential numbering

Format:

REC-YYYY-NNNN

Example:
REC-2026-0001

Reuse:
business_document_counters

Partition:
documentType = receipt
year = business/local issue year

Rules:

- lock counter row
- increment inside issue transaction/hard commit
- DB uniqueness on receiptNumber
- never MAX()+1
- never accept receiptNumber from client
- no number for drafts; receipt is issued at creation

Counter and receipt issuance must commit consistently.

4. Historical snapshot

Freeze all facts required to reconstruct the receipt at issuance.

At minimum:

receiptNumber
customer display identity required for receipt
subscriptionId/reference
paymentEventId
payment amount XAF
payment method
payment occurredAt
payment confirmedAt
issuedAt
allocation breakdown:
installmentId
paymentPlanId
amountXaf
installment sequence/due reference if displayed
subscription agreed amount at issuance
confirmed paid total after this payment
remaining balance after this payment
currency = XAF
templateVersion

Customer PDF displays FCFA.

Do not depend on mutable current customer/catalogue/subscription facts when re-rendering/history reading.

Avoid unnecessary duplicated PII.

5. Immutable PDF

Receipt PDF:

- French
- deterministic
- generated from receipt snapshot only
- private
- scanned
- SHA-256 stored
- opaque storage filename
- immutable document version

Reuse S6.2 quote PDF hard-commit pattern.

receipt.pdf_document_id must reference documents.id.

Suggested ownership:
ownerType = receipt
ownerId = receipt.id
documentType = payment_receipt

Receipt-owned documents must not be mutable through generic personalized-document update/version routes.

6. Secure sharing

Reuse secure_access_tokens.

Suggested:
resourceType = receipt
resourceId = receipt.id
action = receipt_download

Requirements:

- random bearer
- hash-only storage
- exact resource/action scope
- expiry
- revocation
- use limit
- public rate limiting
- external_access_events
- raw bearer never persisted in audit metadata/logs

Metadata read should follow existing document/quote conventions regarding consumption.

PDF download consumes usage according to chosen existing convention.

7. Payment corrections

A later payment correction must never modify:

- receiptNumber
- historical snapshot
- original receipt PDF
- issuedAt

Receipt read model may derive current payment correction state separately from the immutable snapshot.

Expose:

- originalAmountXaf
- correctedAmountXaf / remaining effective payment amount
- correctionState:
  none
  partially_corrected
  fully_corrected

Do not alter historical receipt snapshot.

8. Void

Receipt lifecycle:

issued
→ voided

No delete.

Explicit admin command only.

Void is allowed only when the source payment has been fully corrected according to authoritative S6.1 payment history.

Partial correction:

- receipt remains issued
- void command rejected

Full correction:

- coach may void explicitly

Void stores:
voidedAt
voidReason

voidReason:

- private admin reason
- required
- must not enter generic audit metadata

9. Preservation

Voided receipt:

- remains stored
- keeps receipt number
- keeps original PDF
- remains linked to original payment
- cannot be reissued
- number never reused

No replacement receipt for the same payment.

10. Public void behavior

If a valid secure link accesses a voided receipt:

public page must clearly display:
ANNULÉ

Also show that the source payment was corrected/cancelled.

Original historical PDF stays available while token policy permits.

Do not regenerate or overwrite the historical PDF with a void watermark in S6.4.

A separate void certificate/derivative is out of scope.

11. Explicit issuance

Do NOT automatically issue receipt inside:

- S6.1 manual payment transaction
- S6.3 payment-proof confirmation transaction

Coach explicitly selects:

Émettre le reçu

Reason:
payment authority must not depend on Chromium/ClamAV/PDF infrastructure.

12. Out of scope

Do not implement:

- invoices
- invoice numbering
- refunds/reimbursements
- credit notes / avoirs
- VAT/tax/fiscal engine
- online payment-provider APIs
- automatic email
- WhatsApp delivery
- accounting exports
- bulk automatic receipt creation
- Sprint 7 work

==================================================
REUSABLE PATTERNS
==================================================

Apply:

- Concurrent Sequential Numbering
- Historical Business Snapshot
- Business Document PDF Generation
- Secure External Document Sharing
- Hard Commit Point
- Atomic Business Operation
- Audit Event System
- Shared API Contracts
- Domain Error Taxonomy

Reuse the existing S6.2 implementations where appropriate rather than creating a second numbering/PDF/token architecture.

==================================================
SCHEMA HARDENING
==================================================

Inspect existing rows before migration.

Expected minimal additive hardening:

receipts:

- UNIQUE(payment_event_id)
- pdf_document_id proper FK -> documents.id
- snapshot_json JSONB or equivalent immutable snapshot representation
- template_version if not embedded in snapshot

Keep:

- receipt_number
- customer_id
- payment_event_id
- issued_at
- voided_at
- void_reason

Recommended checks:

- voided_at null means issued
- if voided_at non-null, void_reason required/nonblank where DB-practical

Do not add a mutable generic status column unless truly necessary.

Use derived state:
voidedAt ? voided : issued

Do not destructively alter old receipt rows.

Run/prepare a read-only receipt preflight before migration:

- receipt count
- duplicate paymentEventIds
- invalid customer/payment relationships
- invalid pdfDocumentIds
- unexpected existing counters

If there are existing receipt rows that cannot safely satisfy new invariants, STOP and report before destructive action.

==================================================
ISSUANCE INPUT OWNERSHIP
==================================================

Client supplies only:
paymentEventId via route

Possibly:
nothing else

Server derives:

- customer
- subscription
- currency
- amount
- payment method
- occurrence date
- allocations
- balance
- receipt number
- issue date
- PDF snapshot
- document IDs
- template version

Never allow browser to submit:

- receiptNumber
- customerId
- amount
- balance
- allocation rows
- pdfDocumentId
- issuedAt
- correction state

==================================================
ADMIN API
==================================================

GET
/admin/subscriptions/:subscriptionId/receipts

GET
/admin/receipts/:receiptId

POST
/admin/payment-events/:paymentEventId/receipt

GET
/admin/receipts/:receiptId/pdf

POST
/admin/receipts/:receiptId/share

POST
/admin/receipt-links/:tokenId/revoke

POST
/admin/receipts/:receiptId/void

No generic PATCH status.

Admin mutations:

- authenticated admin
- CSRF/origin protections
- resource authorization

==================================================
PUBLIC API
==================================================

GET
/public/receipts/:token

GET
/public/receipts/:token/pdf

Public metadata:

- receipt number
- issue date
- safe customer display
- payment amount
- payment method
- payment date
- status issued/voided
- correction state
- FCFA display
- download availability

Do not expose:

- customer internal IDs unless needed
- payment external reference
- review notes
- internal audit data
- subscription health/coaching data

==================================================
ISSUANCE HARD COMMIT
==================================================

Preferred flow:

Prepare:

1. resolve payment event
2. resolve exact subscription scope through allocations
3. validate event = confirmed payment_received
4. lock source payment/subscription/payment-plan/allocation scope consistently
5. check receipt does not already exist
6. reconstruct authoritative finance state
7. freeze snapshot
8. prepare deterministic PDF bytes/temp file

Finalize transaction/hard commit: 9. lock annual receipt counter partition 10. allocate REC-YYYY-NNNN 11. finalize snapshot number/date if needed 12. render final deterministic PDF if number participates in render 13. scan 14. finalize private file 15. create documents/document_version 16. create receipt with snapshot + pdfDocumentId 17. audit receipt.issued 18. commit

Compensation:

- failed DB finalize removes any newly finalized file
- failed render/scan creates no receipt/counter-visible business artifact per existing numbering rollback semantics

Follow the already-proven S6.2 hard-commit strategy rather than inventing an unsafe order.

A successful receipt must never exist without its PDF.

==================================================
SNAPSHOT BALANCE SEMANTICS
==================================================

Important:

balanceAfterPayment must represent the authoritative balance after applying THIS payment at its issuance state.

Do not simply use today's mutable balance if later payment events already occurred.

Derive historical balance using authoritative ordered payment/correction history as of the source payment's confirmed position.

If the existing ledger cannot reconstruct this safely, define/document the exact deterministic rule during implementation and add regression tests.

Do not fabricate historical balance.

==================================================
CORRECTION STATE
==================================================

For source payment P:

correctableXaf already exists in S6.1 semantics.

Derived:

if correctableXaf == P.amountXaf:
none

if 0 < correctableXaf < P.amountXaf:
partially_corrected

if correctableXaf == 0:
fully_corrected

Use authoritative correction events.

Do not infer from receipt void state.

==================================================
VOID TRANSACTION
==================================================

1. lock receipt
2. lock source payment/subscription finance scope in deterministic order
3. compute current correction state
4. require fully_corrected
5. require receipt not already voided
6. require nonblank private voidReason
7. set voidedAt + voidReason
8. write structural audit
9. commit

Do not change:

- payment
- allocations
- subscription
- PDF
- receiptNumber

Concurrent void commands:
exactly one transition.

==================================================
CONCURRENCY TESTS - MANDATORY
==================================================

1. concurrent issue same payment

Two commands issue same payment simultaneously.

Expected:

- one receipt
- one receiptNumber
- one PDF/document
- counter increments once for the committed receipt
- second request resolves/rejects safely

2. concurrent issue different payments

Expected:
REC-YYYY-0001
REC-YYYY-0002
unique, no duplicate number

3. issue vs correction race

Receipt issuance racing a payment correction.

Expected deterministic locking.

Receipt must:

- either snapshot a state consistent before correction
- or reject/retry safely

Never produce snapshot contradicting committed payment history at its serialization point.

4. partial correction vs void

Void may not succeed while payment is only partially corrected.

5. full correction vs void concurrency

Once correction reaches fully corrected:
exactly one void transition.

6. PDF/storage/audit failure

No orphan usable receipt/document/number state.

==================================================
AUDIT
==================================================

Business events:

receipt.issued
receipt.link_issued
receipt.link_revoked
receipt.voided

Optional:
receipt.document_downloaded for authenticated admin if consistent with document policy.

Generic audit safe metadata:

- receiptId
- receiptNumber
- paymentEventId
- subscriptionId
- documentId
- documentVersionId
- amountXaf
- paymentMethod
- allocationCount
- fromState/toState
- tokenId

Never include:

- bearer
- customer name/email/phone
- payment externalReference
- voidReason
- free text
- PDF content

Public access goes to external_access_events.

==================================================
ERROR TAXONOMY
==================================================

Use stable RECEIPT\_\* errors.

At minimum:

RECEIPT_NOT_FOUND
RECEIPT_INVALID_INPUT
RECEIPT_INVALID_PAYMENT
RECEIPT_ALREADY_EXISTS
RECEIPT_NUMBER_CONFLICT
RECEIPT_ISSUE_CONFLICT
RECEIPT_PDF_FAILURE
RECEIPT_LINK_INVALID
RECEIPT_LINK_EXPIRED
RECEIPT_LINK_REVOKED
RECEIPT_LINK_CONSUMED
RECEIPT_VOID_NOT_ALLOWED
RECEIPT_ALREADY_VOIDED
RECEIPT_CONCURRENCY_CONFLICT
RECEIPT_ADMIN_FORBIDDEN
RECEIPT_RATE_LIMITED
RECEIPT_ROUTE_UNEXPECTED_FAILURE

Do not expose raw PostgreSQL/Puppeteer/storage/ClamAV errors.

==================================================
CLIENT
==================================================

Integrate into the subscription Finance area.

Admin section:
Reçus

Show:

- receipt number
- payment amount
- payment method
- payment date
- issue date
- state
- correction state

Actions:

- Émettre le reçu
- Télécharger
- Partager
- Révoquer le lien
- Annuler le reçu, only when eligible

Payment history rows without receipt:
show:
Émettre le reçu

Payment history with receipt:
show receipt number/action instead.

Void confirmation must clearly explain:

- receipt number is preserved
- PDF remains historical
- action does not refund/correct payment

Public page:

- K'FIT branding
- Reçu de paiement
- receipt number
- payment amount in FCFA
- payment method
- payment date
- issue date
- subscription reference
- status
- PDF download

If voided:
prominent "ANNULÉ"
and explanation that the associated payment was corrected.

Responsive and keyboard accessible.

==================================================
TESTS
==================================================

Shared/unit/HTTP:

1. contracts reject unknown server-owned fields
2. receipt states/types
3. admin auth/CSRF
4. only payment_received eligible
5. payment_correction rejected
6. confirmedAt required
7. one-receipt rule
8. number formatter
9. snapshot builder deterministic
10. correction-state derivation
11. void requires full correction
12. audit privacy
13. public safe metadata
14. token error mapping

PostgreSQL integration:

1. receipt preflight-safe baseline
2. valid issue creates one receipt/document
3. receipt links exact customer/payment
4. unique paymentEventId enforced
5. concurrent same-payment issue creates one receipt
6. concurrent different-payment issue yields unique sequential numbers
7. number/counter rollback on failure
8. PDF failure creates no receipt
9. scan failure creates no receipt
10. audit failure rolls back issuance
11. historical snapshot unchanged after customer/profile changes
12. historical snapshot unchanged after later payment
13. historical PDF unchanged after correction
14. historical balance-after-payment correct
15. payment_correction cannot receive receipt
16. token stored hash-only
17. metadata access semantics
18. PDF download use-count semantics
19. expired token rejected
20. revoked token rejected
21. exhausted token rejected
22. partial correction keeps receipt issued
23. partial correction blocks void
24. full correction permits void
25. void preserves receipt number/PDF
26. concurrent void creates one transition
27. issue-vs-correction race serializes safely
28. correction-vs-void race safe
29. public void page derives Annulé
30. generic audit excludes PII/externalReference/voidReason
31. subscription status unchanged

Do not weaken S6.1-S6.3 tests.

==================================================
VALIDATION
==================================================

Implementer/QA may run only commands allowed by the local agent configuration.

Expected checks:

npm run typecheck
npm test
npm run build
npm run db:check
npm run test:integration
npm run preflight:pdf
npm run preflight:files

A focused receipt preflight is acceptable if it adds meaningful coverage.

Do not claim Fred validation.

==================================================
EXECUTION ORDER
==================================================

1. inspect receipt rows / migration safety
2. shared contracts
3. schema/migration
4. repository
5. service
6. controller
7. route
8. PDF renderer/snapshot mapper
9. secure sharing
10. unit/HTTP tests
11. PostgreSQL integration tests
12. client API
13. admin UI
14. public UI
15. independent Reviewer
16. QA
17. handoff to Fred

Do not start Sprint 7.

Do not mark S6.4 Terminé.
Do not close Sprint 6.
Do not add validated S6.4 changelog entry until Fred confirms Gate 2.

==================================================
EXPECTED IMPLEMENTER REPORT
==================================================

Return:

1. foundation reused
2. schema/migration
3. one-receipt invariant
4. numbering implementation
5. snapshot semantics
6. PDF/storage hard commit
7. secure sharing
8. correction-state behavior
9. void behavior
10. concurrency strategy
11. routes/contracts
12. client integration
13. audit/privacy
14. tests added
15. exact test results
16. migration filename
17. files changed
18. limitations
19. exact Fred Gate 2 checklist

Stop after S6.4 implementation.

## Sprint 6 closure - 2026-10-23

Status: **CLOSED / LOCALLY VALIDATED**.

Acceptance summary:

- S6.1 authoritative ledger validated;
- S6.2 quotes/versioning/PDF/secure acceptance validated;
- S6.3 proof evidence/review/payment integration validated;
- S6.4 receipts/numbering/PDF/secure sharing/void validated.

S6.4 evidence:

- implementation `a38901a`;
- server 470/470;
- shared 55/55;
- PostgreSQL 507/507;
- PDF/files/ClamAV preflights green;
- browser/mobile/keyboard and DBeaver green by Fred.

Sprint 6 V1 Core objective is satisfied. No further Sprint 6 implementation is open.

Next dependency-ordered sprint:

- Sprint 7 - Dashboard, notifications, rétention, sauvegardes et durcissement.
- First slice: S7.1 - Core dashboard KPIs and operational alert workspaces.
- State: planning / Gate 1 pending.

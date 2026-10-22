# K'FIT — Sprint 6 execution spec

## Objective

Deliver the V1 Core finance workflow for subscription obligations, payments, quotes, payment proofs and receipts while keeping financial state independent from subscription lifecycle.

## Ordered tasks

1. S6.1 — Financial ledger: payment plans, installments, confirmed payment events and allocations — CLOSED / validated 2026-10-22.
2. S6.2 — Versioned quotes, secure customer acceptance and subscription synchronization — CLOSED / validated 2026-10-22.
3. S6.3 — Customer payment-proof upload and structured coach review workflow — PLANNING / Gate 1 pending.
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

Gate 2 completed:
- Fred confirmed DBeaver finance/audit inspection green on 2026-10-22.
- S6.1 is locally validated and closed.

Repository merge note:
- merge commit `ee793c2` accidentally persisted literal conflict markers in `TASKS.md` and this file;
- documentation state was repaired afterward without changing S6.1 business implementation.


## S6.2 — Fred-approved implementation request, 2026-10-22

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

Create stable QUOTE_* errors aligned with project conventions.

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


## S6.2 closure — 2026-10-22

Status: **CLOSED / LOCALLY VALIDATED**.

Implementation:
- `9fe7e1b` — `feat(quotes): add versioned quotes and secure acceptance`.

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

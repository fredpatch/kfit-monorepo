# Sprint 4 — Clients, conversion, onboarding, questionnaires et consentements

> Branch: `sprint-4`

## Objective

Build the M4 customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow.

## Execution order

1. [x] S4.1 — Client table + phone-based search/create-inline.
2. [x] S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link.
3. [ ] Subsequent onboarding/questionnaire/consent slices — finalize from Notion backlog after S4.2 dependencies are validated.

## S4.1 — validated

Validated customer foundation:
- active-customer list/search/create;
- normalized WhatsApp collision rule;
- advisory-lock concurrency protocol;
- atomic `customer.created` audit;
- Fred Gate 2 green.

## S4.2 — validated

Backlog task: **Request conversion transaction: customer + onboarding subscription + immutable link**.

Dependencies are satisfied:
- qualified request workflow exists;
- customer model/S4.1 customer writer exists;
- subscription/component/status-history schema exists.

### Proposed conversion eligibility

Allowed request states:
- `qualified`
- `qualified_with_conditions`

Rejected:
- all other request states, including already `converted`.

The command loads the current non-superseded qualification review and requires its outcome to match the request state.

### Authoritative commercial values

- serviceId: request
- variantId: qualification review `finalVariantId`
- agreedPriceXaf: qualification review
- currency: server constant `XAF`
- plannedStartDate:
  - qualification `targetStartDate` when present;
  - otherwise required conversion-command input.

The conversion API must not permit client overrides for service, variant or price.

### Customer resolution

Inside the conversion transaction:
1. lock the request row;
2. normalize the linked prospect WhatsApp;
3. acquire the same `customer-whatsapp:<normalized>` transaction advisory lock as S4.1;
4. reuse an existing active/non-anonymized customer if found;
5. otherwise create a customer from prospect identity/contact fields with `prospect_id = request.prospect_id`.

Existing customer profile fields are not silently overwritten from prospect data.

### Subscription creation

Create:
- unique reference;
- resolved customerId;
- sourceRequestId = request id;
- serviceId from request;
- variantId from qualification;
- status = `onboarding`;
- agreedPriceXaf from qualification;
- currency = `XAF`;
- plannedStartDate resolved as above;
- createdByUserId = admin actor.

No payment state coupling.

### Component snapshot

At conversion, freeze entitlements into `subscription_components`:
- include service-level components where `variant_id IS NULL`;
- include components belonging to the final selected variant;
- copy source component id, type, label and quantity;
- initialize consumed/owed counters to zero.

Do not read historical subscription entitlement from mutable catalogue later.

### Atomic hard commit

One transaction must contain:
- request lock + conversion recheck;
- qualification recheck;
- customer advisory lock + reuse/create;
- subscription insert;
- component snapshot inserts;
- initial status-history insert (null → onboarding);
- request status → converted;
- request.convertedSubscriptionId link;
- transaction-scoped `request.converted` audit.

The subscription's `sourceRequestId` and request's `convertedSubscriptionId` must reference the same pair.

### Idempotency / concurrency

- conversion succeeds only once;
- repeated/concurrent command returns a typed already-converted conflict;
- never create another subscription as a retry result;
- request row lock serializes competing conversion attempts;
- existing unique constraints on `subscriptions.source_request_id` and `service_requests.converted_subscription_id` remain DB-level final guards.

Incorrect conversion is corrected through later subscription cancellation/correction, never row deletion or request reconversion.

### Capacity boundary

Do not invent `capacityReservedUntil`.
The project has no approved reservation duration/value and the next Sprint 4 backlog task explicitly owns capacity reservation/stalled-state behavior.

S4.2 leaves `capacityReservedUntil = null` unless Fred separately approves a reservation rule before implementation.

### Out of scope

- onboarding item generation;
- medical-clearance workflow;
- questionnaires;
- consent capture;
- payment plans/payments;
- automatic activation;
- automatic notifications;
- customer merge/update;
- reconversion/correction by deleting records.

### Validation target

Unit/Express/shared:
- eligibility and stable errors;
- no client-controlled service/variant/price;
- planned-start validation;
- auth/CSRF;
- response contracts.

Real PostgreSQL integration:
- qualified → customer created + onboarding subscription + components + history + links + audit;
- qualified_with_conditions conversion;
- existing customer reuse under S4.1 lock;
- missing target start rejected without writes;
- repeated conversion rejected with one subscription;
- concurrent conversion produces one subscription;
- audit failure rolls back every authoritative write;
- customer/audit failure rolls back conversion;
- component snapshot failure rolls back conversion;
- request↔subscription links resolve to the same pair.

Fred Gate 2:
- browser conversion from eligible request;
- verify converted request/detail state;
- verify customer reuse/create;
- DBeaver inspect customer/subscription/components/status history/request links/audit;
- verify no onboarding items/consents/questionnaires/payments were created.


### S4.2 validation evidence

Validated locally by Fred on 2026-10-20.

- `npm test`: server 153/153; shared 15/15.
- `npm run test:integration`: 35/35, including 15 S4.2 cases.
- typecheck/build/`db:check`/diff check green.
- Reviewer passed with notes; QA passed with limitations.
- browser conversion flow and DBeaver reciprocal-link/snapshot/history/audit checks green.
- no onboarding/capacity-policy writes leaked into S4.2.
- unchanged Sprint 3 concurrency test failed once then passed on the approved retry; classified as flaky and non-blocking for S4.2.


## S4.3 — approved for implementation

Backlog task: **Onboarding checklist, blockers, capacity reservation and stalled-state review**.

### Scope boundary

S4.3 orchestrates readiness. It does not implement the questionnaire, consent, medical-document or payment subsystems.

### Effective policy

Resolve service policy in this order:
1. selected-variant policy;
2. service-level policy fallback.

Use the effective policy for questionnaire and medical-clearance requirements.

### Checklist proposal

- `start_date_confirmed`: blocking; system-completed on initialization because S4.2 has a planned start.
- `service_terms`: blocking; completion reserved for the later consent/terms workflow.
- `questionnaire`: blocking only when effective policy references a questionnaire template; completion reserved for the later questionnaire workflow.
- `payment_condition`: blocking; coach may mark complete in S4.3.
- `medical_clearance`: for `required_if_risk_flag`, do not create at initialization. The later questionnaire/risk workflow creates/activates this blocker only when triggered. No item for `not_required`.

Checklist initialization must be idempotent and must not duplicate items.

### Capacity reservation

- unlimited service: reservation is not required;
- limited service: coach explicitly sets `capacityReservedUntil`;
- no arbitrary default duration is introduced;
- an expired pre-start reservation derives `stalled`;
- expiry does not auto-cancel, delete or change lifecycle status;
- readiness remains blocked until reservation is extended/reconfirmed;
- setting/extending a reservation and marking ready must transactionally recheck capacity to prevent overbooking.

### Readiness

Derived state:
- `blocked`: blocking requirements remain;
- `ready`: blocking requirements satisfied and required capacity hold valid;
- `stalled`: capacity hold expired while pre-start.

Lifecycle:
- only `onboarding -> ready_to_start` is owned by S4.3;
- no `active` transition here;
- transition + status history + audit must be atomic.

### Admin API proposal

- `GET /admin/subscriptions/:subscriptionId/onboarding`
- `POST /admin/subscriptions/:subscriptionId/onboarding/initialize`
- `POST /admin/subscriptions/:subscriptionId/onboarding/items/:itemId/complete`
- `POST /admin/subscriptions/:subscriptionId/onboarding/items/:itemId/waive`
- `PUT /admin/subscriptions/:subscriptionId/onboarding/capacity-reservation`
- `POST /admin/subscriptions/:subscriptionId/onboarding/ready`

### Manual mutation rules

- manual complete: `payment_condition` only;
- system-owned: `start_date_confirmed`;
- future-workflow-owned: `service_terms`, `questionnaire`, `medical_clearance`;
- waiver must include a non-empty reason and audit;
- no waiver of service terms or medical clearance in S4.3.

### Validation target

Unit/shared/Express:
- policy resolution;
- deterministic/idempotent checklist generation;
- ownership restrictions;
- derived blocked/ready/stalled state;
- capacity deadline validation;
- auth/CSRF;
- stable error taxonomy.

PostgreSQL integration:
- initialize checklist once, retry without duplicates;
- service-policy fallback and variant override;
- unlimited service readiness without reservation;
- limited service blocked without reservation;
- reservation set/extend with capacity recheck;
- expired reservation derives stalled and blocks ready;
- payment-condition completion;
- forbidden completion of future-workflow-owned item;
- waiver audit + rollback on audit failure;
- ready transition writes lifecycle history + audit atomically;
- concurrent reservation/ready attempts cannot overbook configured capacity.

Fred Gate 2:
- browser onboarding panel;
- checklist ownership/status display;
- set/extend reservation;
- stalled visual state after expired test date;
- complete manual payment condition;
- verify ready transition;
- DBeaver inspect onboarding_items, subscription capacity/status/history and audit.


### S4.3 Gate 1 — approved rules

Fred approved the S4.3 plan.

Waiver policy is locked:
- `service_terms`: non-waivable;
- `medical_clearance`: non-waivable;
- `questionnaire`: waivable only with mandatory non-empty reason and audit;
- `payment_condition`: waivable only with mandatory non-empty reason and audit.

Implementation must remain server-first and must not open questionnaire, consent, medical-document, finance, activation, scheduled stalled-job, automatic cancellation, or waitlist-promotion behavior.

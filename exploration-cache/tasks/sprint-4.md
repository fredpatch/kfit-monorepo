# Sprint 4 — Clients, conversion, onboarding, questionnaires et consentements

> Branch: `sprint-4`

## Objective

Build the M4 customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow.

## Execution order

1. [x] S4.1 — Client table + phone-based search/create-inline.
2. [ ] S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link.
3. [ ] Subsequent onboarding/questionnaire/consent slices — finalize from Notion backlog after S4.2 dependencies are validated.

## S4.1 — validated

Validated customer foundation:
- active-customer list/search/create;
- normalized WhatsApp collision rule;
- advisory-lock concurrency protocol;
- atomic `customer.created` audit;
- Fred Gate 2 green.

## S4.2 — planning

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

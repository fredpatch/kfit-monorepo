# Sprint 4 — Clients, conversion, onboarding, questionnaires et consentements

> Branch: `sprint-4`

## Objective

Build the M4 customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow.

## Execution order

1. [ ] S4.1 — Client table + phone-based search/create-inline.
2. [ ] S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link.
3. [ ] Subsequent onboarding/questionnaire/consent slices — finalize from Notion backlog after S4.2 dependencies are validated.

## S4.1 — planning

Backlog task: **Client table + phone-based search/create-inline**.

Current state:
- Drizzle already contains the `customers` table; no new table is needed for the basic customer identity.
- Customers can optionally link to `prospects` through `prospect_id`.
- WhatsApp and email are indexed but not unique.
- Sprint 3 already established WhatsApp normalization for request/prospect intake.
- The later conversion task explicitly depends on the customer model.

S4.1 owns:
- admin customer lookup/listing focused on phone/WhatsApp;
- manual customer creation;
- additive shared contracts and stable customer-domain error codes;
- server-first Service → Controller → Route implementation;
- admin UI integration only after backend validation;
- audit of customer creation without PII in audit metadata.

S4.1 does not own:
- request → customer/subscription conversion;
- subscription creation;
- onboarding checklist creation;
- questionnaire/consent workflows;
- customer merge/deduplication workflow;
- archive/anonymization lifecycle UI unless required only for read safety.

## Planning questions to lock before implementation

1. Manual-create duplicate policy for an existing active customer with the same normalized WhatsApp.
2. Whether manual creation auto-links a matching prospect or only links when an explicit prospect id is supplied.
3. Exact customer list/search result fields exposed to the admin client.
4. Whether archived/anonymized customers appear in normal search.
5. Whether S4.1 needs any schema migration for normalized phone uniqueness; current plan should avoid one unless a business rule explicitly requires hard uniqueness.

## Validation target

After implementation:
- root typecheck/build/db:check;
- shared + server tests with non-zero counts;
- real PostgreSQL integration coverage for lookup/create/concurrency if the final duplicate policy needs it;
- Fred browser + DBeaver smoke;
- no Sprint 4 slice closes without Fred local confirmation.

# Sprint 4 — Clients, conversion, onboarding, questionnaires et consentements

> Branch: `sprint-4`

## Objective

Build the M4 customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow.

## Execution order

1. [ ] S4.1 — Client table + phone-based search/create-inline.
2. [ ] S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link.
3. [ ] Subsequent onboarding/questionnaire/consent slices — finalize from Notion backlog after S4.2 dependencies are validated.

## S4.1 — approved for implementation

Backlog task: **Client table + phone-based search/create-inline**.

Current state:
- Drizzle already contains the `customers` table.
- Customers may optionally link to `prospects`.
- WhatsApp/email are indexed but not unique.
- Sprint 3 already established WhatsApp normalization.
- S4.2 conversion explicitly depends on the customer foundation.

Locked business rules:
- normalized WhatsApp is the V1 active customer collision key;
- duplicate active/non-anonymized normalized WhatsApp creation is rejected;
- no S4.1 unique DB constraint unless escalated and separately approved;
- manual creation does not infer/link a prospect by phone;
- archived/anonymized customers are excluded from normal list/search;
- customer creation + audit are one atomic transaction;
- audit metadata excludes all customer PII;
- all routes are admin-only; POST mutation uses CSRF + same-origin protections.

Scope:
- active customer list;
- normalized WhatsApp search;
- manual inline customer creation;
- shared contracts / stable customer error taxonomy;
- server-first Service → Controller → Route;
- focused server/shared/integration tests;
- French admin client integration only after backend behavior is validated.

Out of scope:
- request conversion;
- subscription creation;
- onboarding;
- questionnaires/consents;
- customer merge/dedup;
- automatic prospect linkage;
- archive/anonymization lifecycle management.

Planned routes:
- `GET /admin/customers`
- `GET /admin/customers/search?whatsapp=...`
- `POST /admin/customers`

Validation target:
- `npm run typecheck`
- `npm test` with non-zero counts
- `npm run build`
- `npm run db:check`
- real PostgreSQL integration for lookup/create/duplicate + audit rollback atomicity
- Fred browser + DBeaver smoke
- Sprint 3 regression check

Gate 1 approved by Fred.

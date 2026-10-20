# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-4
Sprint            4 — Clients, conversion, onboarding, questionnaires et consentements
Active slice      S4.1 — Client table + phone-based search/create-inline
Workflow state    APPROVED_FOR_IMPLEMENTATION
Last validated    Sprint 3 — closed at 5127e4c
Next action       Implementer: execute approved S4.1 server-first plan only
```

## Sprint 4 objective

Build the customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow, preserving server-authoritative lifecycle rules and transactional audit guarantees.

## Sprint 4 execution order

1. S4.1 — Client table + phone-based search/create-inline.
2. S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link.
3. Later Sprint 4 onboarding/questionnaire/consent slices follow dependency order from Notion and the project schema.

Do not implement S4.2 conversion before S4.1 customer identity/search/create behavior is validated.

## S4.1 — approved plan

Goal: expose an authenticated admin customer foundation over the existing `customers` table, with phone-based lookup and manual inline creation, without creating subscriptions or converting requests.

Locked rules:
- normalized WhatsApp is the V1 active-customer collision key;
- creating another active/non-anonymized customer with the same normalized WhatsApp is rejected with a stable typed error;
- no DB unique constraint is added in S4.1 unless an implementation conflict is escalated back to Planner/Fred;
- manual creation does not auto-link a prospect by phone; `prospect_id` remains null in S4.1 manual creation;
- archived/anonymized customers are excluded from normal active list/search;
- manual create accepts required `fullName` + `whatsapp`, optional `email`, `city`, `country`, and optional/default `preferredContactChannel`;
- customer creation and `customer.created` audit persist atomically in one DB transaction;
- audit metadata contains no customer PII;
- admin routes are authenticated; mutation uses same-origin + CSRF;
- no request, subscription, qualification, onboarding, questionnaire or consent mutation belongs in S4.1.

Planned routes:
- `GET /admin/customers`
- `GET /admin/customers/search?whatsapp=...`
- `POST /admin/customers`

Planned result fields:
- id
- fullName
- whatsapp
- email
- city
- country
- preferredContactChannel
- prospectId
- createdAt

Applicable patterns:
- Shared API Contracts
- Domain Error Taxonomy
- Audit Event System
- Atomic Business Operation

Acceptance:
1. Admin can list active customers.
2. Phone lookup uses the same normalization semantics as Sprint 3.
3. Admin can manually create a customer.
4. Duplicate active normalized WhatsApp is rejected.
5. Archived/anonymized customers are excluded from normal lookup.
6. Manual creation never infers prospect linkage from phone alone.
7. Customer insert + audit are atomic.
8. Audit metadata contains no customer PII.
9. Auth/CSRF/origin protections match existing admin mutation conventions.
10. S4.1 changes no request/subscription/onboarding state.
11. French client supports search-first / inline create after backend validation.
12. Sprint 3 acquisition flows remain regression-free.

## Closed

```text
Sprint 0 — Initialisation
Sprint 1 — Auth, sessions, OTP, security (+ password recovery HTTP flow)
Sprint 2 — Catalogue, offers, public availability
Sprint 3 — Demandes, prospects, qualification et liste d'attente
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
Slice             S4.1
Workflow state    APPROVED_FOR_IMPLEMENTATION
Approved goal     Admin customer lookup/list + manual inline creation over existing customers table
Done              planning + Fred Gate 1 approval
Pending           implementation → review → QA → Fred local Gate 2
Validation done   none for S4.1 yet
Out of scope      request conversion, subscriptions, onboarding, questionnaires, consents, customer merge/dedup
Next action       Implementer
```

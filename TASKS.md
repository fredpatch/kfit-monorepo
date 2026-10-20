# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-4
Sprint            4 — Clients, conversion, onboarding, questionnaires et consentements
Active slice      S4.1 — Client table + phone-based search/create-inline
Workflow state    PLANNING
Last validated    Sprint 3 — closed at 5127e4c
Next action       Planner: finalize S4.1 customer identity/search/create plan for Fred approval
```

## Sprint 4 objective

Build the customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow, preserving server-authoritative lifecycle rules and transactional audit guarantees.

## Sprint 4 execution order

1. S4.1 — Client table + phone-based search/create-inline.
2. S4.2 — Request conversion transaction: customer + onboarding subscription + immutable link.
3. Later Sprint 4 onboarding/questionnaire/consent slices follow dependency order from Notion and the project schema.

Do not implement S4.2 conversion before S4.1 customer identity/search/create behavior is validated.

## S4.1 — planning brief

Goal: expose an authenticated admin customer foundation over the existing `customers` table, with phone-based lookup and manual inline creation, without creating subscriptions or converting requests.

Current schema already exists:
- `customers.id`
- optional `prospect_id`
- `full_name`
- `whatsapp`
- optional `email`, `city`, `country`
- `preferred_contact_channel`
- archive/anonymization timestamps
- indexes on WhatsApp and email

Planner must:
- reuse the normalized WhatsApp behavior established by Sprint 3 request intake;
- define customer lookup semantics and manual-create duplicate handling;
- decide whether S4.1 links an existing prospect during manual creation or leaves `prospect_id` null unless an explicit prospect is selected;
- keep request conversion, subscription creation, onboarding, questionnaire and consent writes out of scope;
- use shared DTO/error contracts and authenticated admin routes;
- preserve PII hygiene in logs/audit metadata.

Applicable patterns:
- Shared API Contracts
- Domain Error Taxonomy
- Audit Event System
- Atomic Business Operation only where create/linking requires a hard commit boundary

## Closed

```text
Sprint 0 — Initialisation
Sprint 1 — Auth, sessions, OTP, security (+ password recovery HTTP flow)
Sprint 2 — Catalogue, offers, public availability
Sprint 3 — Demandes, prospects, qualification et liste d'attente
```

## Blockers

Before production:
- Legal validation for the applicable Gabon context (privacy, consent, retention, health notice, terms/refunds, image/testimonials).
- True encrypted off-server backup destination.

Known non-blocking notes:
- Per-IP rate limiting is process-local — revisit for multi-replica production.
- `trust proxy` must be decided in staging/production wiring.
- No client test framework; client acceptance = typecheck + build + Fred browser check.

## Environment constraints

- Docker PostgreSQL: localhost:5433; native PostgreSQL: 5432.
- Chat/cloud runtimes do not run project commands; only Fred's local execution closes validation gates.

## Handoff

```text
Branch            sprint-4
Sprint            4
Slice             S4.1
Workflow state    PLANNING
Approved goal     — pending Fred approval
Done              Sprint 3 merged into main; sprint-4 branch created at 5127e4c
Pending           S4.1 plan approval
Validation done   none for Sprint 4 yet
Out of scope      request conversion, subscriptions, onboarding, questionnaires, consents
Next action       Planner → Fred Gate 1
```

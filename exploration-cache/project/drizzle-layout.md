# K'FIT Drizzle Schema Layout — V1 Core

## Goal

Keep the database schema modular by domain while exporting one coherent relational model from the server package.

## Proposed layout

```text
packages/server/src/db/
├── index.ts
├── client.ts
├── relations.ts
├── enums.ts
├── schema/
│   ├── auth.ts
│   ├── catalogue.ts
│   ├── prospects.ts
│   ├── customers.ts
│   ├── onboarding.ts
│   ├── questionnaires.ts
│   ├── coaching.ts
│   ├── documents.ts
│   ├── finance.ts
│   ├── operations.ts
│   └── index.ts
├── seeds/
│   ├── index.ts
│   ├── bootstrap-config.ts
│   ├── consent-definitions.ts
│   └── questionnaire-templates.ts
└── migrations/
```

## Module responsibilities

### `enums.ts`
Closed database/application vocabularies shared by schema modules. Prefer text columns plus checks/application validation where lifecycle flexibility is useful; use PostgreSQL enum only when the value set is genuinely stable.

### `auth.ts`
- users
- auth_sessions
- trusted_devices
- otp_challenges
- audit_events

### `catalogue.ts`
- services
- service_variants
- service_components
- service_policies

### `prospects.ts`
- prospects
- service_requests
- contact_attempts
- qualification_reviews
- waitlist_entries

### `customers.ts`
- customers
- subscriptions
- subscription_status_history
- subscription_pauses
- subscription_components
- component_events

### `onboarding.ts`
- onboarding_items
- medical_clearance_records
- consent_definitions
- consent_records

### `questionnaires.ts`
- questionnaire_templates
- questionnaire_questions
- questionnaire_submissions
- questionnaire_answers

### `coaching.ts`
- appointments
- appointment_events
- follow_ups
- goals
- progress_measurements
- progress_photos

### `documents.ts`
- documents
- document_versions
- secure_access_tokens
- external_access_events

### `finance.ts`
- payment_plans
- installments
- payment_events
- payment_allocations
- payment_proofs
- quotes
- quote_versions
- receipts

### `operations.ts`
- scheduled_job_runs
- retention_holds
- anonymization_events

## Import rule

Schema modules may import shared enums/helpers but should avoid circular imports between domain files. Cross-domain `relations()` declarations belong in `relations.ts` when moving them out prevents cycles.

## Naming conventions

- TypeScript identifiers: camelCase.
- PostgreSQL table/column names: snake_case.
- Table constants: plural camelCase (`serviceRequests`).
- Foreign-key fields: `<entity>Id` in TypeScript mapped to `<entity>_id` in SQL.
- Monetary fields end in `Xaf` / `_xaf` for V1 currency-specific amounts.
- Timestamps use explicit semantics: `createdAt`, `submittedAt`, `confirmedAt`, `revokedAt`, etc.; avoid generic `date`.

## Shared helpers planned

```text
packages/server/src/db/schema/_helpers.ts
```

Potential helpers:
- common created/updated timestamps
- archive timestamp
- UUID primary key convention
- normalized email/phone helpers at service boundary (not magic DB mutation)
- positive money/quantity check fragments

Do not over-abstract Drizzle definitions. Reuse helpers only for true structural invariants.

## Migration order

1. foundational extensions/conventions if needed
2. auth/audit
3. catalogue
4. prospects
5. customers/subscriptions
6. onboarding/consent/questionnaires
7. documents
8. coaching
9. finance
10. operations/jobs/privacy
11. indexes and deferred cross-domain constraints where required

## Seed policy

Seed only system/reference data:
- initial app configuration
- consent definition drafts/published baseline after sponsor/legal validation
- questionnaire template bases where validated
- configurable payment methods/status reference only if modeled as tables

Do not seed production customers, fake payments, health data or business history.

Development/demo fixtures belong in test factories or dedicated non-production scripts.

## Testing requirements for schema

Before S0.3 is complete, schema tests/migration verification must cover at minimum:
- clean database migration succeeds
- repeated migration is stable through the migration tool
- required uniqueness constraints reject duplicates
- critical FK delete policies behave as documented
- payment allocation transaction cannot over-allocate
- request cannot convert twice
- immutable/versioned records are protected by service layer tests
- current revision/version selectors return one authoritative row

## Next step

Implement `enums.ts` and schema modules after local dependency installation creates a real lockfile and Drizzle/PostgreSQL tooling is available.
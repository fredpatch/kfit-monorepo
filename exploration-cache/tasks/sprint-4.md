# Sprint 4 - Clients, conversion, onboarding, questionnaires et consentements

> Branch: `sprint-4`

## Objective

Build the M4 customer/conversion/onboarding foundation after the validated Sprint 3 acquisition workflow.

## Execution order

1. [x] S4.1 - Client table + phone-based search/create-inline.
2. [x] S4.2 - Request conversion transaction: customer + onboarding subscription + immutable link.
3. [x] S4.3 - Onboarding checklist, blockers, capacity reservation and stalled-state review.
4. [x] S4.4 - Separate consent records and versioned terms/privacy acceptance.
5. [x] S4.5 - Versioned assessment and health-questionnaire templates.

## S4.1 - validated

Validated customer foundation:

- active-customer list/search/create;
- normalized WhatsApp collision rule;
- advisory-lock concurrency protocol;
- atomic `customer.created` audit;
- Fred Gate 2 green.

## S4.2 - validated

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

## S4.3 - validated

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

### S4.3 Gate 1 - approved rules

Fred approved the S4.3 plan.

Waiver policy is locked:

- `service_terms`: non-waivable;
- `medical_clearance`: non-waivable;
- `questionnaire`: waivable only with mandatory non-empty reason and audit;
- `payment_condition`: waivable only with mandatory non-empty reason and audit.

Implementation must remain server-first and must not open questionnaire, consent, medical-document, finance, activation, scheduled stalled-job, automatic cancellation, or waitlist-promotion behavior.

### S4.3 validation evidence

Validated locally by Fred on 2026-10-20.

- `npm test`: server 177/177; shared 17/17.
- PostgreSQL integration: 63/63, including 28 S4.3 cases.
- typecheck/build/`db:check`/diff check green.
- uniqueness migration generated/applied after duplicate preflight found 0 duplicate groups.
- Reviewer passed with notes; QA passed with limitations.
- Browser: onboarding detail, reservation creation/extension, stalled behavior and payment completion green.
- Questionnaire waiver browser path was N/A for the tested service because its effective policy has no questionnaire template.
- Controlled future-workflow fixture completed `service_terms`; readiness then transitioned successfully to `ready_to_start`.
- DBeaver checks confirmed one onboarding item per subscription/type, valid capacity hold, append-only `onboarding -> ready_to_start` history and structural/no-PII audit metadata.
- Derived `stalled` state produced no lifecycle history mutation.

### S4.3 validation evidence

Validated locally by Fred on 2026-10-20.

- `npm test`: server 177/177; shared 17/17.
- PostgreSQL integration: 63/63, including 28 S4.3 cases.
- typecheck/build/`db:check`/diff check green.
- uniqueness migration generated/applied after 0 duplicate groups.
- Reviewer passed with notes; QA passed with limitations.
- Browser/DBeaver Gate 2 green for reservation/extension, stalled state, payment completion and ready transition.
- Controlled future-workflow fixture completed `service_terms`; `onboarding -> ready_to_start` succeeded.
- Questionnaire waiver browser path was N/A because the tested effective policy has no questionnaire template.
- `stalled` remained derived and did not create lifecycle history.

## S4.4 - next task

Notion dependency review selects **Separate consent records and versioned terms/privacy acceptance** before questionnaires. S4.3 provides the onboarding dependency, while the questionnaire task requires the consent model. Planning only until Fred approves Gate 1.

## S4.4 - validated

Backlog task: **Separate consent records and versioned terms/privacy acceptance**.

### Schema foundation

Implement `consent_definitions` and `consent_records` from the conceptual model.

Consent definition:

- `consentType`
- `version`
- `title`
- versioned text content
- `contentHash`
- `status = draft|published|retired`
- `publishedAt`
- `retiredAt`
- timestamps
- unique `(consentType, version)`

Consent record:

- `customerId`
- `subscriptionId`
- `consentDefinitionId`
- `decision = granted|refused|revoked`
- `capturedVia = public_link|coach_assisted`
- `capturedAt`
- `capturedByUserId` nullable
- `secureAccessTokenId` nullable
- `supersedesConsentRecordId` nullable
- verification metadata limited to non-PII technical evidence

Records are append-only. No UPDATE-based decision replacement.

### Consent types

V1 Core model supports:

- `service_terms`
- `privacy_notice`
- `health_data`
- `progress_photo_storage`
- `marketing`
- `publication`

Only `service_terms` and `privacy_notice` are part of the S4.4 onboarding-required bundle.

### Definition version rule

Published definitions are immutable.
A wording change creates a higher version.
S4.4 does not implement the V1.1 material-change/reacceptance review workflow.

No production legal copy is invented in code.
Tests use synthetic definitions; any dev helper must be development-only.
Issuing a real acceptance link requires published definitions for both required onboarding types.

### Capture and current decision

All decision writers lock the subscription before deriving the current decision and appending a record.
Repeated successful public submission must not create duplicate decision rows.

Allowed decisions:

- service_terms/privacy_notice: granted or refused; no revocation command in S4.4;
- health_data/progress_photo_storage/marketing/publication: granted/refused/revoked, with revocation represented by a new append-only record.

### S4.3 integration

After recording decisions, recompute required onboarding acceptance inside the same transaction:

- latest published service_terms version is granted;
- latest published privacy_notice version is granted.

Only then may the `service_terms` onboarding item change to `completed`.

Refusal keeps it pending.
Optional consent decisions never affect the S4.3 service-terms blocker.

Consent writes + checklist completion + audit are one hard commit.

### Public secure link

Reuse existing `secure_access_tokens` / `external_access_events`.

Admin issuance:

- token scoped to subscription;
- action dedicated to onboarding consent capture;
- random bearer token;
- stored only as hash;
- explicit expiry supplied/selected by admin; no hidden business duration;
- revocable;
- raw secret returned only once.

Public read:

- validates hash, scope, action, expiry, revocation/consumption;
- returns customer-safe subscription reference plus exact published service_terms/privacy_notice texts;
- never exposes unrelated customer data.

Public submit:

- accepts one decision for each required definition;
- definition IDs/versions come from the server, not client overrides;
- on success appends consent records, conditionally completes onboarding service_terms, audits, records external-access success, and consumes the token atomically;
- replay after success is rejected without duplicate consent rows.

No OTP is added for this terms/privacy-only flow in S4.4.

### Coach-assisted capture

Authenticated admin may capture the same required decisions:

- source `coach_assisted`;
- actor user stored;
- same exact published definition versions;
- same subscription lock and onboarding recomputation;
- same append-only/audit guarantees.

### Audit / privacy

Suggested events:

- `consent.link_created`
- `consent.decision_recorded`
- `consent.revoked`
- existing/compatible onboarding completion event when `service_terms` becomes complete.

Audit metadata may contain:

- consentType
- definitionId
- definitionVersion
- decision
- capturedVia
- subscriptionId/tokenId as structural IDs

Never include:

- legal text body
- raw bearer token
- phone/email/name
- free-text customer statements.

### Validation target

Shared/unit/Express:

- type/decision validation;
- definition publication/immutability rules;
- token input/error taxonomy;
- admin auth + CSRF;
- public link access rules;
- no client override of definition versions.

PostgreSQL integration:

- schema uniqueness for definition type/version;
- append-only grant/refuse/revoke chain;
- concurrent writers serialize current decision;
- required grant pair completes exactly one service_terms onboarding item;
- refusal leaves blocker pending;
- optional consents do not alter readiness blocker;
- coach-assisted provenance stored;
- secure token hash only, expiry/revocation enforced;
- successful public submit consumes token and replay creates no duplicates;
- audit failure rolls back consent + checklist + token consumption;
- expired/invalid token causes zero business writes.

Fred Gate 2:

- generate secure consent link from onboarding/subscription;
- open public page without authentication;
- inspect exact versioned terms/privacy text;
- refuse one required item and confirm onboarding remains blocked;
- issue fresh link, grant both and confirm service_terms completes;
- verify consumed link cannot be replayed;
- coach-assisted capture on a second subscription;
- DBeaver verify definitions, append-only records, provenance, token hash/consumption, onboarding item and safe audit metadata.

### S4.4 Gate 1 - approved rules

Fred approved the S4.4 plan.

Locked:

- consent definitions are versioned and published versions are immutable;
- consent decisions are append-only hard-commit records;
- onboarding-required bundle is service_terms + privacy_notice only;
- health_data, progress_photo_storage, marketing and publication remain independent;
- public acceptance reuses hashed, scoped, expiring secure-access tokens;
- public GET does not consume the token; successful POST consumes it atomically;
- coach-assisted capture records explicit provenance and actor;
- service_terms onboarding completion occurs only after current granted decisions for the latest published required definitions;
- no production legal text is invented by developers;
- no questionnaire, medical, finance, customer-account, customer-OTP or V1.1 legal-review workflow is opened in S4.4.

Do not start S4.5 until Fred validates S4.4 locally.

### S4.4 validation evidence

Validated locally by Fred on 2026-10-21.

- `npm test`: server 195/195; shared 20/20.
- PostgreSQL integration: 88/88, including 25 S4.4 cases.
- typecheck/build/`db:check`/diff check green.
- migration `0004` applied locally; initial runtime error disappeared after DB alignment.
- public refusal path kept onboarding blocked.
- fresh public link + both grants completed `service_terms`.
- consumed-link replay was rejected without duplicate decisions.
- coach-assisted capture succeeded with explicit provenance.
- DBeaver confirmed append-only consent history, hashed token storage/consumption and safe audits.
- preceding 87/88 run was the known unchanged Sprint 3 concurrency flake; all S4.4 cases passed in both runs.

## S4.5 - validated

Backlog task: **Versioned assessment and health-questionnaire templates**.

### Template schema

Use existing questionnaire tables.

Published template versions are immutable. Template identity uses `templateKey`; each version is a positive integer. Questions are immutable with their published template.

V1 question types:

- short_text
- long_text
- boolean
- single_choice
- multi_choice
- integer
- decimal
- date

Server owns JSON schemas for options/validation/risk rules. No executable expressions.

### Categories and consent

Template category:

- `assessment`
- `health`

Health questionnaires require current grant of the latest published `health_data` consent definition.

If no current grant:

- public flow may record the health_data decision separately in the questionnaire submit transaction;
- refusal is persisted as consent evidence but no questionnaire submission/answers are stored;
- coach-assisted answer capture is forbidden until health_data is granted.

Revoked health consent prevents future health submissions but does not erase immutable historical submissions.

### Assignment

Resolve effective service policy:

1. selected variant policy;
2. service-level policy.

Configured `questionnaireTemplateId` must reference a published template.
No configured template means no questionnaire requirement.

### Submission revisions

A committed submission is immutable.

- first submitted revision = 1;
- later correction = N+1;
- `supersedesSubmissionId` links revision chain;
- one logical head under subscription lock;
- exact template id/version is retained.

Public V1 does not persist partial drafts.

### Risk engine

Risk rules are declarative allowlisted predicates against the answer to their own question only.

Allowed V1:

- equals / in
- numeric gt/gte/lt/lte

No eval, scripting, cross-question logic, diagnosis or medical recommendations.

Result:

- boolean riskDetected;
- matched question keys for internal structural evidence.

### Onboarding

Successful submission for the currently assigned template:

- completes S4.3 `questionnaire` item atomically.

Questionnaire waiver remains S4.3 behavior.

Ordinary reads never silently reopen a completed blocker because a newer template exists. Reassignment/reacceptance requires an explicit future/admin configuration action.

### Medical clearance

If effective policy = `required_if_risk_flag` and riskDetected:

- create/preserve one active pending `medical_clearance_record`;
- create/upsert blocking onboarding item `medical_clearance` pending;
- trigger source references questionnaire submission;
- no diagnosis content.

If no risk:

- no blocker is created.

A later safe revision does not auto-clear an existing medical requirement.

S4.5 does not clear/review medical records.

### API proposal

Admin template/configuration:

- `GET /admin/questionnaire-templates`
- `POST /admin/questionnaire-templates`
- `POST /admin/questionnaire-templates/:templateId/publish`
- `POST /admin/questionnaire-templates/:templateId/new-version`

Subscription:

- `GET /admin/subscriptions/:subscriptionId/questionnaire`
- `POST /admin/subscriptions/:subscriptionId/questionnaire-link`
- `POST /admin/subscriptions/:subscriptionId/questionnaire/coach-submit`

Public:

- `GET /public/questionnaires/:token`
- `POST /public/questionnaires/:token`

Revision/correction may reuse coach/public submission commands with explicit expected head/revision to prevent stale overwrites.

### Secure token

Questionnaire action is separate from S4.4 consent-token action.
Token snapshots:

- subscriptionId
- templateId
- templateVersion
- question schema identity/hash
- required health_data definition id when category=health

GET is non-consuming.
Successful submitted questionnaire consumes token.
Health-consent refusal may consume token after recording refusal because no answers may follow under that attempt.

### Validation target

Shared/unit/Express:

- every question type;
- options/validation schema;
- published immutability;
- assignment resolution;
- required answer validation;
- health consent precondition;
- risk predicate validation/evaluation;
- admin auth/CSRF and public token errors.

PostgreSQL integration:

- publish immutable version;
- create N+1 without mutating old;
- assessment submit without health consent;
- health submit rejected with no consent;
- health refusal records consent but zero answers/submission;
- health grant + answers commits atomically;
- exact template version retained;
- correction creates immutable revision N+1;
- concurrent revisions create one chain head;
- questionnaire blocker completes on valid current submission;
- risk + required_if_risk_flag creates one medical blocker/record;
- no risk creates none;
- not_required policy creates none despite risk;
- later safe revision does not auto-clear medical requirement;
- public GET does not consume token;
- submit consumes; replay rejected;
- audit failure rolls back submission/answers/onboarding/medical/token use;
- health answers/free text absent from audit metadata.

Fred Gate 2:

- create/publish synthetic assessment + health template;
- assign through service policy fixture;
- public assessment completion;
- public health refusal (no answers stored);
- fresh health link grant + answers;
- risk-answer case creates medical blocker;
- coach-assisted safe revision;
- DBeaver verify immutable versions/submissions/answers, consent provenance, medical blocker and safe audits.

### S4.5 Gate 1 - approved rules

Fred approved the S4.5 plan.

Locked:

- template categories are `assessment` and `health`;
- published template versions/questions are immutable; edits create version N+1;
- allowed V1 question types are short_text, long_text, boolean, single_choice, multi_choice, integer, decimal and date;
- server validates all options/validation/risk JSON; no executable expressions;
- health submissions require a current grant of the latest published `health_data` consent definition;
- health refusal records consent evidence but persists zero health questionnaire submissions/answers;
- risk evaluation is declarative/non-diagnostic and may only produce operational flags;
- `required_if_risk_flag` may create a pending medical-clearance record/blocker; safe later revisions never auto-clear it;
- successful submissions/revisions are immutable append-only records and complete the questionnaire onboarding item atomically;
- questionnaire links use a separate secure token scope; GET non-consuming, successful POST consuming;
- no customer OTP, medical diagnosis/advice, medical clearance completion, AI review, active-coaching questionnaires or subscription activation in S4.5.

Do not start any later Sprint 4/5 behavior until Fred validates S4.5 locally.

### S4.5 validation evidence

Validated locally by Fred on 2026-10-21.

- Original pre-correction agent validation: server 214/214, shared 34/34, PostgreSQL integration 131/131 including 43 S4.5 cases.
- Gate 2 exposed a missing admin assignment path from published questionnaire templates to service/variant policy.
- Corrective S4.5 work added assignment read/write, policy persistence, variant/service inheritance and Vite proxy coverage.
- Fred reran the final validation suite after the correction and reported all checks green.
- Browser acceptance validated assignment, public/coach-assisted questionnaire flows, health-consent refusal behavior, risk-triggered medical clearance, safe revision N+1 and replay rejection.
- DBeaver checks were green for immutable templates/submissions/answers, consent provenance, medical-clearance state, token hashes and safe audits.
- Exact post-correction test counts were not separately reported.

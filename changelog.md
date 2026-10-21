# K'FIT Changelog

> Only locally validated changes are recorded here.

## 2026-10-21 — Sprint 5.1 subscription lifecycle

- Fred locally validated S5.1 end-to-end.
- Added authoritative lifecycle commands for activation, pause/resume, completion review, completion, cancellation and renewal.
- Added immutable duration snapshots and linked renewal lineage; catalogue edits do not rewrite existing subscription duration.
- Pause/resume preserves an explicit manually chosen revised end date rather than auto-adding pause days.
- Planned end never auto-completes; completion review is explicit.
- Completion preserves component balances and enforces the outstanding-component safeguard before closure.
- Cancellation preserves history and remains independent from finance.
- Renewal creates exactly one linked onboarding subscription, clones commercial/component snapshots and resets consumption/owed counters.
- Gate 2 exposed an onboarding/questionnaire policy fallback mismatch. Onboarding was aligned to the same per-field variant-to-service fallback used by questionnaire assignment, and a fresh-request retest passed.
- Agent baseline before that final correction: server 231 passed, shared 35 passed, PostgreSQL integration 177/177 including 44 lifecycle cases; typecheck/build/db:check/diff green.
- Reviewer passed with notes; QA passed with limitations; Fred Gate 2 browser/DBeaver validation is green.
- Exact post-correction automated test counts were not separately reported.

## 2026-10-21 — Sprint 4.5 versioned assessment and health questionnaires

- Fred locally validated S4.5 end-to-end.
- Added versioned assessment/health questionnaire templates with eight V1 question types and immutable published versions.
- Added secure public and coach-assisted questionnaire submission, append-only correction revisions and strict answer validation.
- Enforced separate health_data consent before health answers are persisted; refusal records consent evidence and stores zero questionnaire submissions/answers.
- Added declarative non-diagnostic risk evaluation and integration with the onboarding questionnaire blocker and pending medical-clearance requirement.
- A safe later revision does not auto-clear an existing medical-clearance requirement.
- Gate 2 exposed a missing admin assignment path. The validated corrective fix added service/variant questionnaire assignment backed by service_policies.questionnaire_template_id, published-template validation, audited writes, variant override and service fallback.
- Added the missing Vite dev proxy for the assignment endpoint; local API/client restarts were required after route/proxy changes.
- Original agent validation before the corrective fix: server 214/214, shared 34/34, PostgreSQL integration 131/131 including 43 S4.5 cases.
- Fred reran the final validation suite after the corrective fix and reported all checks green; exact post-correction counts were not separately reported.
- Browser/DBeaver Gate 2 validated assignment, public/coach-assisted flows, immutable history, health-consent behavior, risk-triggered medical blocker, revision N+1, replay rejection, hashed tokens and safe audits.

## 2026-10-21 — Sprint 4 closed

- Sprint 4 acceptance criteria are satisfied across S4.1–S4.5.
- Customer identity/search/manual creation, atomic request conversion, onboarding readiness/capacity, versioned consent/terms acceptance and versioned assessment/health questionnaires are locally validated.
- Production blockers remain unchanged: applicable Gabon legal review and a true encrypted off-server backup destination.

## 2026-10-21 — Sprint 4.4 versioned consent and terms/privacy acceptance

- Fred locally validated S4.4 end-to-end.
- Added versioned consent definitions and append-only consent decisions.
- Added separate consent types for service terms, privacy, health data, progress-photo storage, marketing and publication.
- Added secure subscription-scoped public consent links using hashed bearer tokens; successful submission consumes the link and replay cannot duplicate decisions.
- Added coach-assisted consent capture with explicit actor/provenance.
- Integrated required service-terms/privacy grants atomically with the S4.3 `service_terms` onboarding blocker.
- Kept optional consent types independent from onboarding readiness.
- Added migration `0004`; local runtime initially failed until Fred applied the migration, after which the consent panel loaded correctly.
- No production legal wording was embedded; local testing used clearly synthetic demo definitions.
- Validation: server 195/195, shared 20/20, PostgreSQL integration 88/88 including 25 S4.4 cases, plus green typecheck/build/`db:check`/diff.
- Browser/DBeaver Gate 2 validated refusal, fresh-link grant, consumed-link replay rejection, coach-assisted provenance, append-only decision history, hashed tokens and safe audits.
- The preceding 87/88 run was the documented unchanged Sprint 3 concurrency flake; no S4.4 case failed.

## 2026-10-20 — Sprint 4.2 atomic qualified-request conversion

- Fred locally validated S4.2 end-to-end.
- Added the named admin conversion command for `qualified` and `qualified_with_conditions` requests.
- Kept service, final variant, agreed price and XAF currency server-authoritative; the client can supply only a fallback planned start date when qualification has none.
- Reused the S4.1 normalized-WhatsApp transaction advisory lock to resolve or create customers safely.
- Reused an active matching customer when present; otherwise created the customer from the exact request prospect and linked `prospect_id`.
- Created one `onboarding` subscription with immutable `source_request_id`, leaving `capacity_reserved_until` null for the later capacity/onboarding slice.
- Snapshotted service-level and selected-variant entitlements into `subscription_components` with zero consumed/owed counters.
- Inserted the initial append-only subscription status history row from null to `onboarding`.
- Atomically linked `service_requests.converted_subscription_id` and `subscriptions.source_request_id` to the same request/subscription pair and moved the request to `converted`.
- Persisted `request.converted` audit in the same transaction with structural metadata only and no customer/prospect PII or qualification free text.
- Enforced exactly-once conversion: repeat/concurrent attempts return a typed conflict and do not create another subscription.
- Kept onboarding items, medical clearance, questionnaires, consents, payments, notifications and capacity-reservation policy out of S4.2.
- Confirmed typecheck/build/`db:check`/diff check green; server tests 153/153; shared tests 15/15; PostgreSQL integration 35/35 including 15 S4.2 cases.
- Reviewer passed with notes; QA passed with limitations; Fred validated browser and DBeaver Gate 2 behavior.
- Known non-blocking test note: an unchanged Sprint 3 concurrency test failed once and passed on the approved retry; no S4.2 test failed.

## 2026-10-20 — Sprint 4.1 customer identity/search/manual-create foundation

- Fred locally validated S4.1 end-to-end.
- Added shared customer contracts and a shared WhatsApp normalizer reused by customer/request flows.
- Added authenticated admin customer list, normalized WhatsApp search and manual customer creation.
- Rejected duplicate active/non-anonymized customers by normalized WhatsApp without adding a database uniqueness constraint.
- Serialized manual creates with a PostgreSQL transaction-scoped advisory lock keyed by normalized WhatsApp; future customer writers must use the same collision protocol unless a separately approved DB uniqueness strategy replaces it.
- Kept manual creation independent from prospect identity: `prospect_id` remains null and no phone-only auto-link is performed.
- Excluded archived/anonymized customers from normal active lookup.
- Persisted customer creation and `customer.created` audit atomically; audit metadata is limited to `{ source: "manual" }` and contains no customer PII.
- Added French admin Clients navigation, phone search and inline-create UX.
- Kept request conversion, subscription creation, onboarding, questionnaires, consents and customer merge/dedup out of S4.1.
- Confirmed no migration, dependency or lockfile change was required.
- Confirmed typecheck/build/`db:check`/diff check green; server tests 122/122; shared tests 15/15; real PostgreSQL integration 20/20 including all five S4.1 DB scenarios.
- Reviewer passed with notes; QA passed with browser limitation; Fred validated live browser and DBeaver behavior.
- Added a development-only demo-admin helper restricted to `NODE_ENV=development` and the disposable `localhost:5433/kfit_dev` target for local acceptance support.

## 2026-09-17 — Sprint 3 closed after validated S3.5 manual waitlist management

- Closed Sprint 3 after Fred locally validated S3.1 through S3.5.
- Added named admin commands for manual waitlist creation and withdrawal; no generic `waitlisted` status patch was introduced.
- Restricted waitlist creation to requests in `submitted`, `contacting`, or `qualification_in_progress` and to non-archived services that are `waitlist_only` or have waitlisting enabled.
- Added optional same-service, non-archived variant selection and advisory `priorityNote` without allowing it to affect FIFO ordering.
- Serialized waitlist creation with `FOR UPDATE` on the request row and active-entry conflict checks, avoiding a new uniqueness migration for the V1 command path.
- Persisted waitlist entry creation + request transition to `waitlisted` + `request.waitlist_entered` audit in one PostgreSQL transaction.
- Persisted withdrawal (`withdrawn` + `leftAt`) + request transition to `abandoned` + `request.waitlist_withdrawn` audit in one PostgreSQL transaction.
- Kept audit metadata free of `priorityNote`, prospect PII and other free text.
- Added additive waitlist history plus eligible create/withdraw controls to the admin request detail UI.
- Kept automatic promotion, contacted/promoted/expired commands, subscription conversion, onboarding and queue reordering out of Sprint 3.
- Fixed shared/server test globs so `npm test` discovers real tests on Windows instead of succeeding with zero tests.
- Confirmed typecheck, build and `db:check` green; `npm test` executed server 110/110 and shared 12/12; real PostgreSQL integration suite executed 15/15 green.
- Reviewer and QA passes completed; Fred validated the browser/DBeaver Gate 2 flow for waitlist creation, duplicate prevention, withdrawal, request-state synchronization and safe audit metadata.
- Sprint 3 now delivers the validated acquisition path from public request intake through contact management, qualification decision and manual waitlist handling.


# K'FIT Changelog

> Only locally validated changes are recorded here.

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


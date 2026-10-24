# K'FIT Changelog

> Only locally validated changes are recorded here.

## 2026-10-24 — Refonte UI (Track B) closed

- Every admin and public screen now follows the validated boards (canvas « K'FIT — Refonte UI »); business rules unchanged except where Fred decided below.
- Steps since UX-9c, each applied and pushed by Fred: UX-9d `1d3a476`, UX-9e `6ca2a2f`, UX-10 `e0ae7f1`, UX-12a `4288d46`, UX-12b `57e5613`, UX-11 `bf87713`, UX-15 `27042a1` + `f86cdcb`, UX-14 `56f8454` + `b751757` + `63279f3` (OTP e-mail fix `f989bec`), UX-13 `14106e7`.
- Fred's local checks of UX-9d, UX-10 and UX-13 passed on 2026-10-24.
- Highlights: login/recovery screens; landing + request page; the 7 customer link pages on one public shell; « Paiements » (finance, quotes, receipts, proof review) and « Documents » tabs; Rendez-vous, Suivis, Préparation, Santé et consentements tabs and the Suivis page; `legacy.css` removed.
- Fred decisions recorded in `TASKS.md` § Open decisions: FCFA on customer pages / XAF in admin; Finance + Devis merged into « Paiements »; proof confirm pre-filled with the client's declaration; appointment response link created at scheduling; « rythme » wording; questionnaire answers viewable only after a fresh e-mailed OTP, audited, refused once the health-data consent is withdrawn.
- Only server change of the track: UX-14c read-only answers route (`GET /admin/subscriptions/:id/questionnaire/revisions/:submissionId`); questionnaire PostgreSQL integration 47/47.
- Limits: public pages still say « ta coach » until the coach onboarding (name, logo, photo); production also needs legal pages, SMTP settings and the public contact links at build time.

## 2026-10-23 — Sprint 7.1 dashboard analytics and operational alerts

- S7.1 is locally validated and closed.
- Implementation: `ed1c7d0` — `feat(dashboard): add historical analytics and operational alerts`.
- Corrective fix: `bb3ba76` — deterministic finance allocation read ordering by authoritative installment order.
- Added 4w/8w/12m request analytics, cumulative submitted-cohort funnel, eight-week KPI trends/deltas, five distinct authoritative finance values and derived operational-alert workspaces.
- Added prospective effective follow-up cadence history. Legacy cadence before the authority boundary is never fabricated; unavailable historical points remain null/unavailable and suppress misleading deltas.
- Current `GET /admin/today` semantics remain unchanged.
- Validation: server 523/523, shared 56/56, PostgreSQL 542/542, typecheck/build/db:check green.
- Fred confirmed browser/mobile/keyboard and DBeaver Gate 2 all green.
- Known non-blocking coverage note: actual catalogue-seed concurrency against simultaneous override/activation was inspected but not directly runtime-tested; transaction helpers and database overlap constraints are covered.
- S7.2 may now enter planning; no notification/email implementation before its Gate 1.

## 2026-10-23 — Sprint 6 closed

- Sprint 6 is locally validated and closed across S6.1–S6.4.
- Delivered the V1 Core finance chain: payment plans/installments, confirmed payment events and FIFO allocations, versioned quotes and secure acceptance, customer payment-proof evidence/review, and sequential payment receipts with secure sharing.
- Financial state remains independent from subscription lifecycle throughout the sprint.
- Historical financial/documents evidence is append-only or immutable at the appropriate business point; corrections never rewrite source payment or receipt history.
- Final S6.4 implementation: `a38901a`; server 470/470, shared 55/55, PostgreSQL 507/507, typecheck/build/db:check and real PDF/files/ClamAV preflights green.
- Fred confirmed S6.4 browser/mobile/keyboard and DBeaver Gate 2 all green.
- Next sprint: Sprint 7 — Dashboard, notifications, retention, backups and hardening.
- First task: S7.1 — Core dashboard KPIs and operational alert workspaces; Gate 1 required before implementation.

## 2026-10-23 — Sprint 6.4 sequential receipts and secure sharing

- Implementation commit: `a38901a` — `feat(receipts): add sequential receipts and secure sharing`.
- Fred confirmed browser and database checks all green and explicitly authorized commit/push.
- Added explicit receipt issuance for authoritative confirmed payment_received events, with one receipt per payment enforced by PostgreSQL uniqueness and locked annual REC-YYYY-NNNN numbering.
- Frozen historical snapshots and deterministic French PDFs preserve source payment/allocation facts and balance after that payment. Ambiguous source confirmation timestamps reject safely rather than invent historical ordering.
- Private scanned immutable PDF storage, receipt ownership, structural audit and number allocation commit atomically; failures compensate finalized files. Payment entry and proof confirmation remain independent of PDF infrastructure.
- Added hash-only scoped temporary download links, expiry/revocation/use limits, non-consuming metadata and access audits. Current correction state remains separate from immutable historical evidence.
- Explicit void requires full source-payment correction and a private reason; number/PDF remain preserved, and valid public links show ANNULÉ while retaining the original PDF.
- French Finance receipt actions/section and public /recu/:token reuse existing components. Reviewed binary-error decoding preserves typed French failures without changing successful PDF downloads.
- Approved migration 0012_spooky_spiral.sql was generated/applied after a zero-evidence preflight; no backfill required. Preserve snapshot/number/PDF/void evidence before rollback after use.
- Agent evidence: typecheck/build/schema/diff passed; 470/470 server, 55/55 shared, 507/507 PostgreSQL including 40 receipt cases; real PDF and ClamAV clean/EICAR preflights passed. Independent Reviewer passed with notes; QA passed with limitations before Fred acceptance. No dependency/lockfile changes. Sprint 6 closure remains a separate decision.

## 2026-10-22 — Sprint 6.3 secure payment proofs and coach review

- Implementation commit: `8edebc7` — `feat(payment-proofs): add secure upload and coach review`.
- Fred locally validated S6.3 end-to-end, including browser/mobile/keyboard, private scanned storage/ClamAV behavior and DBeaver evidence.
- Added scoped, expiring, revocable, hash-only, single-use customer upload links and French public/admin interfaces in the subscription Finance area.
- Upload stores private scanned evidence and untrusted customer claims only; it never creates authoritative money.
- Named full/partial coach confirmation reuses S6.1 payment/FIFO machinery in one transaction with exact proof-to-payment linkage and audit; rejected/correction/duplicate outcomes create no payment or lifecycle changes.
- Correction creates a new proof/document with preserved lineage and historical evidence. Same-lineage SHA duplicates are rejected; private notes remain separate from customer-facing messages. Proof files have no public download path.
- Migration `0011_motionless_molly_hayes.sql` was generated/applied locally after zero-evidence preflight; no backfill required.
- Validation: server 437/437, shared 53/53, PostgreSQL 467/467 including 39 S6.3 cases; typecheck/build/db:check/files preflight green.
- Dedicated concurrency coverage confirms double-review creates one payment and manual payment vs proof confirmation cannot over-allocate.
- Known non-blocking gap: no dedicated expiry-during-lock-wait runtime regression; expiry is rechecked after locks.
- S6.3 is closed. S6.4 remains planning-only until its Gate 1.

## 2026-10-22 — Sprint 6.2 versioned quotes and secure acceptance

- Implementation commit: `9fe7e1b` — `feat(quotes): add versioned quotes and secure acceptance`.
- Fred confirmed the S6.2 Gate 2 validation checklist "all green": local commands, browser/mobile/keyboard, real scan/storage issuance and DBeaver acceptance.
- Added versioned subscription/customer-owned quotes with official DEV-YYYY-NNNN numbering allocated under an annual PostgreSQL counter lock at first issuance.
- Issued commercial snapshots and private PDF artifacts remain immutable; later versions preserve the quote number and historical responses/documents.
- Added exact-version, hash-only temporary response links with expiry/revocation, rate limiting, explicit accepted/declined/changes_requested decisions and safe access/audit evidence.
- Public acceptance never changes subscriptions. Explicit coach synchronization records the accepted version and updates price only when compatible with authoritative finance history; lifecycle/service/variant/components/duration remain unchanged.
- Added French admin Devis and public quote pages with explicit confirmations and FCFA display; persistence/API remain XAF.
- Generated migration `0010_productive_post.sql` was approved and applied locally after a zero-evidence preflight; no backfill required.
- Agent evidence: typecheck/build/schema/diff passed; server 400/400, shared 51/51, PostgreSQL 428/428 including 34 quote cases; real Chromium snapshot PDF determinism passed. Reviewer passed with notes; QA passed with limitations before Fred's acceptance. The known unchanged Sprint 3 concurrency flake passed its approved retry.
- Direct synchronization-versus-finance race coverage remains a documented test gap. Fred explicitly authorized commit/push; S6.3 is not started.

## 2026-10-22 — Sprint 5 closed

- Sprint 5 is locally validated and closed across S5.1–S5.5.
- The sprint now delivers the authoritative post-onboarding coaching lifecycle: subscription state, appointments/component consumption, follow-up cadence, progress/goals and personalized documents.
- Production blockers remain unchanged: applicable Gabon legal review, a true encrypted off-server backup destination, and the device-OTP/trusted-device login contract before production.
- Next dependency-ordered sprint is Sprint 6 — finance. First task: financial ledger for charges, installments, transactions and allocations; implementation remains gated by Sprint 6 planning/Gate 1.

## 2026-10-22 — Sprint 5.5 personalized documents and secure delivery

- Fred locally validated S5.5 end-to-end.
- Added private personalized documents owned by subscription with immutable document versions and an explicit current-version pointer.
- Added clean-file hard-commit storage using signature/extension validation, SHA-256 metadata, opaque private filenames and mandatory ClamAV scanning.
- Added deterministic Puppeteer progress-summary PDFs from authoritative K'FIT data; generation requires current health-data consent.
- Added private progress-photo storage guarded independently by progress-photo-storage consent; V1 Core exposes no public photo-delivery path.
- Added temporary version-bound customer delivery links with hash-only bearer storage, expiry, revocation, default three-use limit and exact old-version binding after newer versions exist.
- Sensitive-health document links require a separately communicated six-digit verification challenge; raw codes are not persisted and five failed attempts lock verification.
- Gate 2 exposed a missing Documents profile tab and two delivery UX issues. Commit `0f39eb2` exposed the tab, added exact-version link selection and corrected post-verification public download behavior.
- Validation: typecheck/diff green; server 332/332; shared 47/47; PostgreSQL 348/348; file/ClamAV preflight passed; PDF/Puppeteer preflight passed.
- Browser/mobile/keyboard flow and DBeaver/private-storage inspection are green. Stored files matched DB size/SHA evidence and generic audits contained structural data only.
- No S5.5 migration or new package dependency was required.

## 2026-10-22 — Refonte UI UX-10 Connexion

- Board 09 rebuilt: two-panel auth shell (text-only brand panel, hidden below lg), Connexion with show/hide password and DEV-only demo button, « Mot de passe oublié » in three steps (e-mail → 6-digit code → new password), Initialisation restyled.
- Rules validated by Fred: one message for invalid credentials / unavailable account; neutral code request; « Code invalide ou expiré. » with 5-minute hint; 60 s resend cooldown; reset returns to Connexion without auto-login.
- Password policy (12 characters, a letter, a number) now exported from `@kfit/shared` and shown upfront with an advisory strength meter; a server test asserts parity with `validatePasswordStrength`.
- Sprint 1 password-recovery service is now bound in `dev-app.ts` when `SMTP_HOST` is set (it was never composed; routes answered 501). Service code unchanged.
- Full-screen loader now covers only the initial session check, so login errors are no longer lost during submit.
- Legacy auth CSS removed.
- Deferred: new-device OTP + trusted device (pre-prod blocker, Notion « Session security »).
- Agent validation: client tsc/build, server 326 tests, shared 45 tests, browser pass desktop + 390 px. Fred local validation pending.

## 2026-10-22 — Refonte UI UX-1 → UX-9b (admin screens)

- Track B on `main`, parallel to Sprint 5. Business logic unchanged; only read-only API endpoints were added. Each step was delivered as a diff and applied/pushed by Fred. Live tracking: `TASKS.md` § Refonte UI — suivi.
- UX-1 (88235de): Tailwind v4 + shadcn primitives, design tokens, shared status map; legacy screens isolated under `legacy.css`.
- UX-2 (141175f): admin shell with React Router, sidebar and mobile navigation.
- UX-3 (c2d4497): data kit — DataTable, read-only tables, KPI tile, sparkline, bar and stacked charts.
- UX-4a/b/c (477650a, f92e7cb, 972dc22): client profile shell, Aperçu, Progression and Analyse tabs; added `GET /admin/customers/:id` and `GET /admin/customers/:id/analytics` (attendance, cadence, pace and responsiveness rules validated by Fred).
- UX-5 (b8a1135): clients list and creation; added `GET /admin/customers/overview`; client status derived once in `@kfit/shared`.
- UX-6 (f21120f): requests queue views and detail.
- UX-7 (86362d5): catalogue and capacity; added `GET /admin/catalogue/services/overview`; capacity limit below occupied places warns instead of blocking.
- UX-8 (309294d): questionnaires screen (families, versions, editor).
- UX-9 (a122ccd): « Aujourd'hui » coach dashboard as `/admin` home; added `GET /admin/today` and `GET /admin/appointments` (max 62 days); business time zone Africa/Libreville in `@kfit/shared` `time/`.
- UX-9b (8a4e435): Aujourd'hui layout aligned with board 02; weekly requests chart, KPI sparklines/deltas and first-name greeting deferred to Sprint 7 (UX-9c) with a placeholder.
- Agent validation per step: client typecheck/build, server tsc + unit tests, shared tests; PostgreSQL integration test added for the UX-9 dashboard repository. Full UI recette (desktop + 390 px) pending in UX-13.
- Open: UX-10 scope decision; auth contract gap (no device OTP at login) recorded as a pre-prod blocker; prod reverse proxy must list `/admin/today` and `/admin/appointments`.

## 2026-10-21 — Sprint 5.4 progress measurements and structured goals

- Fred locally validated S5.4 end-to-end.
- Added append-only chronological progress measurements with duplicate protection and health_data consent enforcement.
- Consent refusal/revocation blocks new measurement collection while preserving historical measurements.
- Added structured qualitative/numeric goals with deterministic advisory suggestions and explicit coach-confirmed outcomes.
- Suggestions never mutate authoritative goal status automatically.
- Added append-only goal events preserving transitions and suggestion snapshot at confirmation.
- Added explicit goal pause/resume/cancel and outcome confirmation; subscription lifecycle does not auto-finalize goals.
- Added French Progression UI with measurement history/deltas and distinct authoritative status vs system suggestion.
- Progress photos remain deferred to S5.5.
- Agent validation: server 304 passed, shared 41 passed, PostgreSQL integration 333/333 including 58 S5.4 cases; typecheck/build/db:check green.
- Migration 0008 applied locally.
- Reviewer passed with notes; QA passed with limitations; Fred Gate 2 browser/DBeaver validation is green.
- First integration run reproduced the unchanged Sprint 3 concurrency flake; the approved retry passed.
- UI currently uses kg/cm/%; stricter API metric/unit compatibility is deferred as hardening.

## 2026-10-21 — Sprint 5.3 structured follow-ups and cadence

- Fred locally validated S5.3 end-to-end.
- Added structured coach follow-ups with append-only history and optional next actions.
- Added configurable cadence resolution: subscription override, then variant policy, then service policy; null disables monitoring.
- Added pause-aware cadence calculation based on active elapsed time rather than wall-clock time.
- Meaningful activity resets cadence; non-meaningful appointment/reschedule/cancellation traffic does not.
- Subscription cadence health is derived as healthy/due/overdue and is never persisted.
- Individual open follow-up next actions derive overdue at read time.
- Added French subscription follow-up UI and global queue at /admin/follow-up-queue.
- Agent validation: server 274 passed, shared 39 passed, PostgreSQL 275 passed including 51 follow-up cases; typecheck/build/db:check/diff green.
- Migration 0007_misty_kronos.sql applied locally with no backfill needed.
- Reviewer passed with notes; QA passed with limitations; Fred Gate 2 browser/DBeaver validation is green.
- Queue history loading may need batching as volume grows; deferred as future optimization.

## 2026-10-21 — Sprint 5.2 appointment scheduling and secure responses

- Fred locally validated S5.2 end-to-end.
- Added appointment scheduling for active subscriptions, optional linkage to subscription components and immutable appointment event history.
- Added secure public appointment-response links for confirm, decline and reschedule-request without customer accounts.
- Added appointment-time snapshots for late-cancellation and missed-session consumption policy so later catalogue edits cannot reinterpret historical appointments.
- Rescheduling preserves original schedule facts and creates one linked replacement appointment.
- Coach cancellation never consumes entitlement; on-time customer cancellation never consumes entitlement; late customer cancellation/missed may consume exactly one unit according to the appointment policy snapshot.
- Completed linked appointments consume one entitlement atomically.
- Component accounting uses append-only component events with explicit restoration rather than rewriting consumption history.
- Validated cancellation-window semantics: null notice-hours means no late penalty and exactly at the deadline counts as on time.
- Agent validation: server 251 passed, shared 37 passed, PostgreSQL 224 passed including 47 appointment cases; typecheck/build/db:check/diff green.
- Migration 0006_free_tusk.sql applied locally with no backfill needed.
- Reviewer passed with notes; QA passed with limitations; Fred Gate 2 browser/DBeaver validation is green.

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


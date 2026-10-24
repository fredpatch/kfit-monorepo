# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

Sprint 6 S6.1–S6.4 are validated and Sprint 6 is closed on `main`. The former `sprint-5` branch remains historical.

```text
Branch            main
Sprint            7 — Dashboard, notifications, rétention, sauvegardes et durcissement
Active slice      S7.2 — Dashboard and email notification engine with configurable reminders
Workflow state    APPROVED_FOR_IMPLEMENTATION
Last validated    S7.1 — locally validated 2026-10-23
Implementation    ed1c7d0 — feat(dashboard): add historical analytics and operational alerts
Next action       IDE Implementer: implement S7.2 notification/digest/outbox only; stop before S7.3

UI refonte        UX-1 → UX-9c validated
UX-10             pushed at e0ae7f1; Fred local Mailpit/browser validation still pending
UX-9d/9e          Aujourd'hui fidelity fixes + alerts dedupe pushed (1d3a476, 6ca2a2f)
UX-16             notification-centre boards validated → referenced in sprint-7.md § S7.2 UI
UX-12a/12b        all 7 customer token pages on the public shell (4288d46, 57e5613)
UX-11             landing + request page pushed (bf87713)
UX-15             « Paiements » + « Documents » pushed (27042a1, f86cdcb)
UX-14             UX-14a/14b pushed (56f8454, b751757); UX-14c answers view (server + client) — diffs delivered 2026-10-23
UX next           UX-13 cleanup (legacy CSS, AdminPage legacy prop) + full recette
```

## S7.1 — closed 2026-10-23

Validated by Fred (PostgreSQL 542/542 after `bb3ba76`, browser/mobile/keyboard and DBeaver green). Full evidence: `exploration-cache/tasks/sprint-7.md` § S7.1 execution and closure.

## Sprint 6 objective

Build the authoritative V1 Core finance flow while keeping financial state independent from subscription lifecycle.

## Sprint 6 execution order

1. S6.1 — Financial ledger: payment plans, installments, confirmed payment events and allocations — CLOSED, Fred validated 2026-10-22.
2. S6.2 — Versioned quotes, secure customer acceptance and subscription synchronization — CLOSED, Fred validated 2026-10-22; implementation commit `9fe7e1b`.
3. S6.3 — Customer payment-proof upload and structured coach review workflow — CLOSED, Fred validated 2026-10-22; implementation commit `8edebc7`.
4. S6.4 — Sequential payment receipts and secure sharing preparation — CLOSED; Fred validated 2026-10-23; implementation commit `a38901a`.

Execution source: `exploration-cache/tasks/sprint-6.md`. S6.1 implementation commit `1050fcb` is locally validated end-to-end by Fred, including browser and DBeaver Gate 2. S6.1 is closed. Fred's pasted S6.2 request explicitly approves implementation on main; the connected backlog confirms Gate 1. The detailed request is appended to the local sprint spec.

### S6.4 execution evidence — 2026-10-22

- Fred's detailed S6.4 request authorizes implementation on main and independent Reviewer then QA. Request appended to sprint-6.md. Clean tree at entry; baseline typecheck passed. S6.3 is validated/closed; no Sprint 7 work.
- Relevant API-contract/database-safety/security skills inspected. Existing finance/quotes/proofs/private-document infrastructure traced. Notion Concurrent Sequential Numbering, Historical Business Snapshot, Business Document PDF Generation, Secure External Document Sharing, Hard Commit Point and Atomic Business Operation mechanisms inspected; reuse with explicit issuance and immutable evidence.
- Approved read-only preflight:receipts passed against root .env guarded localhost:5433/kfit_dev: zero receipts, duplicate/invalid references, receipt artifacts/counters/tokens. No backfill required. Fred approved generation and application of 0012_spooky_spiral.sql: required snapshot/PDF, RESTRICT document FK, unique payment and void-reason consistency only. Generated SQL inspected; migration applied against verified server .env localhost:5433/kfit_dev. Sandbox EPERM blocked the first generator subprocess; approved generation retried outside sandbox. Preserve snapshots/numbering/PDFs/void evidence before any rollback after use. No dependencies/lockfile changes.
- Historical balance rule: sum authoritative confirmed history strictly before the source confirmation plus that source payment, never today's remaining balance. If multiple events share the source confirmation timestamp, reject issuance as RECEIPT_ISSUE_CONFLICT because the existing ledger cannot establish true order. Snapshot records confirmed-position-v1; current correction state remains separate. This conservative deterministic rule follows the detailed spec's historical-reconstruction requirement; regression coverage required.
- Metadata does not consume tokens; successful PDF reads consume one use, following the existing document convention (default three uses, explicit bounded maxUses). Receipt-owned immutable versions cannot mutate/share through generic document routes.
- Shared contracts, receipt repository/service/controller/nine routes and deterministic French PDF renderer implemented. Read-only S6.1 transaction entry reuses authoritative finance validation/current correction state without changing payment mutations. Same finance lock order protects issue/correction; void locks receipt first, then finance scope. No automatic receipt issuance in manual payment/proof confirmation. First unit/HTTP run passed 470 server + 55 shared including real Chromium PDF determinism. New PostgreSQL fixtures initially exposed a concrete Buffer return type mismatch before DB execution; corrected adapter copies bytes to an owned Buffer. Final compilation/unit rerun pending; no PostgreSQL invocation yet.
- Subsequent compilation/unit run passed 470/470 server + 55/55 shared. Added 33 server unit/HTTP and 2 shared tests. Approved PostgreSQL invocation on 2026-10-23 passed 507/507, zero failures/skips, including 40 receipt cases: unique same/different-payment issuance, counter/render/scan/storage/audit rollback, immutable identity/PDF/snapshot, historical prefix and ambiguous-timestamp rejection, token limits, correction/void races, private document ownership and lifecycle independence. PostgreSQL artifacts are deterministic test adapters, not a claim of real antivirus/render/storage in that suite.
- Separately approved real preflight:pdf passed (PDF signature/size, four-page output, local French/branding assets); preflight:files passed (private storage, SHA/size/signature/opaque naming, clean ClamAV OK, EICAR FOUND, temporary cleanup). Endpoints/env verified local before execution. These do not substitute for combined browser-to-receipt-renderer/ClamAV/storage/DB acceptance.
- French Finance integration includes issue buttons/receipt links on payment_received history rows, Reçus section, private PDF download, temporary share/revoke and eligible-only explicit void with private reason. Public /recu/:token shows frozen payment facts and current correction state, prominent ANNULÉ for voided receipts, original historical PDF download. Existing components, responsive classes and focus patterns reused; no redesign/dependencies.
- Final all-package typecheck and db:check passed; production build and static diff inspection complete before review handoff. Independent Reviewer then QA are required by the approved S6.4 execution order. Browser tooling unavailable: live/mobile/keyboard/console/network checks remain NOT VALIDATED until Fred/QA can execute them. No human acceptance, validated changelog, commit/push, Sprint 6 closure or Sprint 7 work.
- Independent Reviewer on 2026-10-23 initially requested one MINOR fix: PDF error responses were Blobs and bypassed typed French messages. Receipt-only API rejection handling now decodes bounded JSON with a non-null/string-error shape guard; malformed payloads fall back safely and successful binaries are unchanged. Re-review returned REVIEW PASSED WITH NOTES, no unresolved BLOCKER/MAJOR/MINOR. Reviewer inspected actual tracked/untracked code, schema/generated SQL, consumers and assertions/logs; git diff --check passed. No DB/preflight rerun or human acceptance claimed. Browser/mobile/keyboard, focus after successful issuance and combined real render/scan/storage/download remain QA/Fred checks. Workflow advanced to AWAITING_QA.
- Independent QA on 2026-10-23 returned QA PASSED WITH LIMITATIONS, no confirmed feature failure/regression. Fresh all-workspace typecheck passed; fresh npm test passed 470/470 server + 55/55 shared, zero failures/skips; fresh git diff --check passed with existing LF-to-CRLF advisories. QA mapped all 14 shared/unit/HTTP and 31 PostgreSQL criteria to actual assertions and the prior 507/507 PostgreSQL log (40 receipt cases), distinguishing inspected evidence from fresh executions. Prior build/schema/real PDF/files preflights inspected, not rerun. No source/test/doc edits, dev servers or DB/preflight/container/seed commands by QA. Browser tools unavailable: live forms/downloads, mobile/keyboard/focus after issuance, console/network and combined renderer/ClamAV/storage/DB path remain NOT VALIDATED. State is AWAITING_HUMAN_VALIDATION; no Fred acceptance, validated changelog, commit/push, Sprint 6 closure or Sprint 7 claimed.

- Fred subsequently confirmed browser and database checks "all green" on 2026-10-23 and explicitly authorized commit/push. S6.4 Gate 2 is accepted on developer-reported evidence, separate from the agent command counts above. No additional per-check runtime claims are invented. Sprint 6 closure and Sprint 7 implementation remain separately gated.
- Gate 3 implementation committed as `a38901a` — `feat(receipts): add sequential receipts and secure sharing`. S6.4 is closed after Fred validation; this documentation update records the implementation hash. Publication is explicitly authorized. This closes only S6.4, not Sprint 6; no Sprint 7 work is authorized.

### S6.3 execution evidence — 2026-10-22

- Fred authorized the detailed pasted S6.3 request on main; appended it to `exploration-cache/tasks/sprint-6.md`. S6.4 remains out of scope. Baseline typecheck passed; tree was clean before this slice.
- Relevant API/database/security/frontend skills and reusable Payment Event and Allocation, Atomic Business Operation, Hard Commit Point and Secure External Document Sharing invariants inspected. Evidence remains separate from money; proof confirmation will reuse S6.1 within one transaction, not copy FIFO logic.
- Approved read-only `preflight:payment-proofs` passed using root `.env` guarded localhost:5433/kfit_dev: zero proofs/documents/upload tokens, invalid references or branched lineages. No backfill needed.
- Fred clarified full confirmation must exactly equal the claimed amount; partial confirmation must be positive and strictly lower. Shared contracts and schema checks reflect that rule.
- Fred approved generation and application of `0011_motionless_molly_hayes.sql`; generated SQL inspected and applied successfully against verified server `.env` localhost:5433/kfit_dev. Nine proof fields, three RESTRICT FKs, replacement uniqueness and consistency checks only; no backfill. Preserve claims/files/reviews/payment linkage before any rollback after use.
- Shared contracts, repository/service/controller/protected routes and internal transaction-scoped S6.1 reuse implemented. Manual finance mutation body is unchanged behind the extracted transaction entry point. No duplicated FIFO path or nested finance commit.
- Unit/HTTP/shared validation passed: 437/437 server and 53/53 shared. Added 37 server unit/HTTP, 2 shared and 39 PostgreSQL cases. No existing S6.1/S6.2 test was weakened.
- Approved PostgreSQL invocation passed 467/467, zero failures/skips, against verified server `.env` localhost:5433/kfit_dev. Includes double-review and manual-payment-versus-proof-confirmation races, FIFO, physical-file SHA/size, immutable correction lineage, evidence-only upload and audit-failure rollbacks. Fixtures use physical temporary storage and a synthetic local scanner protocol endpoint; these do not claim real antivirus detection.
- Separately approved `npm run preflight:files` passed with the server `.env`/default scanner endpoint verified local: clean file OK, real EICAR signature FOUND, private storage/SHA/size/signature/random naming and temporary purge verified.
- French admin Finance section and public `/justificatif/:token` page implemented with existing components. Customer claims travel in a bounded URI-encoded JSON header alongside raw file bytes. Admin review explicitly captures authoritative facts, separates private notes/customer messages, and refreshes server finance/proof data. Link creation/revocation, correction links, lineage, private download and exact pending-review success message included. No public proof download.
- Final typecheck (all three packages), production build and db:check passed; tracked whitespace check passed. Existing Vite main-chunk-size warning remains. No dependencies/lockfile changes. Implementer static inspection found no remaining blocker; this is not an independent Reviewer/QA verdict or Fred acceptance. No S6.3 validated changelog entry, commit or push.
- Fred requested sequential independent Reviewer then QA. Reviewer returned REVIEW PASSED WITH NOTES on 2026-10-22 after inspecting actual tracked/untracked code, generated SQL/schema, consumers, tests and logs; no confirmed BLOCKER/MAJOR/MINOR findings. Reviewer ran git diff --check successfully; prior 437 server + 53 shared and 467 PostgreSQL results were inspected, not rerun. Coverage note: expiry is rechecked after proof/subscription locks, but no proof-specific expiry-during-lock-wait regression exists. Live browser/mobile/keyboard and combined UI-to-real-scanner/storage/DB flow remain NOT VALIDATED. Entry state advanced to AWAITING_QA; no files modified by Reviewer.
- Independent QA then returned QA PASSED WITH LIMITATIONS on 2026-10-22. Fresh QA npm test passed 437/437 server + 53/53 shared; fresh git diff --check passed with existing LF-to-CRLF advisories. QA mapped all 12 unit/HTTP and 28 PostgreSQL acceptance criteria to actual assertions; inspected prior 467/467 database log (39 new proof cases), typecheck/build/schema and real files-preflight evidence without rerunning those commands. No confirmed feature failure/regression; no source/test/doc edits or servers started by QA. No new database/preflight/container/seed commands were run. Browser tools unavailable: live upload/download/forms, mobile/keyboard/focus/console/network and combined browser-to-real-scanner/storage/DB remain NOT VALIDATED. Reviewer coverage note retained. State is AWAITING_HUMAN_VALIDATION; Fred Gate 2, validated changelog, commit/push and S6.4 remain gated.

- Fred subsequently confirmed "all green", explicitly including browser and DBeaver, on 2026-10-22 and authorized commit/push. Gate 2 is accepted on developer-reported evidence; agent counts remain separately recorded above. No additional runtime assertions or coverage are invented. The expiry-during-lock-wait test gap remains documented. S6.4 implementation requires separate authorization.
- Gate 3 implementation committed as `8edebc7` — `feat(payment-proofs): add secure upload and coach review`. S6.3 is closed after Fred's validation; this documentation update records the implementation hash. Push is explicitly authorized and pending publication. No S6.4 implementation is authorized.

### S6.2 execution evidence — 2026-10-22

- Clean tree at start; baseline typecheck passed. Reusing existing quote/document/token tables, private scanned storage and PDF infrastructure; no dependencies or lockfile changes planned.
- Approved read-only quotes preflight passed using root `.env`, guarded localhost:5433/kfit_dev: zero quotes, quote versions, quote tokens or invalid references. No backfill needed.
- Fred approved generation and local application of `0010_productive_post.sql`. Generated SQL was inspected: nullable draft numbers, validity/change-response timestamps, current/PDF/accepted-version RESTRICT FKs and annual counter table/partition uniqueness only. Migration applied to verified server `.env` localhost:5433/kfit_dev. Rollback after use must preserve number allocation, responses, PDFs and synchronization references.
- Shared quote contracts and 14 named admin/public routes implemented. Admin routes enforce admin auth and existing origin/CSRF; public routes enforce rate limiting, scoped hash-only tokens and origin checks.
- Issuance locks quote/version and annual counter; renders/scans/stores immutable quote PDF within issuance transaction; failures roll back number/version/document/audit and compensate the finalized file. Quote-owned PDFs cannot be changed through personalized-document routes.
- Public responses never mutate subscriptions. Coach synchronization locks the subscription before quote/version and rejects different-price synchronization when any committed plan or allocation exists; same-price linkage preserves ledger facts. No service/variant/component/duration/status updates.
- French Devis profile tab and `/devis/:token` customer page implemented using existing components. Response requires confirmation; PDF/metadata reads do not accept or consume the response token. Issued historical PDFs download from stored artifacts.
- Agent checks: typecheck passed; unit/HTTP/shared 400/400 server and 51/51 shared passed, including real Chromium identical-snapshot PDF hash determinism; production build passed; schema check passed; whitespace diff check passed. Approved final PostgreSQL run passed 428/428 including 34 quote cases. Earlier 422/423 run hit the known unchanged Sprint 3 concurrency failure; its approved retry passed 423/423. That test was not changed.
- Implementer static review found no remaining blockers after correcting public failure-audit paths. This is not an independent Reviewer/QA verdict. S6.2 is AWAITING_REVIEW, with no human acceptance or validated changelog entry claimed. Existing Vite main-chunk-size warning remains; no dependency/lockfile changes.
- Independent Reviewer completed Fred's requested review on 2026-10-22: REVIEW PASSED WITH NOTES, no confirmed BLOCKER/MAJOR/MINOR defects; actual tracked/untracked code, migration, contracts and consumers inspected; reviewer `git diff --check` passed. Prior automated counts were inspected as evidence, not rerun. State advanced to AWAITING_QA; no human acceptance claimed.
- Reviewer notes: integration tests cover synchronization against existing real payments/allocations but do not directly race synchronization against finance creation/payment; subscription lock ordering appears correct by inspection. Issuance holds quote/annual-counter locks through render/scan/storage as designed; real end-to-end scan/storage and browser/mobile/keyboard remain unvalidated by review.
- Fred requested `.github/agents/qa.agent.md`; independent QA entry gate passed and returned QA PASSED WITH LIMITATIONS on 2026-10-22. Fresh QA `npm test` passed 400 server + 51 shared (including real Chromium PDF determinism); fresh `git diff --check` passed. No feature failure/regression confirmed, no production/test/doc edits by QA, no new servers or DB commands. Prior typecheck/build/schema and PostgreSQL 428/428 (34 quote cases) were inspected, not rerun by QA.
- QA mapped all 12 shared/unit/HTTP and 20 PostgreSQL criteria to actual assertions. Invalid lifecycle/issued immutability/sync-conflict policy are primarily established through prior PostgreSQL evidence. Live browser/mobile/keyboard, real Chromium-to-ClamAV-to-private-storage issuance and human DB acceptance remain NOT VALIDATED; no browser tools exposed. The direct synchronization-versus-finance race has no dedicated runtime regression; static subscription-lock evidence does not claim one.
- Fred subsequently confirmed "all green" for the presented Gate 2 checklist on 2026-10-22. S6.2 is VALIDATED: developer-reported local commands, browser/mobile/keyboard, scan/storage and DBeaver acceptance are recorded separately from agent evidence. No new per-command counts or direct synchronization-versus-finance race regression are claimed. Await explicit commit instruction; no commit/push or S6.3 work authorized by this acceptance.
- Fred subsequently instructed "commit and push" on 2026-10-22, explicitly authorizing Gate 3 and publication of the validated S6.2 changes to main. S6.3 remains outside this authorization.
- Implementation committed as `9fe7e1b` — `feat(quotes): add versioned quotes and secure acceptance`. S6.2 is closed after Fred validation and Gate 3; this documentation update records the implementation hash. S6.3 remains unstarted and requires separate approval.
- S6.2 local validation is complete: Fred confirmed browser/mobile/keyboard, scan/storage issuance and DBeaver acceptance green. Implementation `9fe7e1b` and validated closure are pushed. S6.3 planning may begin; implementation remains gated.

## Sprint 5 objective

Build the authoritative subscription/coaching delivery lifecycle after the validated Sprint 4 onboarding foundation.

## Sprint 5 execution order

1. S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution — CLOSED, Fred validated 2026-10-21.
2. S5.2 — Appointment scheduling, confirmation links, cancellation policy and history — CLOSED, Fred validated 2026-10-21.
3. S5.3 — Structured follow-ups, overdue detection and configurable follow-up cadence — CLOSED, Fred validated 2026-10-21.
4. S5.4 — Progress measurements, structured goals and coach-confirmed status suggestions — CLOSED, Fred validated 2026-10-21.
5. S5.5 — Personalized document versioning and secure temporary delivery links — CLOSED, Fred validated 2026-10-22.

S5.1–S5.5 are locally validated and Sprint 5 is closed. S6.1 is closed; S6.2 is active under its approved scope.

## Blockers

### S5.5 Gate 2 corrective evidence — 2026-10-22 (agent-run)

- Missing Documents navigation: the profile already mounted the lazy panel, but `profileTabs` omitted `documents`, hiding its trigger and rejecting its URL selection. Added the existing tab and an explicit no-subscription empty state; preserved selected-subscription binding.
- Browser-flow corrections: allow choosing an existing version for a delivery link; remove the duplicate public download button after verification. No server contracts or business rules changed.
- Fred approved a synthetic local photo-consent/customer/subscription/measurement fixture for positive photo QA; it remains available for inspection. Its definition is marked synthetic and is not production legal text.
- Fred approved the S5.5 integration-fixture exception: derive consent versions above existing definitions instead of assuming a hard-coded version is latest. Assertions remain unchanged.
- Local Chromium: 17 document/security/photo/mobile/keyboard/persistence checks passed; separate Aperçu/Progression/Analyse/Documents smoke passed. No uncaught page errors. Final persisted scenario verified 3 documents, 4 versions/files, 8 tokens, 1 photo linkage and 19 structural audits; file sizes and SHA-256 matched storage. Security edge cases were exercised through live HTTP; normal document, summary and photo operations through the UI.
- Agent regression evidence: typecheck passed; server 332/332 and shared 47/47; real PostgreSQL 348/348; files/ClamAV and PDF preflights passed; diff check passed. Temporary QA servers are no longer listening. Browser harness reports are under ignored `tmp/`.
- Fred confirmed the browser flow operational and authorized pushing the corrective changes on 2026-10-22.
- Fred confirmed DBeaver and private-storage acceptance green on 2026-10-22. S5.5 Gate 2 is closed and Sprint 5 is validated.

Before production:
- Legal validation for the applicable Gabon context.
- True encrypted off-server backup destination.
- Device-OTP login + trusted device per the Sprint 1 auth contract (today `/auth/login` issues a session on any device).

## Environment constraints

- Docker PostgreSQL: localhost:5433; native PostgreSQL: 5432.
- Remote/chat runtimes do not run project commands; only Fred's local execution closes validation gates.

## Handoff

```text
Branch            main
Sprint            7
Slice             S7.1
Workflow state    CLOSED
Validated         Sprint 6 closed; S7.1 accepted by Fred on 2026-10-23
Approved goal     Historical dashboard analytics and derived alerts; approved prospective cadence-history amendment
Done              Migration 0013, prospective two-row initialization, atomic cadence writers, analytics/alerts, French UX-9c, Reviewer and QA
Implementation    ed1c7d0
Pending           Separate S7.2 Gate 1; existing integration-order investigation and recorded runtime coverage limits
Validation        typecheck/build/schema/diff passed; server 523/523, shared 56/56; PostgreSQL 541/542, all 35 new cases passed
Acceptance        sprint-7.md S7.1 Gate 1 and cadence-history amendment; Fred's cumulative-funnel decision
Files/layers      shared/dashboard; server/dashboard/cadence/schema/seed/finance read model; client/TodayPage/charts/API/proxy
Human acceptance  Fred confirmed "All green" and authorized docs/commit/push
Rules             No invented legacy cadence, gap/null semantics, owner finance truth, cumulative cohort, admin GET-only endpoints
Risks             Existing payment-proof ordering assertion still fails; actual catalogue-seed concurrency not runtime-tested
Not validated     No agent browser/mobile/keyboard run; no separately observed human per-check counts
Assumptions       No new business rule; accepted limitations remain documented
Next action       Await a separately approved S7.2 plan; publication is authorized
UI state          UX-9c accepted; UX-10 local validation remains separately pending
Out of scope      S7.2 notifications/email, retention, backup/hardening, Sprint 8/V1.1 and deployment
```

### S6.4 Fred Gate 2 checklist (after Reviewer and QA)

1. Verify server .env targets localhost:5433/kfit_dev and the scanner endpoint is local. From root run npm run typecheck, npm test, npm run build, npm run db:check, npm run test:integration, npm run preflight:pdf and npm run preflight:files. Current agent counts: 470 server, 55 shared, 507 PostgreSQL. Migration 0012_spooky_spiral.sql is already applied locally; no reset/reapplication requested. Agent ask-tier reruns still need new per-invocation approval.
2. In an existing synthetic subscription Finance area, record a confirmed payment if needed. No receipt is issued automatically. Select Émettre le reçu on that payment and confirm. Expect one REC-YYYY-NNNN, one private PDF/document and frozen original payment/allocation/balance facts. Repeat the issue request: same receipt/number, no additional PDF/counter increment. No issue action for correction events.
3. Download privately; check French branding, FCFA amounts, dates in Libreville, allocation breakdown and historical balance after the source payment. Issue for an older payment after a newer one: historical balance must exclude the newer one. Changing customer profile or later finance history must not change the snapshot/original PDF.
4. Share with explicit expiry/use limit and open /recu/<token> without admin cookies. Metadata does not consume a use; each successful PDF download consumes one. Verify expiry, revocation, exhaustion, errors and rate limiting. No raw bearer in stored rows/audits or internal customer/payment IDs/references/reasons in public metadata.
5. Partially correct the source payment: receipt stays issued, current correction/effective amount changes, void denied. Fully correct it: explicitly Annuler le reçu with nonblank private reason. Number/snapshot/PDF/payment/subscription stay preserved; one void audit/transition. Valid public link shows ANNULÉ and the corrected-payment explanation while serving the original PDF. Reissue never creates another receipt.
6. DBeaver: inspect receipts, business_document_counters, documents/document_versions, payment_events/allocations, secure_access_tokens, external_access_events and audit_events for synthetic IDs. Check unique payment_event_id/receipt_number, exact customer/scope linkage, ownerType=receipt/ownerId=receipt.id/documentType=payment_receipt, clean immutable v1 with opaque key/SHA/size, transactional number/counter/audit and private voidReason. Generic metadata must exclude customer identity, external reference, bearer and reason. Subscription lifecycle must stay unchanged. Do not modify production rows or reset the database.
7. Browser: narrow/mobile widths, keyboard tab order, confirmation/cancel focus, loading/pending/error/retry states, PDF downloads, console/network and combined real receipt renderer/scanner/storage/DB path. These remain NOT VALIDATED by agent source inspection. Report Gate 2 explicitly; do not close Sprint 6 or start Sprint 7 automatically.

### S6.3 Fred Gate 2 checklist (historical)

Commands from repository root, with local PostgreSQL/ClamAV available and server `.env` verified against localhost:5433/kfit_dev:

```text
npm run typecheck
npm test
npm run build
npm run db:check
npm run test:integration
npm run preflight:files
```

Agent reruns of database/preflight commands still require a new per-invocation approval; Fred may execute his own checks. Migration `0011_motionless_molly_hayes.sql` is already applied locally; no reset/backfill/reapplication is requested.

- Browser: open a subscription's Finance area, create a link with explicit expiry, and open it without admin cookies. Verify claimed amount/method/date/reference, accepted formats and the mobile file selector. Successful upload must say “Justificatif envoyé. Il sera vérifié par votre coach.”; no payment/balance/lifecycle change yet.
- Review: download the private proof, explicitly confirm full or partial payment facts, and verify the resulting exact payment reference/FIFO in Finance. Reject/duplicate/correction must create no money. Try an overpayment and repeated/concurrent review; failures must leave evidence and balances consistent. Keyboard focus, dialogs, disabled in-flight controls, error recovery and narrow screens require live checks.
- Correction: add distinct private reviewNote/customerMessage; create a correction link and verify only customerMessage appears publicly. Submit a different file; verify new proof/document and supersedesProofId, old proof superseded with original claims/review/file intact. Same-lineage identical file must reject without consuming the link. Expired/revoked/used links must reject safely. No public proof-file download is available.
- DBeaver/storage: inspect synthetic/manual test rows only. Check token hashes (no bearer), maxUses/useCount, scoped subscription/context; proof/document ownerType=payment_proof and ownerId=proof.id; scanned clean version SHA/size against physical private file. Confirm pending/negative proof payment_event_id is null, confirmed proof links the exact event/allocations, and subscription lifecycle stays unchanged. Check external access events and structural audits exclude references, notes, messages, filenames and bearer. Later S6.1 payment correction must retain proof evidence.
- Reviewer should inspect the finance transaction extraction, deterministic lock order, audit rollback, file compensation and separation from generic document-sharing routes. QA should map spec criteria to actual assertions and report live UI checks as NOT VALIDATED until executed. S6.3 remains open until Fred accepts Gate 2.

### Refonte UI handoff (Track B)

```text
Branch            main (Track B runs beside Sprint 7; S7.2 owns the admin shell/header until it lands)
Step              UX-14c delivered (questionnaire answers: audited, fresh OTP, health consent check); UX-13 next
Workflow state    AWAITING_HUMAN_VALIDATION (UX-9d, UX-10) · PLANNING (boards)
Validation done   UX-9d: client tsc + build, browser pass desktop + 390 px on scratch data
Not validated     Fred local check of UX-9d and UX-10 (Mailpit)
Pending decisions Alerts vs À traiter duplication; « ton/ta coach » wording; currency label (Refonte UI § Open decisions)
Risks             Any edit to AdminLayout/header conflicts with S7.2 until it is merged
Next action       Fred: apply UX-14c (server then client), run server tests + questionnaire integration, view one revision with the e-mailed code (Mailpit); Claude: UX-13
```

## Refonte UI — suivi

> Goal: rebuild the admin and public screens to the validated mockups without changing business logic.
> Mockups: canvas « K'FIT — Refonte UI » (boards 01–11). Plan: Notion « 🎨 K'FIT - Refonte UI · Plan d'implémentation ». Backlog: Notion « K'FIT — Development Backlog » (UX-* and [API·UX] items).

### Process (agreed)

1. Check repo state on `main` before each step (repo = source of truth).
2. Read current code + board; list API gaps; any business rule → short numbered list for Fred (yes/no) before code.
3. API additions allowed only when read-only or presentation-level; business rules untouched. Every gap goes to the Notion backlog; anything needing another sprint is deferred there.
4. Deliver one `.diff` per step (`git diff --cached --binary`, checked with `git apply --check` on a fresh `origin/main` worktree) + commit message. **Fred applies and pushes; Claude never commits/pushes.**
5. Checks per step: client `tsc --noEmit`, client build, server tsc + unit tests, shared tests, browser check desktop + 390 px when the dev env is up.
6. After push: update this section, `changelog.md`, Notion backlog status.

UI conventions: French UI, explicit business rules, one primary action per view, charts only for a tracked indicator, no invented data in placeholders.

### Status

| Step | Board | Scope | API added (read-only) | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| UX-1 | 01 | Foundation: Tailwind v4, shadcn primitives, tokens, status map; legacy CSS isolated | — | Done | 88235de |
| UX-2 | 01 | Admin shell, React Router routes, sidebar, mobile nav | — | Done | 141175f |
| UX-3 | 01b | Data kit: DataTable, read-only tables, charts (KPI tile, sparkline, bars, stacked) | — | Done | c2d4497 |
| UX-4a | 03 | Client profile shell | `GET /admin/customers/:id` | Done | 477650a |
| UX-4b | 03, 08 | Profile Aperçu + Progression | — | Done | f92e7cb |
| UX-4c | 03b | Profile Analyse tab | `GET /admin/customers/:id/analytics` | Done | 972dc22 |
| UX-5 | 04 | Clients list + creation | `GET /admin/customers/overview` | Done | b8a1135 |
| UX-6 | 05 | Requests queue + detail | — | Done | f21120f |
| UX-7 | 06 | Catalogue + capacity | `GET /admin/catalogue/services/overview` | Done | 86362d5 |
| UX-8 | 07 | Questionnaires (families, versions, editor) | — | Done | 309294d |
| UX-9 | 02 | Aujourd'hui dashboard; `/admin` opens it; business time zone | `GET /admin/today`, `GET /admin/appointments` | Done | a122ccd |
| UX-9b | 02 | Layout aligned to mockup; requests chart placeholder | — | Done | 8a4e435 |
| UX-9c | 02 | Weekly requests chart + conversion, KPI sparklines/deltas, finance summary, operational alerts (built in S7.1) | `GET /admin/dashboard/*` (S7.1) | Done — first-name greeting still open | ed1c7d0 |
| UX-9d | 02 | Fidelity fixes: board 02 order (À traiter under the charts), 8-week default, segmented period switch, header wording, compact funnel, « Stable » deltas, XAF, business-date label, task list capped at 8 | — | Pushed — awaiting Fred check | 1d3a476 |
| UX-9e | 02 | Alerts on Aujourd'hui limited to payments and quotes (no duplicate of À traiter) | — | Pushed | 6ca2a2f |
| UX-10 | 09 | Connexion, Mot de passe oublié, Initialisation, password meter; recovery service bound in `dev-app.ts` (SMTP) | none (existing `/auth/recovery/*`) | Pushed — awaiting Fred local validation | e0ae7f1 |
| UX-11 | 10, 11a | Landing `/` (offers from the public catalogue, family filter, plans, steps, FAQ, CTA) + request page `/demande/:offre`; intake rules unchanged; legacy wrapper removed | — | Delivered — awaiting push; prod blocked by coach onboarding (name/logo/photo) + legal pages | — |
| UX-12a | 11e–h | Shared public shell (`components/public/PublicShell.tsx`, one no-referrer hook) + /document, /devis, /recu, /justificatif restyled; logic unchanged | — | Pushed | 4288d46 |
| UX-12b | 11b–d | /questionnaire (one question per screen, health consent step), /consent, /appointment on the public shell; customer-only forms, coach forms untouched (UX-14); appointment times in Libreville; legacy wrapper removed | — | Pushed | 57e5613 |
| UX-14 | 14a–14e | Legacy admin tabs: Rendez-vous, Suivis, Préparation, Santé et consentements + Suivis page. 14a (diff 1): Rendez-vous tab (Libreville times, schedule sheet with duration suggestion + auto response link, action dialogs), Suivis tab (open actions, history, « rythme » card, record sheet), Suivis page (table, filters, opens the form via `nouveau=suivi`) | — | 14a pushed (56f8454); 14b delivered — awaiting push (Préparation: banner + progress, checklist, waiver dialog, reservation; Santé: consents, links, coach capture sheet, questionnaire links + coach entry sheet; last legacy admin panels removed); 14c: GET …/questionnaire/revisions/:submissionId (fresh sensitive-action OTP, `questionnaire.answers_viewed` audit with ids only, health answers refused once « Données de santé » is withdrawn) + « Voir les réponses » with e-mail code step-up — delivered | — |
| UX-15 | 15a–15d | Screens added in S5.5/S6 without a board. 15a: Finance + Devis tabs merged into « Paiements » (summary, proof banner, échéancier « n sur N », payments with receipt column + ⋯, quote card + side sheet, proofs history) + proof review dialog (preview, size, scan, 5 decisions). 15b: Documents tab (versioned list, Partager → link + separate code for sensitive docs, ⋯ add version / download / versions and links / archive / revoke with confirmation, private photos card) | — | 15a pushed (27042a1); 15b delivered — awaiting push | — |
| UX-16 | 12, 12b, 12c | S7.2 notification centre (bell panel, mobile sheet, Réglages) — board only, implemented inside S7.2 | — | Boards validated 2026-10-23 → S7.2 implementer (`sprint-7.md` § S7.2 UI) | — |
| UX-13 | — | Cleanup: legacy CSS removal, a11y, reduced motion, mobile pass, full UI recette | — | To do (last) | — |

### Locked decisions (2026-10-22)

- Business time zone **Africa/Libreville (UTC+1)** for today, week (Monday start), appointment display and datetime inputs — `@kfit/shared` `time/business-time.ts`, client `lib/format.ts`.
- Client status derived in one place: `@kfit/shared` `customers/client-status.ts`.
- Capacity limit below occupied places → warn, don't block. Occupancy = S4 capacity-claim rule.
- Analytics rules (attendance, cadence, pace, responsiveness) validated in UX-4c.
- Aujourd'hui « À traiter » order: follow-ups overdue → due → new requests → request follow-ups → preparation expired → ready → waiting → completion due. KPIs show current values only until Sprint 7.
- Slug frozen after publication (UI). CSV export out of V1 (V1.1, compliance).

### Open decisions (Fred)

- [x] UX-10 scope: client-only, device OTP deferred (Fred 2026-10-22, 8 rules validated).
- [x] Currency display: FCFA on customer pages, XAF in admin (Fred 2026-10-23).
- [x] UX-11 rules (Fred 2026-10-23): WhatsApp free entry (no auto +241); start « Dès que possible » / date; links from env, legal links hidden; text-only brand + « ta coach »; 4 FAQ answers approved.
- [x] UX-15 rules (Fred 2026-10-23): Finance + Devis merged into « Paiements »; proof review with inline preview, size and scan result; instalments « n sur N », payments linked to « échéance N ». Old `onglet=finance|devis` links open « Paiements » (client alias, server deep links unchanged).
- [x] UX-14 rules (Fred 2026-10-23): add « Voir les réponses » (needs a read-only API, UX-14c); the coach types start and end, with a duration suggestion (1 h by default); the appointment response link is created at scheduling and expires at the start; « Enregistrer le suivi » opens the form directly; wording « rythme » / « Revenir au rythme du service ».
- [x] UX-14c rules (Fred 2026-10-23): viewing questionnaire answers is written to the audit log, requires a fresh OTP, and is refused once the client has withdrawn « Données de santé ».
- [ ] UX-15a: keep the proof confirm form pre-filled with the client's declaration (current) or require re-typing? — unanswered.
- [ ] Multi-subscription progress: exclude measurements taken without health consent?
- [ ] Client test framework (Vitest + Testing Library)?
- [x] Funnel counting rules: cumulative reach (Fred, S7.1).
- [x] Aujourd'hui shows only the alerts « À traiter » does not list (unpaid installments, payment proofs, quotes), as « Paiements et devis à suivre »; the S7.2 notification centre keeps the full set (Fred 2026-10-23, UX-9e).
- [ ] Customer wording: public pages say « ton coach » — deferred, will use the coach's real name later (Fred 2026-10-23); settle in the UX-12 board.

### Risks / pre-prod items

- **Auth contract gap (compliance):** Sprint 1 contract requires OTP on unknown devices before a session is issued; `/auth/login` always issues one. Pre-prod blocker until the device-OTP server slice ships.
- **Recovery and sensitive-action OTP need SMTP:** `/auth/recovery/*` and `POST /auth/otp/sensitive-action` answer 501 unless `SMTP_HOST`/`SMTP_FROM` are set; staging/prod env must define them (UI then shows « Récupération indisponible » / « Envoi du code indisponible »). A failed send answers 503 (`AUTH_OTP_DELIVERY_FAILED`) and supersedes any earlier sensitive-action code.
- **Prod reverse proxy:** if it lists API paths, add `/admin/today` and `/admin/appointments` (Vite dev proxy done).
- **Brand assets:** coach name, logo and photo will come from a coach onboarding (Fred 2026-10-23, Notion backlog). Until then the public pages say « ta coach » and use the text mark; UX-11 is not production-ready without it.
- **Public commitments to confirm with the coach:** « Réponse sous 24 h » (board 10 hero) and the FAQ health answer (check against the privacy notice during legal validation).
- **Public contact links:** `VITE_PUBLIC_WHATSAPP` / `VITE_PUBLIC_INSTAGRAM` must be set at build time for staging/prod, else the WhatsApp/Instagram buttons are hidden.
- Legacy screens still format dates in the device time zone → migrate to `lib/format.ts` during UX-10…13.
- **Docs hygiene:** closed S5/S6 briefs are still in this file (~1,400 lines); archive them to `exploration-cache/tasks/completed/` per WORKFLOW.
- Server `npm test` glob runs only 4 tests → run `node --test $(find dist -name "*.test.js")` (Fred to fix the script).

### Sprint 7 needs for mockup fidelity (board 02 — Aujourd'hui) — delivered by S7.1 except the first name

> Notion: UX-9c, [API·UX] Séries temporelles, Endpoint agrégé des KPI, Statistiques de l'entonnoir, Prénom dans la session.

- [x] **Weekly requests chart** — requests received per business week (Mon–Sun, Africa/Libreville); periods 4 sem. / 8 sem. / 12 mois (monthly buckets for 12 mois); current week highlighted; tooltip `N demandes · 6–12 oct.`. Replaces the « Historique disponible au Sprint 7 » card.
- [x] **Conversion rate** in that chart's header (`47 sur 8 semaines · taux de conversion 38 %`) — depends on funnel counting rules.
- [x] **KPI sparklines** — 8 weekly points for: clientes actives (end-of-week value), suivis en retard (end-of-week value), nouvelles demandes, séances réalisées. `KpiTile` already takes `trend` + `trendLabel`.
- [x] **KPI delta vs previous period** (`+12 % vs période précédente`) — define the reference period and the favourable direction per KPI (fewer overdue follow-ups = good). `KpiTile` already takes `delta`.
- [ ] **Greeting with first name** (`Bonjour Konny`) — `/auth/session` returns id + role only; needs a display name on the user (small migration).
- [x] Section order matches the mockup (UX-9b).

### Other deferred items from the redesign (Notion backlog)

- Analyse tab still splits days/weeks in UTC → Libreville (V1.1).
- Manual request endpoint (`POST /admin/requests`), readable sequential references (SUB-0042), questionnaire draft update/retire, service family field, duplicate-request signal, admin subscriptions list, server-side pagination.
- Device-OTP login + trusted device (server slice + board 09 OTP screen).

## S5.1 Gate 2 corrective note — questionnaire policy consistency

Status: IMPLEMENTED, awaiting Fred local validation.

Gate 2 finding:
- questionnaire assignment resolution already used per-field variant -> service fallback;
- onboarding still used the older whole-row variant override;
- this could make Questionnaire and Onboarding disagree about whether a questionnaire is required.

Correction:
- onboarding questionnaire requirement now uses the same per-field fallback as questionnaire assignment;
- unit and PostgreSQL integration expectations updated accordingly;
- no lifecycle, finance, questionnaire submission or consent semantics changed.

Local fixture note:
- subscriptions that reached ready_to_start before a questionnaire was later assigned are historical/stale fixtures for that newer policy;
- do not mutate such rows with ad-hoc SQL to force the new checklist;
- validate the health-questionnaire path with a subscription initialized after the assignment, or clear the assignment when testing the older ready subscription.

Health test prerequisite:
- current development seed provisions synthetic published service_terms, privacy_notice and health_data consent definitions.


## S5.1 — validation closure

Validated locally by Fred on 2026-10-21.

Agent baseline before final Gate 2 correction:
- server unit tests: 231 passed;
- shared tests: 35 passed;
- PostgreSQL integration: 177/177, including 44 lifecycle cases;
- typecheck/build/db:check/diff green;
- Reviewer passed with notes;
- QA passed with limitations.

Fred Gate 2:
- activation blocking respected authoritative onboarding requirements;
- fresh request/subscription validated correct questionnaire + health-data-consent integration;
- ready_to_start -> active validated from lifecycle page;
- pause/resume with manually chosen revised end date validated;
- completion_due flow validated;
- outstanding-component block/override validated;
- cancellation validated;
- renewal validated with one linked onboarding child;
- DBeaver lifecycle/history/pause/component/audit checks green.

Corrective Gate 2 finding:
- onboarding still used old whole-row variant policy resolution while questionnaire assignment used per-field service fallback;
- fix aligned onboarding questionnaire resolution with questionnaire module;
- fresh-request retest passed;
- stale pre-fix ready_to_start fixtures were not mutated with ad-hoc SQL.

Exact post-correction test counts were not separately reported; do not present the pre-correction counts as the final rerun counts.


## S5.2 — planning brief

Goal: implement authoritative appointment scheduling for active subscriptions, secure customer confirmation/decline/reschedule links without accounts, immutable appointment history, and transactional component consumption according to snapshotted cancellation policy.

Existing foundation:
- appointments
- appointment_events
- subscription_components
- component_events
- service_policies.late_cancel_notice_hours
- service_policies.late_cancel_consumes_component
- service_policies.missed_consumes_component
- secure_access_tokens / external_access_events

Appointment lifecycle:
- scheduled -> confirmed
- scheduled|confirmed -> reschedule_requested
- scheduled|confirmed|reschedule_requested -> rescheduled
- scheduled|confirmed -> completed
- scheduled|confirmed -> cancelled
- scheduled|confirmed -> missed
- rescheduled, completed, cancelled and missed are terminal appointment records in S5.2

Reschedule rule:
- do not overwrite the original scheduled_start/scheduled_end;
- reschedule creates a NEW appointment row linked to the prior appointment;
- old appointment becomes rescheduled;
- history preserves both original and replacement facts.

Proposed schema additions:
- appointments.rescheduled_from_appointment_id nullable self-FK RESTRICT, unique when non-null;
- appointments.late_cancel_notice_hours_snapshot nullable integer;
- appointments.late_cancel_consumes_component_snapshot boolean not null;
- appointments.missed_consumes_component_snapshot boolean not null;
- appointments.cancelled_at nullable timestamp;
- appointments.cancelled_by_type nullable text;
- appointments.response_token_issued_at optional only if needed for read model; token truth remains secure_access_tokens.

Policy snapshot timing:
- when appointment is created, resolve variant policy field-by-field with service fallback;
- snapshot late-cancel/missed policy onto appointment;
- later catalogue/service-policy edits never reinterpret an existing appointment.

Scheduling:
- subscription must be active;
- componentId optional for non-entitlement/general appointment;
- if componentId supplied, it must belong to same subscription and have remaining entitled quantity;
- scheduledEnd > scheduledStart;
- S5.2 does not implement coach-calendar overlap prevention because no multi-calendar/availability model exists yet; same-subscription duplicate exact slot is rejected as duplicate intent;
- create appointment + appointment.created event + audit atomically.

Customer response link:
- admin issues secure appointment-response token;
- scoped to one appointment and action appointment_response;
- random bearer token, hash only, explicit expiry, revocable;
- GET non-consuming;
- customer may confirm, decline/cancel, or request reschedule without account;
- successful response consumes token;
- public endpoint exposes only safe appointment facts: service label, date/time, location/channel and response choices; no unrelated customer PII;
- rate-limited and externally audited;
- no OTP in S5.2.

Confirmation:
- scheduled -> confirmed;
- customerResponseStatus -> confirmed;
- no component consumption.

Customer decline/cancel:
- response records customerResponseStatus=declined and appointment -> cancelled;
- cancellation timeliness is computed from authoritative response time vs scheduledStart using the appointment policy snapshot;
- on-time customer cancellation never consumes entitlement;
- late customer cancellation consumes one linked component only when lateCancelConsumesComponentSnapshot=true;
- if no linked component, no component mutation;
- consume at most one unit per appointment in S5.2;
- cancellation + component event/counter + appointment event + audit + token consumption are one transaction.

Coach cancellation:
- admin command;
- never consumes entitlement, regardless of policy;
- reason mandatory;
- appointment -> cancelled;
- preserves appointment history.

Missed:
- admin marks scheduled/confirmed appointment missed after scheduledStart;
- consumes one linked component only when missedConsumesComponentSnapshot=true;
- otherwise no entitlement consumption;
- cannot mark future appointment missed;
- missed + optional component consumption + events/audit atomic.

Completion:
- admin marks scheduled/confirmed appointment completed;
- scheduledEnd must have passed unless explicit early-completion override with reason is approved;
- if linked component exists, successful completion consumes one entitlement unit;
- if no remaining entitlement, reject;
- appointment.completedAt set;
- completed + component event/counter + appointment event + audit atomic.

Component consumption:
- source of truth is component_events append-only;
- subscription_components.quantity_consumed is authoritative cached counter updated in same transaction;
- event types in S5.2: appointment_completed, late_customer_cancel, missed, restoration;
- relatedAppointmentId required for appointment-driven events;
- never increment beyond quantityEntitled;
- repeated/double command must not double-consume.

Restoration:
- coach may explicitly restore one unit for a cancelled/missed/completed appointment only if that appointment previously produced a consumptive component_event;
- restoration reason mandatory;
- append restoration event and decrement quantityConsumed by one;
- does not reopen/change appointment status;
- one restoration maximum per consumed event in S5.2.

Reschedule request:
- customer secure-link command marks appointment reschedule_requested and stores no new schedule;
- optional short customer note allowed, stored on appointment.rescheduleNote but never copied to generic audit metadata;
- token consumed after successful request.

Coach reschedule:
- requires source status scheduled|confirmed|reschedule_requested;
- requires new start/end;
- creates replacement appointment with same subscription/component and SAME snapshotted cancellation policy;
- source -> rescheduled;
- source response status retained historically;
- replacement starts scheduled + pending response;
- existing response tokens for source are revoked atomically;
- new response link is a separate explicit admin issuance step;
- no component consumption on reschedule.

Lifecycle interaction:
- appointment creation only for active subscription;
- existing appointments remain readable if subscription later pauses/completion_due/completes/cancels;
- while subscription is paused or non-active, no new appointment can be scheduled or rescheduled into a replacement;
- marking an already-held appointment completed/missed/cancelled remains allowed according to appointment state even if subscription status subsequently changed, so historical delivery can be finalized;
- S5.2 does not mutate subscription lifecycle.

API proposal:
- GET /admin/subscriptions/:subscriptionId/appointments
- POST /admin/subscriptions/:subscriptionId/appointments
- GET /admin/appointments/:appointmentId
- POST /admin/appointments/:appointmentId/confirm
- POST /admin/appointments/:appointmentId/cancel
- POST /admin/appointments/:appointmentId/reschedule
- POST /admin/appointments/:appointmentId/complete
- POST /admin/appointments/:appointmentId/missed
- POST /admin/appointments/:appointmentId/restore-component
- POST /admin/appointments/:appointmentId/response-link
- GET /public/appointments/:token
- POST /public/appointments/:token

Public response input:
- confirm
- decline
- request_reschedule

Audit events:
- appointment.created
- appointment.confirmed
- appointment.cancelled
- appointment.reschedule_requested
- appointment.rescheduled
- appointment.completed
- appointment.missed
- appointment.component_restored
- appointment.response_link_created

Audit metadata: structural IDs, from/to states, actor type, lateCancellation boolean, componentConsumed boolean. Never customer note/reason/raw token.

Out of scope:
- automated reminders/notifications;
- scheduled no-show jobs;
- calendar integrations;
- coach availability/working-hours engine;
- recurring appointment generation;
- appointment payments;
- follow-up creation;
- customer accounts;
- OTP;
- multi-coach calendar/conflict allocation.

Applicable patterns:
- Explicit State Transitions
- Atomic Business Operation
- Idempotent Business Command
- Historical Business Snapshot
- Secure External Document Sharing
- Audit Event System
- Shared API Contracts
- Domain Error Taxonomy

Gate 1 pending Fred approval.


## S5.2 — validation closure

Validated locally by Fred on 2026-10-21.

Agent validation:
- server unit tests: 251 passed;
- shared tests: 37 passed;
- PostgreSQL integration: 224 passed, including 47 appointment cases;
- typecheck/build/db:check/diff green;
- migration 0006_free_tusk.sql applied locally with no backfill needed;
- Reviewer passed with notes;
- QA passed with limitations.

Fred Gate 2:
- scheduling on active subscription/component validated;
- secure public response link validated;
- confirmation, on-time decline, late-decline policy handling and reschedule request validated;
- coach reschedule preserved original schedule and created linked replacement;
- completion/missed behavior and component consumption validated;
- explicit component restoration validated;
- DBeaver checks green for policy snapshots, appointment chains, component counters/events, token consumption/revocation and safe audit metadata.

Cancellation-window rule validated:
- null notice-hours means no late penalty;
- exactly at the cancellation deadline counts as on time.


## S5.3 — planning brief

Goal: structured coach follow-ups plus operational cadence/overdue detection for active subscriptions, with pause-aware time and no background-job dependency.

Cadence source:
- subscriptions.followUpFrequencyDaysOverride when set;
- otherwise variant service_policies.followUpFrequencyDays when non-null;
- otherwise service-level service_policies.followUpFrequencyDays;
- null effective cadence = cadence monitoring disabled;
- positive integer days only.
- Unlike commercial/cancellation snapshots, cadence is operational configuration and applies prospectively/currently; changing it intentionally changes the current follow-up rhythm.

Meaningful activity:
- subscription activation actualStartDate is initial baseline;
- completed appointment completedAt;
- recorded structured follow-up occurredAt;
- completing an open follow-up action completedAt.
Not meaningful:
- appointment scheduled/confirmed/cancelled/missed/reschedule traffic;
- secure-link views/responses;
- payment activity;
- questionnaire/consent activity;
- goals/progress (S5.4 not yet implemented).

Subscription cadence health is derived, not persisted:
- active only: healthy/due/overdue;
- paused: excluded and clock frozen;
- non-active lifecycle states: excluded from overdue queue;
- no scheduled job writes overdue state in S5.3.
Due time = latest meaningful activity + effective cadence measured in active subscription time, subtracting pause intervals after the activity baseline.
A meaningful activity immediately establishes a new baseline and clears derived overdue.

Follow-up records:
- existing follow_ups rows represent structured coach activity plus optional next action;
- occurredAt must not be in the future;
- followUpType closed V1 vocabulary: check_in | progress_review | coaching_contact | other;
- note optional;
- nextAction/nextActionAt optional but if one is supplied both are required;
- nextActionAt must be after occurredAt.

Stored follow-up state:
- open: next action pending;
- done: next action resolved or recorded activity has no pending action;
- cancelled: pending next action explicitly cancelled.
Derived effective state:
- open with nextActionAt < now => overdue.
Do not persist overdue in S5.3; expose it as derived effectiveStatus. This satisfies state-machine operational overdue semantics without cron/job writes.

State commands:
- create structured follow-up;
- complete open follow-up;
- cancel open follow-up.
No generic status patch.

Proposed schema:
- follow_ups.completed_at nullable timestamp;
- follow_ups.cancelled_at nullable timestamp;
- new follow_up_events append-only table: id, follow_up_id, event_type, from_status, to_status, actor_user_id, created_at.
Free-text note/nextAction/cancel reason stays on business record/event reason where required, never generic audit metadata.

Creating follow-up:
- subscription must be active;
- occurredAt <= authoritative now;
- create open when next action exists, otherwise done;
- if done directly, completedAt=occurredAt;
- create event + audit atomically;
- occurredAt is meaningful activity and resets cadence baseline.

Completing:
- open only;
- completedAt=authoritative now;
- status done;
- append event + audit;
- completion timestamp is meaningful activity.

Cancelling:
- open only;
- mandatory reason;
- status cancelled + cancelledAt;
- append event;
- does not create a new meaningful-activity timestamp.

Follow-up task overdue:
- open && nextActionAt < now => effectiveStatus overdue;
- exactly at nextActionAt is due, not overdue until strictly later;
- paused subscription does not hide the row's own missed next-action history, but global subscription cadence queue excludes paused subscriptions. UI may label pending task separately from cadence health.

Cadence override:
- explicit admin command to set positive integer days or clear override;
- only active/paused subscription may be configured;
- audit structural old/new values;
- clearing restores variant/service fallback;
- no retroactive data rewrite, only derived due time recalculation.

API proposal:
- GET /admin/follow-ups/queue
- GET /admin/subscriptions/:subscriptionId/follow-ups
- POST /admin/subscriptions/:subscriptionId/follow-ups
- POST /admin/follow-ups/:followUpId/complete
- POST /admin/follow-ups/:followUpId/cancel
- PUT /admin/subscriptions/:subscriptionId/follow-up-cadence

Queue returns active subscriptions with enabled cadence and derived:
- effectiveCadenceDays
- cadenceSource override|variant|service
- latestMeaningfulActivityAt
- nextFollowUpDueAt
- cadenceState healthy|due|overdue
- overdueByDays when overdue
Paused/non-active subscriptions excluded.

Pause arithmetic:
- time in subscription_pauses after the latest meaningful activity does not consume cadence days;
- an open pause freezes at current elapsed active time;
- on resume the remaining cadence continues;
- meaningful activity after resume resets baseline normally.

No scheduled job in S5.3:
- overdue is query/read-time derived;
- Scheduled Business Jobs remains for Sprint 7 reminders/notifications/materialized operational jobs if later required.

Concurrency:
- lock follow-up row for complete/cancel;
- cadence override locks subscription;
- audit + status mutation atomic;
- duplicate complete/cancel returns typed conflict and no duplicate event.

Audit:
- follow_up.recorded
- follow_up.completed
- follow_up.cancelled
- follow_up.cadence_override_updated
Metadata only structural IDs/type/status/cadence values; no note/nextAction/cancellation reason.

Client:
- French Suivis area on active subscription;
- global À suivre / Retards queue;
- show effective cadence and source, latest meaningful activity, due date, pause-excluded state;
- record follow-up with type/note/optional next action;
- complete/cancel pending next action;
- configure/clear cadence override.
UI never mutates overdue directly.

Out of scope:
- email/WhatsApp reminders;
- background overdue jobs;
- automatic follow-up creation;
- goals/progress measurements;
- document attachments implementation beyond existing nullable field;
- customer follow-up portal;
- payment-driven activity;
- changing subscription lifecycle.

Validation target:
1. fallback service cadence;
2. variant cadence overrides service per field;
3. subscription override wins and clear restores fallback;
4. null cadence disables monitoring;
5. activation is initial meaningful baseline;
6. completed appointment resets baseline;
7. appointment confirm/cancel/missed/reschedule does not reset;
8. recorded follow-up resets baseline;
9. complete open follow-up resets baseline;
10. cancellation of follow-up does not reset;
11. due boundary exactly dueAt = due, strictly later = overdue;
12. paused subscription excluded from queue;
13. pause duration freezes cadence clock;
14. resume preserves remaining cadence time;
15. multiple pauses subtract correctly;
16. non-active states excluded;
17. create done follow-up without next action;
18. create open follow-up with valid next action;
19. reject partial next-action fields/future occurredAt;
20. open next action derives overdue read-time;
21. complete/cancel state transitions append one history event;
22. double complete/cancel no duplicate events;
23. audit failure rolls back representative mutation;
24. notes/reasons absent from generic audit metadata.

Fred Gate 2:
- configure service cadence and inspect active subscription derived due;
- apply subscription override then clear it;
- create structured follow-up and verify cadence resets;
- create follow-up with next action and cross due boundary fixture;
- complete and cancel separate follow-ups;
- pause subscription and verify excluded/frozen cadence;
- resume and verify remaining interval;
- complete appointment and verify meaningful activity resets cadence;
- DBeaver inspect follow_ups, follow_up_events, subscription_pauses, subscription override and audit.

Gate 1 pending Fred approval.


## S5.3 — validation closure

Validated locally by Fred on 2026-10-21.

Agent validation:
- server tests: 274 passed;
- shared tests: 39 passed;
- PostgreSQL integration: 275 passed, including 51 follow-up cases;
- typecheck/build/db:check/diff green;
- migration 0007_misty_kronos.sql applied locally with no backfill needed;
- Reviewer passed with notes;
- QA passed with limitations.

Fred Gate 2:
- cadence override/reset validated;
- structured follow-up create/complete/cancel validated;
- completed appointment meaningfully resets cadence;
- pause-aware cadence freeze/resume validated;
- global queue /admin/follow-up-queue validated;
- DBeaver checks green;
- cadence uses active elapsed time;
- overdue remains derived and is never persisted.

Scaling note:
- global queue history loading may need batching as data volume grows; record as future optimization, not S5.3 scope.


## S5.4 — planning brief

Goal: preserve chronological progress measurements, manage structured goals through explicit coach-confirmed transitions, and expose deterministic non-medical goal-status suggestions without automatic completion.

Progress measurements:
- append-only; no edit/delete in S5.4;
- subscription must be active or paused to record;
- measuredAt <= authoritative now;
- at least one structured metric required;
- supported V1 metrics: weightKg, waistCm, hipsCm, chestCm, bodyFatEstimate;
- all numeric values must be positive and within defensive non-diagnostic technical bounds;
- feelingNote optional free text;
- recording structured body/progress measurements requires current granted health_data consent for the subscription/customer;
- no BMI, diagnosis, risk classification or medical interpretation in S5.4.

Progress-photo boundary:
- progress photos remain private by default;
- attaching/linking a private progress photo requires current granted progress_photo_storage consent;
- publication/marketing authorization is separate and never inferred;
- S5.4 may link an already-valid private document to a measurement, but does not build upload/version/share infrastructure; that remains S5.5/document scope;
- no public photo access in S5.4.

Goal model:
- status vocabulary remains active | achieved | partially_achieved | not_achieved | paused | cancelled;
- create goal in active state;
- active -> paused;
- paused -> active;
- active|paused -> cancelled;
- active -> achieved | partially_achieved | not_achieved only through explicit coach confirmation;
- achieved/partially_achieved/not_achieved/cancelled terminal in S5.4;
- no generic status PATCH.

Proposed goal schema additions:
- goals.metric_key nullable text;
- goals.confirmed_status nullable text only if needed for migration clarity is NOT required because status is authoritative;
- new goal_events append-only table: id, goal_id, event_type, from_status, to_status, suggested_status_snapshot nullable, actor_user_id nullable, reason nullable, created_at.
Existing suggested_status remains advisory current suggestion.
Existing coach_confirmed_at stores latest explicit coach outcome confirmation timestamp.

Goal metric keys:
- weight_kg
- waist_cm
- hips_cm
- chest_cm
- body_fat_estimate
- null for qualitative/custom goal with no automatic numeric suggestion.

Goal creation:
- subscription must be active or paused;
- category and label required;
- baselineValue/targetValue/unit either all present or all absent;
- metricKey requires numeric baseline + target + unit;
- metricKey must map to one supported progress measurement field;
- targetValue must differ from baselineValue for automatic directional suggestion;
- targetDate optional but if present must be after creation/current date;
- qualitative goals may have no metricKey and no numeric suggestion.

Measurement chronology:
- never overwrite a prior measurement;
- list ordered by measuredAt then createdAt;
- duplicate exact timestamp is allowed only if business input differs; reject exact duplicate measurement payload to protect double-submit;
- latest metric value for goal suggestion = latest measurement at or before authoritative now containing that metric.

Suggestion engine:
- server-calculated, deterministic, non-medical;
- suggestion never changes goal.status;
- suggestion written/read as suggestedStatus only for numeric metric goals;
- if no usable latest measurement => suggestedStatus null;
- infer direction from target vs baseline:
  target > baseline => increase goal;
  target < baseline => decrease goal;
- if latest value reaches or passes target in intended direction => suggestedStatus achieved;
- otherwise, before targetDate (or if targetDate null) => suggestedStatus remains null;
- once targetDate has passed:
  - movement from baseline in intended direction but target not reached => partially_achieved;
  - no improvement or movement opposite direction => not_achieved;
- exactly at targetDate is review-due but not considered past until strictly later;
- no percentage threshold is invented for partial success in V1.

Suggestion refresh:
- recompute affected active goals after recording a new measurement;
- store suggested_status as current advisory value for query efficiency;
- recomputation + measurement insert + audit happen atomically where practical;
- historical suggestion at confirmation is preserved in goal_events.suggested_status_snapshot;
- changing measurement history is impossible because measurements are append-only.

Coach confirmation:
- POST named command with chosen outcome achieved | partially_achieved | not_achieved;
- active goal only;
- coach may confirm the suggestion or choose a different allowed outcome;
- if chosen outcome differs from suggestedStatus, reason mandatory;
- set authoritative status, coachConfirmedAt=now;
- append goal event with suggestedStatus snapshot and reason;
- generic audit contains only structural status/suggestion values, never reason;
- no automatic goal status transition.

Pause/resume/cancel:
- pause active goal with optional reason;
- resume paused goal;
- cancel active|paused with mandatory reason;
- append goal events + audit;
- pausing subscription does NOT automatically pause goals; goal pause is explicit and independent;
- subscription completion/cancellation does not auto-finalize goal statuses in S5.4.

Read model:
GET /admin/subscriptions/:subscriptionId/progress
- chronological measurements;
- latest values and simple deltas from previous measurement;
- no health interpretation.

GET /admin/subscriptions/:subscriptionId/goals
- goals + current suggestedStatus;
- latest metric value used for suggestion;
- goal event history;
- available named commands advisory only.

Commands/API proposal:
- POST /admin/subscriptions/:subscriptionId/progress-measurements
- GET /admin/subscriptions/:subscriptionId/progress
- POST /admin/subscriptions/:subscriptionId/goals
- GET /admin/subscriptions/:subscriptionId/goals
- POST /admin/goals/:goalId/pause
- POST /admin/goals/:goalId/resume
- POST /admin/goals/:goalId/confirm-outcome
- POST /admin/goals/:goalId/cancel
- POST /admin/progress-measurements/:measurementId/photos/link only if existing private-document integration is already reusable without opening S5.5; otherwise defer photo linking implementation and keep consent/read-model boundary documented.

Consent:
- health_data grant required before structured progress measurement persistence;
- progress_photo_storage grant required before progress photo linkage/storage;
- publication consent never required for private storage and never inferred;
- refusal/revocation blocks new collection but does not destructively erase historical records in S5.4.

Audit:
- progress.measurement_recorded
- progress.photo_linked if included
- goal.created
- goal.paused
- goal.resumed
- goal.outcome_confirmed
- goal.cancelled
Metadata structural only: IDs, metric keys present, from/to status, suggested status, chosen outcome. No measurement values, body values, feelingNote or reasons in generic audit metadata.

Client:
French subscription Progression area:
- Mesures chronological table/cards;
- latest vs previous simple numeric delta;
- Objectifs list;
- current authoritative goal status;
- advisory badge: Suggestion système;
- coach confirmation UI clearly separates suggestion from decision;
- create/pause/resume/cancel goal;
- record measurement;
- photo controls only if private-document integration can be reused safely in S5.4.

Out of scope:
- medical advice/diagnosis;
- BMI/risk scoring;
- AI-generated coaching conclusions;
- automatic goal completion;
- customer-entered progress portal;
- public/marketing photo publication;
- file upload/version/share engine;
- goal carry-forward to renewal;
- automatic goal closure when subscription completes;
- charts requiring a new visualization framework beyond simple existing client capabilities.

Applicable patterns:
- Explicit State Transitions
- Atomic Business Operation
- Idempotent Business Command
- Audit Event System
- Domain Error Taxonomy
- Shared API Contracts
- consent/versioned evidence safeguards already validated in S4.4.

Validation target:
1. health_data consent required for measurement;
2. refusal/revocation blocks new measurement;
3. historical measurements preserved;
4. active subscription measurement accepted;
5. paused subscription measurement accepted;
6. other subscription states rejected for new measurement;
7. future measuredAt rejected;
8. empty measurement rejected;
9. exact duplicate payload replay rejected/no duplicate row;
10. chronological order preserved for backdated valid measurement;
11. qualitative goal creation;
12. numeric metric goal creation;
13. invalid metric/baseline/target combination rejected;
14. latest matching measurement drives suggestion;
15. increase target reached => achieved suggestion;
16. decrease target reached => achieved suggestion;
17. before targetDate and target not reached => null suggestion;
18. exactly targetDate not yet past => null suggestion unless target reached;
19. after targetDate with improvement => partially_achieved suggestion;
20. after targetDate without improvement/opposite direction => not_achieved suggestion;
21. suggestion never mutates authoritative status;
22. coach confirms matching suggestion;
23. coach override differing from suggestion requires reason;
24. confirmed outcome terminal;
25. pause/resume explicit goal transitions;
26. cancel reason required;
27. subscription pause does not auto-pause goal;
28. subscription completion does not auto-finalize goal;
29. goal_events append-only;
30. measurement values/notes/reasons absent from generic audit metadata;
31. audit failure rolls back representative mutation;
32. progress-photo linkage, if implemented, requires progress_photo_storage and remains private.

Fred Gate 2:
- active subscription with health_data grant;
- record multiple chronological measurements;
- verify latest/previous values;
- create increase and decrease numeric goals;
- demonstrate advisory suggestion before/after target behavior using fixture dates;
- confirm one suggested outcome;
- override another with mandatory reason;
- pause/resume/cancel separate goals;
- revoke health_data and verify new measurement rejected while history remains;
- if photo linking included, verify progress_photo_storage prerequisite and private-only behavior;
- DBeaver inspect progress_measurements, goals, goal_events, consent_records and audit_events.

Gate 1 pending Fred approval.


## S5.4 — validation closure

Validated locally by Fred on 2026-10-21.

Agent validation:
- typecheck passed;
- server tests: 304 passed;
- shared tests: 41 passed;
- build passed;
- db:check passed;
- PostgreSQL integration: 333/333 passed, including 58 S5.4 cases;
- migration 0008 applied locally;
- Reviewer passed with notes;
- QA passed with limitations.
- First integration run reproduced the unchanged Sprint 3 concurrency flake; approved retry passed.

Fred Gate 2:
- chronological append-only measurement history/deltas validated;
- health_data consent guard and revocation-preserves-history behavior validated;
- qualitative and numeric goals validated;
- advisory suggestions remained distinct from authoritative goal status;
- explicit coach confirmation and override-reason behavior validated;
- goal pause/resume/cancel validated;
- subscription pause did not auto-pause goals;
- DBeaver checks green for progress_measurements, goals, goal_events, consent evidence and safe audit metadata.
- photos remain deferred to S5.5.
- UI currently uses kg/cm/%; stronger API metric/unit compatibility remains a future hardening item.

Full-project acceptance recipe is maintained in docs/RECETTE_V1_CORE.md and must be extended as later slices/sprints are validated.

## S5.5 — planning brief

Goal: turn the Sprint 0 private-file/document foundation into an authoritative V1 document workflow for personalized coaching artifacts, immutable versions and secure temporary customer delivery.

V1 document types:
- meal_plan
- workout_plan
- progress_summary
- progress_photo
- other_personalized

Creation modes:
- meal_plan / workout_plan / other_personalized: coach uploads an already-produced supported private file; S5.5 does not invent structured meal/workout authoring models.
- progress_summary: may be generated as PDF from authoritative subscription/progress/goal/follow-up data using a deterministic server-side print model and template version.
- progress_photo: private image upload/linkage using the same storage pipeline; no publication workflow.

Document ownership:
- personalized coaching documents are owned by subscription: ownerType=subscription, ownerId=subscriptionId.
- progress_photo document also belongs to the subscription and is linked through progress_photos after storage succeeds.
- validate polymorphic ownership in service layer.

Document lifecycle:
- draft
- available
- revoked
- archived
- pending_purge / purged remain retention-layer states and are not actively implemented by S5.5 commands.

Named commands only:
- create/upload first version;
- add version;
- revoke;
- archive;
- issue delivery link.
No generic status PATCH.

Versioning:
- document_versions are immutable;
- version numbers are monotonically increasing per document;
- current_version_id must belong to same document;
- new version never overwrites/deletes old file/version;
- public delivery token targets the immutable document_version, NOT logical document/current version;
- old links therefore keep referring to the exact version originally shared until expiry/revocation.

Allowed upload policy from Sprint 0:
- max 10 MB;
- PDF, JPG/JPEG, PNG, WebP;
- binary signature must match declared type/extension;
- internal storage name random/opaque and never includes customer/business identifiers;
- private storage outside public web root;
- SHA-256 persisted;
- malware scan mandatory before DB business record becomes available;
- infected/scan_failed file is never externally deliverable.

Hard commit / file transaction boundary:
1. receive file to controlled temporary/private staging;
2. validate size + signature;
3. compute SHA-256;
4. scan with ClamAV;
5. only CLEAN files may proceed;
6. move/write to opaque final private storage key;
7. DB transaction locks logical document as applicable, assigns version number, inserts document/version, sets currentVersionId/status and audit;
8. if DB transaction fails, delete the just-finalized orphan file;
9. if file finalization fails, create no business row.
Never leave a document row pointing to a missing/unscanned file.

First version:
- create logical document + clean version 1 atomically after successful scan;
- status becomes available;
- sensitivity set server-side from type, not client-controlled.

Sensitivity:
- meal_plan, workout_plan, other_personalized => private;
- progress_summary, progress_photo => sensitive_health;
- client cannot downgrade sensitivity.

Consent:
- generating a NEW progress_summary requires current health_data grant because it is a new derived health/progress artifact;
- uploading/linking a NEW progress_photo requires current progress_photo_storage grant;
- consent refusal/revocation blocks new generation/storage of those sensitive artifacts;
- historical document/version rows are preserved;
- publication/marketing consent is separate and never inferred;
- S5.5 creates no public progress-photo publication path.

Progress summary generation:
- deterministic PDF via Puppeteer/local-only assets;
- authoritative input only from selected subscription and its validated progress/goals/follow-ups;
- no diagnosis, BMI, risk score, AI interpretation or invented coaching conclusion;
- print model may include customer display name, subscription reference/service label, chronological measurements, goals/status/suggestions confirmed as data, and follow-up summary facts;
- body/health values belong inside the sensitive document itself, never generic audit metadata;
- fixed template identifier/version stored with the generated version metadata/context (schema field or safe metadata approach decided during implementation without changing business rules);
- generation does not mutate goals/progress/subscription state.

Progress photos:
- narrow S5.5 private upload/link path only;
- progress_photo_storage grant required;
- create private sensitive-health document/version through same validated storage/scan pipeline;
- insert progress_photos link only after document/version is clean/committed;
- measurementId optional but if supplied must belong to same subscription;
- publication/marketingAuthorizationId remains null in S5.5;
- no customer/public photo URL.

Admin download:
- authenticated admin can download a clean current or historical document version after ownership authorization;
- stream from private storage using server route;
- storage_key is never exposed to client;
- safe Content-Type and Content-Disposition filename;
- admin download is audited structurally.

Secure customer delivery:
- issue link against one clean, available immutable document version;
- resourceType=document_version;
- action=document_download;
- random bearer token, hash only;
- explicit expiry;
- revocable;
- successful/failed access appended to external_access_events;
- access route never exposes storage key;
- rate-limited;
- expired/revoked/exhausted token rejected with no file bytes.

Use semantics:
- document links are download links, so unlike one-shot form links they may allow limited repeated access until expiry;
- default maxUses proposed: 3;
- successful file stream increments useCount atomically before/at hard commit of access authorization;
- once maxUses reached, token is exhausted;
- admin can explicitly revoke an issued link.

Stricter sensitive-link verification:
- existing requires_otp column is unused and customer OTP delivery does not exist;
- do NOT reuse admin OTP or invent SMS/WhatsApp delivery.
- For sensitive_health documents, S5.5 proposes a separate short verification code generated when link is issued and communicated manually by the coach through an independent channel.
- store only a salted/peppered hash, never raw code;
- public GET may show a minimal verification page but returns no document bytes/content;
- POST code verification is rate-limited with a small maximum attempt count (proposed 5) and short verification/session lifetime;
- after successful verification, download for that token may proceed under its maxUses/expiry policy.
- Implementation may add document-specific verification fields/table rather than broadening admin OTP semantics.
- Standard private meal/workout documents do not require the second code by default.
This is the proposed interpretation of the backlog rule “sensitive links require stricter verification” and needs Gate 1 approval.

Revocation:
- document revoke blocks new public/admin-as-current delivery but preserves versions/history;
- revoking document also revokes all active secure_access_tokens for its versions atomically;
- archived document is read-only historical/admin-visible and cannot issue new public links;
- existing active links are revoked when archive occurs.
- no physical deletion/purge in S5.5.

New version:
- allowed for available/draft logical document;
- same documentType/owner/sensitivity;
- clean scan required;
- lock document and compute next version number;
- insert immutable version, update currentVersionId;
- existing links to old versions remain valid unless explicitly revoked by coach; creating v2 does NOT silently revoke v1 links because they were intentionally version-bound.
- UI clearly shows which version each active link targets.

API proposal — admin:
- GET /admin/subscriptions/:subscriptionId/documents
- POST /admin/subscriptions/:subscriptionId/documents
- GET /admin/documents/:documentId
- POST /admin/documents/:documentId/versions
- GET /admin/document-versions/:versionId/download
- POST /admin/document-versions/:versionId/delivery-links
- POST /admin/document-delivery-links/:tokenId/revoke
- POST /admin/documents/:documentId/revoke
- POST /admin/documents/:documentId/archive
- POST /admin/subscriptions/:subscriptionId/progress-summary/generate
- POST /admin/progress-measurements/:measurementId/photos only if multipart route design remains within approved file pipeline.

API proposal — public:
- GET /public/documents/:token
- POST /public/documents/:token/verify for sensitive-health challenge
- GET /public/documents/:token/download after authorization/verification

Public response exposes only:
- safe document label/type;
- version number;
- optional expiry;
- whether verification is required.
No customer phone/email, health values, storage key or unrelated subscription data.

Audit events:
- document.created
- document.version_added
- document.progress_summary_generated
- document.progress_photo_added
- document.delivery_link_created
- document.delivery_link_revoked
- document.downloaded_admin
- document.revoked
- document.archived
Generic audit metadata only: documentId, versionId, documentType, sensitivity, versionNumber, tokenId, actor/source. Never file bytes, raw token/code, storage key, body/health values, filenames if they contain customer-entered sensitive content, or consent details.

External access events:
- document.view
- document.verify
- document.download
with result values such as success/invalid/expired/revoked/exhausted/verification_failed.
IP/UA remain hashed through existing audit context mechanism.

Schema impact — reuse first:
Existing tables already support most of S5.5:
- documents
- document_versions
- secure_access_tokens
- external_access_events
- progress_photos

Likely additive schema only for sensitive document challenge / generated-template metadata if no existing safe field fits.
Do not add a new generic file table.

Concurrency/idempotency:
- document version number allocated under document row lock;
- concurrent version additions produce distinct ordered versions, never same version number;
- duplicate/replayed upload request must not create duplicate version after hard commit;
- public token use/maxUses updated under token lock;
- revocation vs download race resolves under authoritative token/document checks;
- progress-photo linkage exactly once per created document/version operation.

Client/UI:
- Implementation now continues on `main`, which contains both the Sprint 5 business history and the validated UI refonte patterns.
- Integrate Documents into the refonte client-profile/navigation patterns without reopening unrelated UX scope.
- French admin document panel:
  - type, status, sensitivity, current version;
  - versions/history;
  - upload new version;
  - generate progress summary;
  - secure-link creation with expiry/max uses;
  - sensitive link shows verification code ONCE to coach after issue;
  - active/revoked/exhausted links;
  - revoke/archive actions.
- Public page is mobile-friendly and minimal.

Out of scope:
- structured meal-plan editor;
- structured workout-plan editor;
- AI-generated plans or summaries;
- electronic signature;
- public progress-photo publication;
- marketing/testimonial authorization;
- document comments/approval workflow;
- arbitrary document sharing between customers;
- retention purge jobs;
- S3/S4/S5 lifecycle changes;
- financial quotes/receipts (Sprint 6);

Applicable patterns:
- Secure External Document Sharing
- Business Document PDF Generation
- Historical Business Snapshot
- Atomic Business Operation
- Idempotent Business Command
- Hard Commit Point
- Audit Event System
- Shared API Contracts
- Domain Error Taxonomy

Validation target:
1. valid supported clean PDF upload creates document + v1;
2. extension/signature mismatch rejected with zero DB business rows;
3. >10 MB rejected;
4. infected EICAR rejected with zero available document/version;
5. opaque storage key never contains original/business identifiers;
6. SHA-256 persisted;
7. first clean version becomes current;
8. v2 appends, preserves v1 and becomes current;
9. concurrent v2 attempts allocate unique versions;
10. old version links remain version-bound after v2;
11. admin historical-version download works;
12. storage key never appears in API response;
13. progress summary generation requires health_data grant;
14. revoked/absent health_data blocks new summary while old docs remain;
15. generated progress summary contains authoritative facts and no diagnostic interpretation;
16. progress photo requires progress_photo_storage grant;
17. progress photo link uses same subscription/measurement ownership;
18. publication authorization remains null/no public photo path;
19. standard delivery token stored hash-only;
20. public GET non-consuming/no file bytes;
21. clean available version download succeeds;
22. useCount/maxUses enforced exactly once under concurrency;
23. expired token rejects;
24. revoked token rejects;
25. exhausted token rejects;
26. document revoke revokes active version links;
27. archive prevents new links and revokes active links;
28. sensitive-health link requires verification challenge;
29. wrong sensitive verification code rejected and attempts limited;
30. raw verification code never stored;
31. correct sensitive verification permits download;
32. public output contains no unrelated PII/health data;
33. external_access_events record safe success/failure evidence;
34. generic audits contain no raw token/code/storage key/health values;
35. representative DB/audit failure cleans newly finalized orphan file or prevents authoritative row;
36. duplicate/replayed command does not create duplicate document/version.

Fred Gate 2:
- upload meal/workout PDF;
- add version and verify history/current pointer;
- generate progress summary;
- create standard temporary link and download;
- hit max use/revoke/expiry fixtures;
- create sensitive progress-summary link, verify wrong code then correct code;
- upload private progress photo after progress_photo_storage grant;
- revoke document and confirm existing link stops working;
- DBeaver inspect documents, document_versions, secure_access_tokens, external_access_events, progress_photos, consent_records, audit_events;
- inspect storage/private to verify opaque filenames and no rejected/orphan files.

Gate 1 approved by Fred.


### S5.5 Gate 1 — approved

Fred approved the complete S5.5 plan on 2026-10-22, including:
- immutable version-bound public links;
- private storage + signature validation + SHA-256 + ClamAV hard-commit workflow;
- deterministic progress-summary PDF generation without diagnosis/AI conclusions;
- progress-photo storage guarded by progress_photo_storage consent;
- sensitive_health delivery using a separate short verification code, hash-only, limited attempts, manually communicated by the coach;
- default document-link maxUses = 3;
- no customer account/SMS/WhatsApp OTP infrastructure introduced.

Implementation is authorized on `main`. Stop at AWAITING_REVIEW before Reviewer → QA → Fred Gate 2.


### S5.5 implementation checkpoint — 2026-10-22

Status: IMPLEMENTED + STATICALLY REVIEWED; runtime/local validation remains open.

Implementation commits on main:
- c12e318 — server document workflow;
- e6ce097 — admin/public document UI;
- a9fae25 — progress photos remain private/no public delivery link;
- 8ce1f6d — S5.5 focused tests;
- 7a75747 — link lifecycle hardening coverage;
- bffba46 — upload validation + concurrency/version-binding/audit QA coverage;
- 0f2bfae — refonte panel source-format correction.

Static Reviewer findings fixed before handoff:
- progress photos cannot issue public customer links;
- admin download extension now follows actual MIME type;
- MIME/signature/filename extension must agree;
- literal source-format escape in Documents panel corrected.

Static QA coverage now includes:
- immutable v1/v2/v3 versioning and concurrent version allocation;
- duplicate SHA/replay rejection;
- exact version-bound old links after newer versions;
- hash-only bearer storage and non-consuming public metadata;
- max-use exhaustion, expiry and explicit revocation;
- document-wide revocation across versions;
- health consent gate for generated progress summary;
- separate progress-photo-storage consent and private-only photo behavior;
- sensitive verification challenge, raw-code non-persistence and five-attempt lockout;
- hard-commit orphan cleanup on repository error/throw;
- public read-model and generic-audit privacy constraints.

No S5.5 schema migration or new package dependency is required; existing document/version/token/context_json/progress_photos foundation is reused.

Do not mark S5.5 validated or close Sprint 5 until Fred reports local commands + browser/DBeaver/storage checks green.


## S6.2 Gate 1 — approved 2026-10-22

Fred approved all seven S6.2 planning decisions:

1. Quote creation occurs against an existing subscription/customer after request conversion; request linkage is derived from subscription.sourceRequestId where available.
2. Official quote numbering is allocated only on first issue, using a concurrency-safe annual sequence with format `DEV-YYYY-NNNN`.
3. Issued quote versions are immutable; changes require a new version.
4. Public response choices are accepted, declined, or changes_requested; secure response tokens are scoped, expiring, revocable, rate-limited and hash-only in storage.
5. Quote PDFs render from immutable historical snapshots, not mutable live catalogue/customer data.
6. Customer acceptance never mutates the subscription. A separate coach synchronization command applies the accepted quote reference and may update agreed price only when no authoritative finance activity exists; otherwise it rejects with a typed conflict.
7. Quote validity and commercial terms are explicit inputs, not invented legal text. Storage/API remain XAF; customer-facing display may use FCFA.

Implementation is authorized for S6.2 only. S6.3 remains closed until Fred locally validates S6.2.


## S6.3 Gate 1 — approved 2026-10-22

Fred approved the complete S6.3 payment-proof plan.

Locked decisions:
- Public customer upload uses a scoped, expiring, revocable, hash-only token for one subscription/payment-proof submission path.
- Payment-proof files use the existing private scanned document pipeline and remain admin-private; no public proof download link.
- Upload creates evidence only; it never creates a payment event or changes financial/subscription state.
- Customer submission includes file + claimed amount + claimed payment method + claimed payment date. These values are untrusted claims until coach review.
- Closed review outcomes remain: pending_review, confirmed, partially_confirmed, correction_requested, rejected, duplicate, superseded.
- confirmed / partially_confirmed review creates the authoritative S6.1 payment event + allocations atomically and links proof -> payment event.
- rejected / correction_requested / duplicate create no payment event.
- correction requests create replacement evidence through a new proof row with supersedesProofId; historical proof/document evidence is never overwritten.
- exact duplicate SHA within the same proof lineage is guarded; coach may also explicitly mark duplicate.
- no unsafe global uniqueness assumption for bank/mobile-money external references.
- private reviewNote is separate from optional customerMessage; neither enters generic audit metadata.
- proof confirmation uses the same finance locking/recalculation semantics as S6.1 and must be concurrency-safe against duplicate review and concurrent manual payment.
- S6.4 remains closed until Fred locally validates S6.3.

Implementation is authorized for S6.3 only.


## S6.4 Gate 1 — approved 2026-10-22

Fred approved all 12 S6.4 receipt decisions.

Locked rules:
1. One receipt represents one confirmed `payment_received` event only.
2. Exactly one official receipt per payment event; repeated issuance is idempotent/conflict-safe.
3. Official number format is `REC-YYYY-NNNN`, allocated from the existing annual business-document counter under PostgreSQL row lock and DB uniqueness.
4. Issuance freezes a historical snapshot including receipt number, minimal customer display identity, subscription reference, payment amount/method/date, issue date, exact allocations and balance-after-payment-at-issuance.
5. Receipt PDF is immutable private scanned storage linked through `pdf_document_id`; historical rendering never uses mutable live data.
6. Secure sharing reuses hash-only scoped tokens with expiry, revocation, usage limit, rate limiting and external access audit.
7. Later payment corrections never rewrite receipt number, snapshot or PDF.
8. Receipt void is explicit and allowed only when the source payment has been fully corrected; partial correction leaves the receipt issued but exposes correction state.
9. Voided receipts are never deleted and sequence numbers are never reused.
10. Public access to a voided receipt remains historical but clearly displays Annulé/corrected status.
11. Receipt issuance is an explicit coach action; S6.1/S6.3 payment confirmation does not depend on PDF/ClamAV.
12. Invoices, refunds, credit notes, VAT/tax logic, provider APIs, email/WhatsApp sending and accounting exports remain outside S6.4.

Implementation is authorized for S6.4 only. Sprint 6 closure still requires Fred local validation of S6.4.


## Sprint 6 closure — 2026-10-23

Status: **CLOSED / LOCALLY VALIDATED**.

Validated slices:
- S6.1 — authoritative financial ledger;
- S6.2 — versioned quotes and secure customer acceptance;
- S6.3 — secure payment-proof evidence and coach review;
- S6.4 — sequential receipts and secure sharing.

Final S6.4 implementation:
- `a38901a` — `feat(receipts): add sequential receipts and secure sharing`.

Final S6.4 validation:
- server 470/470;
- shared 55/55;
- PostgreSQL 507/507 including 40 receipt cases;
- typecheck/build/db:check green;
- real PDF/files/ClamAV preflights green;
- Reviewer PASSED WITH NOTES;
- QA PASSED WITH LIMITATIONS;
- Fred browser/mobile/keyboard and DBeaver Gate 2: all green.

Sprint 6 acceptance is satisfied for the V1 Core finance chain: payment plans/installments, confirmed payments/allocations, versioned quotes, payment proofs, sequential receipts and secure sharing.

Next sprint: Sprint 7 — Dashboard, notifications, rétention, sauvegardes et durcissement.
First implementation slice: **S7.1 — Core dashboard KPIs and operational alert workspaces**.
No Sprint 7 implementation before Gate 1.


## S7.1 Gate 1 — approved 2026-10-23

Fred approved all 18 S7.1 dashboard/alert decisions.

Locked rules:
1. Keep `GET /admin/today` as the validated current operational snapshot; do not rewrite existing current-day rules.
2. Add a separate read-only analytics endpoint: `GET /admin/dashboard/analytics?periode=4w|8w|12m`.
3. All periods use Africa/Libreville business time; weeks are Monday–Sunday; 12m uses calendar-month buckets.
4. KPI sparklines use 8 weekly points:
   - active clients = end-of-week stock;
   - overdue follow-ups = end-of-week stock;
   - new requests = weekly flow;
   - completed sessions = weekly flow.
5. KPI delta compares current business week vs immediately previous business week. Favourable direction is metric-specific; previous zero uses absolute change, never fake infinite percentage.
6. Requests chart supports exactly 4w / 8w / 12m, with weekly buckets for 4w/8w and monthly buckets for 12m.
7. Requests funnel is cohort-based on requests submitted inside the selected period:
   received -> contacted -> qualified -> converted.
8. Conversion attribution remains with the original submitted-period cohort even when conversion occurs later; analytics is evaluated as-of-now.
9. Finance exposes separate authoritative values:
   collectedXaf, dueXaf, futureXaf, overdueXaf, outstandingXaf.
   For current authoritative schedules, outstanding = overdue + due + future.
10. Finance analytics use S6.1 ledger only. Quotes/proofs/receipts may contribute operational alerts but never financial truth.
11. S7.1 alerts are derived dashboard read models, not persisted notifications. S7.2 owns notification records/email reminders.
12. Each alert deep-links to the authoritative owner workspace/action.
13. Dashboard must reuse owner-module policies/derived rules and must not duplicate business-state logic.
14. Historical KPI computation is read-only; no snapshot table/migration unless implementation proves reconstruction impossible or unsafe.
15. UX-9c is completed in S7.1 except coach first name. Keep `Bonjour`; displayName/session migration remains V1.1.
16. No notification/email engine in S7.1.
17. No mutation endpoints in S7.1. Proposed read surface:
   - GET /admin/today
   - GET /admin/appointments
   - GET /admin/dashboard/analytics?periode=4w|8w|12m
   - GET /admin/dashboard/alerts
18. Validation must prove time boundaries, historical stock/flow correctness, request cohort conversion, finance correction/due semantics, read-only behavior and privacy.

Implementation is authorized for S7.1 only. S7.2 remains closed until Fred locally validates S7.1.


## S7.1 feasibility blocker — historical cadence

Independent Reviewer confirmed S7.1 cannot safely reconstruct historical overdue-follow-up stock from current data.

Root cause:
- cadence resolution may fall back to mutable service/variant `followUpFrequencyDays`;
- catalogue policy updates/seeding can overwrite those fallback values;
- subscription override audit/history cannot reconstruct a fallback value that was overwritten;
- therefore an old weekly endpoint may be impossible to classify deterministically as healthy/due/overdue.

Example:
- 10 active days since meaningful activity;
- historical cadence 7 days => overdue;
- current cadence 14 days => healthy.

Using today's policy for historical weeks is prohibited because it would fabricate history.

Current state:
- S7.1 BLOCKED at historical-feasibility gate;
- no implementation files changed;
- no migration/tests run for S7.1;
- S7.2 remains closed.

Planner recommendation:
- capture effective cadence history prospectively;
- legacy historical KPI buckets return unavailable when cadence provenance cannot be proven;
- never backfill unknown historical cadence from today's configuration.


## S7.1 Gate 1 amendment — cadence history approved 2026-10-23

Fred approved the cadence-history amendment after the historical-feasibility blocker.

Locked amendment:
- add prospective append-only history of the resolved effective follow-up cadence;
- store the resolved value itself, not only a pointer to mutable catalogue policy;
- capture source: override | variant | service | none;
- no invented legacy backfill from today's service/variant values;
- initialize current effective cadence from migration time onward;
- historical overdue-follow-up buckets are `complete` only when cadence provenance is provable for all contributing subscriptions;
- otherwise the bucket value is null with `availability = unavailable`;
- unavailable is never represented as zero;
- KPI delta is unavailable when either compared point is unavailable;
- current `GET /admin/today` overdue-follow-up KPI remains unchanged;
- one additive migration is explicitly authorized for cadence history;
- all other S7.1 Gate 1 decisions remain unchanged.

S7.1 is unblocked and APPROVED_FOR_IMPLEMENTATION.
S7.2 remains closed until Fred locally validates S7.1.


## S7.1 closure — 2026-10-23

Status: **CLOSED / LOCALLY VALIDATED**.

Implementation:
- `ed1c7d0` — `feat(dashboard): add historical analytics and operational alerts`.
- `bb3ba76` — `fix(finance): stabilize payment allocation read order`.

Validation:
- typecheck green;
- build green;
- db:check green;
- server 523/523;
- shared 56/56;
- PostgreSQL 542/542 after deterministic allocation-read ordering fix;
- all 35 new S7.1 PostgreSQL cases green;
- Fred confirmed browser/mobile/keyboard and DBeaver Gate 2 all green.

Validated S7.1 scope:
- historical KPI series and deltas;
- 4w/8w/12m request chart;
- cohort funnel;
- authoritative five-part finance summary;
- operational alerts/deep links;
- prospective cadence history with truthful legacy-unavailable points;
- current /admin/today semantics unchanged.

Known coverage note:
- actual catalogue-seed concurrency with simultaneous override/activation remains not directly runtime-tested; helper atomicity and DB overlap constraints are covered.

S7.1 is closed. S7.2 is now the active planning slice; no S7.2 implementation before Gate 1.


## S7.2 Gate 1 — approved 2026-10-23

Fred approved all 32 S7.2 notification/reminder decisions.

Locked rules:
1. Business condition remains owned by source modules/S7.1 derivation; notification never invents business state.
2. Durable in-app notification is primary; email is optional secondary delivery.
3. Persist notifications with recipient/kind/severity/resource/deep-link/dedupe/read/resolved timestamps.
4. One logical open notification per active condition through stable dedupe_key.
5. Read/unread is separate from resolved/unresolved; read never resolves business work.
6. Source-condition disappearance resolves notification while preserving history.
7. No arbitrary dismiss-forever in V1 Core.
8. Initial closed kinds mirror proven S7.1 alerts: follow_up_overdue, request_to_contact, installment_overdue, payment_proof_pending, preparation_blocked, completion_due. quote_action_required only if authoritative condition is precise.
9. S7.2 recipients are internal active admin/coach users only; no customer-facing reminder system is introduced.
10. Email uses a durable outbox with frozen recipient/content.
11. Outbox states: pending, sending, sent, failed, dead_letter.
12. SMTP retries are bounded and configured, not scattered literals.
13. Reminder/digest behavior uses Typed Settings with closed keys/validation/audit.
14. V1 Core uses global operational notification settings rather than per-user preference complexity.
15. Reminder discovery runs as Scheduled Business Jobs with advisory locking + scheduled_job_runs idempotency.
16. Jobs: notifications.reconcile and notifications.email-delivery.
17. Proposed cadence: reconcile every 15 minutes; delivery worker every 5 minutes.
18. Reminder email cadence is separate from source-state mutation; repeated emails reuse one in-app notification.
19. Email is enabled for proven alert categories subject to settings.
20. Prefer one daily digest for normal operational alerts instead of one email per alert.
21. Default digest time: 08:00 Africa/Libreville, configurable.
22. Internal email recipients come from users.email only.
23. Email content is privacy-minimal; exclude health/private-doc/payment-reference/notes/bearers.
24. Deep links reuse authoritative owner workspaces.
25. Admin UI adds notification center/bell + settings; no notification-specific business actions.
26. Resolved notifications remain in paginated history; unresolved/recent first.
27. Outbox has simple admin troubleshooting/history; manual retry allowed only where scope remains small.
28. Generic audit is structural only; job/outbox results stay primarily in their durable records.
29. Additive schema is expected for notifications/outbox/settings if no generic settings store exists.
30. Email failure never removes notification; notification persistence failure prevents silent email-only delivery.
31. Reading/emailing never executes business commands.
32. Validation must cover dedupe/resolution/read semantics, SMTP failure/retry/exact-once behavior, scheduler locking, Africa/Libreville digest time, settings validation, recipient/privacy rules, no source mutation, stable error codes and Mailpit acceptance.

Implementation is authorized for S7.2 only. S7.3 remains closed until Fred locally validates S7.2.

# K'FIT — Sprint 7 execution spec

## Objective

Deliver the V1 Core operational layer: dashboard KPIs and alert workspaces, notification engine, retention/anonymization, backup/restore readiness and remaining hardening before Sprint 8 UAT.

## Ordered tasks

1. S7.1 — Core dashboard KPIs and operational alert workspaces — CLOSED / validated 2026-10-23.
2. S7.2 — Dashboard and email notification engine with configurable reminders — CLOSED / validated 2026-10-25.
3. S7.3 — Retention, anonymization, soft-delete purge and privacy-action replay — APPROVED_FOR_IMPLEMENTATION (Gate 1 approved 2026-10-25; S7.3a server in progress).
4. S7.4 — Backup/restore and production-hardening acceptance — CLOSED until S7.3 validation.

## Dependency notes

- Sprint 6 is closed and provides the authoritative finance data needed by dashboard/alerts.
- Existing UX-9/UX-9b already provides the current-day dashboard shell and current KPI reads.
- Sprint 7 must complete the deferred dashboard trend/alert behavior without duplicating already validated dashboard endpoints.
- Staging, production and coach training belong to Sprint 9, not Sprint 7.
- Sprint 8 remains the V1 Core UAT/correction gate.

## S7.1 — initial planning target

Backlog source: **Core dashboard KPIs and operational alert workspaces**.

Known required inputs:
- requests;
- subscriptions;
- follow-ups;
- appointments;
- financial ledger.

Known business note:
- collected, billed/future, overdue and outstanding financial amounts must remain distinct rather than collapsed into one money KPI.

Related deferred UX/API work to reconcile during Gate 1:
- weekly/monthly time series for board 02;
- KPI sparklines and period deltas;
- requests funnel period statistics;
- existing UX-9c dashboard fidelity work.

No S7.1 implementation before Fred approves Gate 1.


## S7.1 Gate 1 — approved 2026-10-23

Goal: complete the V1 Core coach dashboard with historical KPI series, request-funnel analytics, authoritative finance summaries and derived operational-alert workspaces without creating a duplicate business-state or notification system.

### Existing foundation to preserve
- UX-9 / UX-9b `GET /admin/today`, `GET /admin/appointments` and TodayPage layout;
- existing KpiTile/Sparkline/chart primitives;
- Africa/Libreville shared business-time helpers;
- authoritative Requests, Subscription, Follow-up, Appointment and S6.1 Finance modules;
- existing queues/read models from owner modules.

### API split
Current operational snapshot stays:
- `GET /admin/today`
- `GET /admin/appointments`

New read-only S7.1 endpoints:
- `GET /admin/dashboard/analytics?periode=4w|8w|12m`
- `GET /admin/dashboard/alerts`

No mutation endpoint.

### Time model
- timezone: Africa/Libreville;
- business week: Monday 00:00 through next Monday 00:00;
- 4w / 8w use weekly buckets;
- 12m uses calendar-month buckets;
- exact bucket boundaries returned to client for labels/tooltips;
- all historical/as-of logic must be deterministic at boundary instants.

### KPI time-series semantics
Eight weekly sparkline points:
- activeClients: count active at end of each business week;
- followUpsOverdue: count overdue at end of each business week;
- newRequests: submitted during each business week;
- sessionsCompleted: completed during each business week.

Current TodayPage numbers remain owned by `/admin/today`.

### KPI deltas
Compare current business week with the immediately preceding business week.
Direction/tone:
- active clients: increase favourable;
- overdue follow-ups: decrease favourable;
- new requests: increase favourable;
- completed sessions: increase favourable.

If prior value = 0:
- return absolute change / semantic delta;
- never emit an infinite or misleading percentage.

### Requests chart
Periods:
- 4w: four weekly buckets;
- 8w: eight weekly buckets;
- 12m: twelve calendar-month buckets.

Return:
- bucket start/end;
- count;
- whether current bucket;
- total selected-period requests;
- selected-period funnel/conversion summary.

### Funnel cohort
Cohort = requests whose submittedAt falls inside selected period.

For that cohort:
- received = all cohort requests;
- contacted = request has at least one recorded contact attempt;
- qualified = qualification result is qualified or qualified_with_conditions;
- converted = request has been converted to a subscription.

The stages are cumulative.
Global conversionRate = converted / received.
A request received in the selected period remains attributed to that cohort when it converts later; endpoint is evaluated as-of-now.

### Finance analytics
Server returns distinct authoritative XAF values:
- collectedXaf;
- dueXaf;
- futureXaf;
- overdueXaf;
- outstandingXaf.

Definitions:
- collectedXaf: effective net confirmed payment_received amount collected in the selected period after authoritative payment_correction effects;
- dueXaf: current active-plan remaining amount due exactly on current business date;
- futureXaf: current active-plan remaining amount due after current business date;
- overdueXaf: current active-plan remaining amount due before current business date;
- outstandingXaf: all current remaining obligation on authoritative active schedules.

Invariant:
- outstandingXaf = overdueXaf + dueXaf + futureXaf for current authoritative active schedules.

Exclude superseded/cancelled schedules.
Quotes, proofs and receipts never determine financial truth.

### Operational alerts
Derived read model only. No alerts table and no persisted notification.

Candidate groups:
- overdue follow-ups;
- requests still to contact;
- overdue installments;
- pending payment-proof review;
- quote/customer commercial action requiring coach attention where current quote state supports it;
- onboarding/preparation blockers;
- completion_due subscriptions.

Every alert:
- has stable kind/severity;
- contains safe display fields only;
- deep-links to the owner workspace/action;
- derives state from owner module policy/read model.

S7.2 remains responsible for persisted notifications and email reminders.

### UX-9c completion
Complete:
- requests chart;
- 4w/8w/12m selector;
- conversion header;
- four KPI sparklines;
- KPI period deltas;
- finance summary/workspace;
- operational alerts.

Do not add coach first name in S7.1.
Keep title `Bonjour`; displayName/session work remains V1.1.

### Persistence
Prefer zero schema change.
No KPI snapshot table unless current authoritative history cannot reconstruct a required historical stock safely. If such a blocker is discovered, stop and report before schema expansion.

### Validation requirements
At minimum:
- Africa/Libreville Monday/Sunday boundaries;
- current-week and previous-week delta boundaries;
- month/year rollover for 12m;
- end-of-week active-client stock;
- end-of-week overdue-follow-up stock;
- weekly request/session flows;
- cohort funnel stages;
- late conversion remains in original cohort;
- zero-denominator conversion and zero prior-period delta;
- payment corrections affect collectedXaf correctly;
- exact due-date boundary;
- superseded/cancelled plans excluded;
- outstanding = overdue + due + future;
- alerts reuse source state and deep-link correctly;
- no dashboard read writes to DB;
- no sensitive health/private-document content in dashboard payloads.

Fred approved this complete Gate 1. Implementation is authorized for S7.1 only. S7.2 remains closed until local validation.


## S7.1 feasibility blocker — cadence history

Historical status: **BLOCKED / GATE 1 AMENDMENT REQUIRED**, resolved by the approved amendment below.

The Reviewer confirmed that historical overdue-follow-up stock cannot always be reconstructed safely.

Why:
- effective cadence may resolve from mutable variant/service fallback policy;
- those policy values can be overwritten without preserved history;
- override audit is insufficient when the historical source was service/variant fallback;
- historical cadence cannot be inferred from the current fallback without risking false data.

No S7.1 implementation/migration/tests were performed after the blocker was found.

Recommended amendment:
1. add prospective effective-cadence history;
2. do not invent/backfill overwritten legacy fallback values;
3. return explicit historical availability metadata for overdue-follow-up series;
4. buckets whose cadence provenance is incomplete must be `unavailable`, not 0 and not computed from today's cadence;
5. current `/admin/today` overdue KPI remains unchanged and available;
6. once complete cadence history exists for a bucket, historical overdue stock is computed using the proven historical cadence.

S7.2 remains closed.


## S7.1 Gate 1 amendment — cadence history approved 2026-10-23

Status: **APPROVED_FOR_IMPLEMENTATION**.

### Reason for amendment

The original Gate 1 required historical overdue-follow-up stock to be reconstructed authoritatively. Review proved that mutable service/variant fallback cadence values were not historically preserved, so some legacy weekly states are unknowable.

### Approved cadence-history design

Add an append-only effective-cadence history for subscriptions.

Conceptual fields:
- id;
- subscriptionId;
- effectiveFrequencyDays nullable;
- source: override | variant | service | none;
- sourceServicePolicyId nullable when useful;
- effectiveFrom;
- effectiveTo nullable;
- createdAt.

The history records the resolved effective cadence at that time.

Do not merely reference mutable service/variant values.

### History writes

Create/transition cadence history whenever the effective cadence changes because of:
- subscription cadence override update;
- service/variant fallback policy update that changes the resolved cadence for a subscription;
- variant assignment change if such a path exists/is introduced;
- initial activation/initialization when cadence first becomes applicable;
- renewal/new subscription initialization.

Use explicit deterministic transitions and prevent overlapping effective ranges.

### Legacy treatment

Do not infer old fallback values from today's catalogue policy.

Migration may initialize one current row for existing applicable subscriptions from the current resolved cadence with:
- effectiveFrom = migration/application initialization time.

This establishes authoritative history only from that instant forward.

No historical backfill before that instant unless evidence already stored elsewhere proves the value.

### Historical KPI availability

Overdue-follow-up trend points change from plain number to availability-aware data.

Conceptual point:
- value: number | null;
- availability: complete | unavailable.

A historical bucket is `complete` only if the effective cadence can be proven for every subscription whose eligibility/activity could affect that bucket's overdue stock.

If cadence provenance is incomplete:
- value = null;
- availability = unavailable.

Never use:
- 0;
- today's cadence;
- nearest-known cadence;
as substitutes for missing history.

### Delta behavior

If current or previous comparison point is unavailable:
- delta is unavailable/null;
- client must not show a fabricated percentage/direction.

### Current dashboard

`GET /admin/today` current overdue-follow-up KPI remains unchanged and continues using the current authoritative S5.3 cadence resolution.

### UI

Sparkline:
- known points render normally;
- unavailable historical points render as gaps;
- tooltip/accessible label communicates `Historique indisponible`.

As authoritative history accumulates, unavailable legacy points naturally age out of the 8-week view.

### Migration authorization

The original zero-migration preference is amended.

One additive migration is authorized only for:
- effective follow-up cadence history;
- constraints/indexes required to preserve append-only/non-overlapping history.

No dashboard snapshot/cache/alert persistence table is authorized.

### Validation additions

Must prove:
- migration does not invent pre-migration history;
- initialization starts authority from the initialization timestamp;
- service fallback change closes old history and opens new resolved cadence history;
- variant fallback change likewise;
- override supersedes fallback correctly;
- clearing override returns to the then-current fallback and records a new history segment;
- `none` cadence is historically representable;
- historical overdue uses the correct cadence segment;
- legacy unknown bucket returns unavailable, not zero;
- delta involving unavailable point is unavailable;
- no overlapping history intervals per subscription;
- current S5.3 behavior is unchanged.

All other S7.1 Gate 1 rules remain locked.
S7.2 remains closed until S7.1 local validation.

## S7.1 execution and Gate 2 acceptance — 2026-10-23

- Delivered the approved analytics/alerts contracts, protected GET routes, batch historical readers and owner finance reuse, plus French TodayPage UX-9c. Existing current Today and agenda semantics remain unchanged.
- Fred additionally approved cumulative stage reach when a qualified/converted request has no separate contact-attempt record. No request workflow or source row was changed to enforce analytics ordering.
- The one approved migration is `0013_orange_metal_master.sql`, generated through the deterministic Drizzle wrapper with separately approved btree_gist/GiST exclusion support. Preflight found no prior history, 8 subscriptions, 2 applicable legacy subscriptions, 0 overrides, 4 valid policies and no duplicate policy scope. Application and guarded prospective initialization were separately approved against localhost:5433/kfit_dev; exactly 2 rows started at actual initialization time. Preserve cadence evidence before rollback; retain a shared extension.
- Resolved cadence values/sources are captured transactionally for override changes, lifecycle initialization/resumption, renewal, conversion and catalogue seeds. Writer fencing precedes owner row locks. No historical lookup substitutes today's policy for an unavailable interval.
- Agent-run typecheck/build/db:check/diff passed; server **523/523**, shared **56/56**. Latest PostgreSQL **541/542 passed, 1 failed, zero skips**; all **35 new cases passed** (17 cadence, 18 dashboard). The unchanged S6.3 payment-proof assertion at `payment-proofs.repository.integration.ts:152` assumes FIFO array order where the existing query breaks timestamp ties by UUID. This full-suite failure remains open; no test weakening or further retry after three actual failures. Earlier new fixture errors were corrected at the business-week boundary without changing assertions.
- Independent Reviewer: **REVIEW PASSED WITH NOTES**. Independent QA: **QA PASSED WITH LIMITATIONS**. No confirmed S7.1 defect. Agent browser/mobile/keyboard/navigation/tooltips were not runtime-validated. Actual catalogue-seed execution/concurrent seed-versus-override/activation paths were inspected but not directly exercised; helper atomicity and DB concurrency were tested.
- Fred Gate 2 is NOT yet confirmed in this chat. Browser/mobile/keyboard and DBeaver checks remain pending.
- Implementation commit: `ed1c7d0` — `feat(dashboard): add historical analytics and operational alerts`.
- Full PostgreSQL suite remains 541/542 because of the existing payment-proof allocation-order assertion. S7.1 cannot be closed until that suite is green and Fred completes human Gate 2.
- S7.2 remains closed.


## S7.1 closure — 2026-10-23

Status: **CLOSED / LOCALLY VALIDATED**.

Implementation:
- `ed1c7d0` dashboard analytics/alerts;
- `bb3ba76` deterministic finance allocation read ordering.

Evidence:
- server 523/523;
- shared 56/56;
- PostgreSQL 542/542;
- typecheck/build/db:check green;
- Reviewer PASSED WITH NOTES;
- QA PASSED WITH LIMITATIONS;
- Fred browser/mobile/keyboard and DBeaver checks all green.

The cadence-history amendment is validated:
- prospective initialization only;
- no invented legacy cadence;
- unknown historical follow-up points remain unavailable/null;
- no overlap/multiple-open interval issue observed in DBeaver.

S7.1 acceptance is satisfied. S7.2 planning may begin; implementation requires separate Gate 1 approval.


## S7.2 Gate 1 — approved 2026-10-23

Goal: persist internal operational notifications from authoritative source conditions and deliver privacy-safe optional email reminders/digests through a durable retryable outbox.

### Reused mechanisms
- S7.1 operational alert/source-condition derivation;
- Scheduled Business Jobs (KNW-45);
- Typed Settings (KNW-42);
- Sprint 0 node-cron/advisory-lock/scheduled_job_runs preflight;
- Nodemailer/SMTP/Mailpit foundation;
- Audit Event System;
- Shared API Contracts;
- Domain Error Taxonomy;
- Idempotent Business Command.

### Architectural ownership
- source module = business truth;
- notification = durable operational delivery/history;
- email = optional external side effect.

Notification processing never mutates the owner business state.

### Persistence

Proposed notification fields:
- id;
- recipientUserId;
- kind;
- severity;
- resourceType;
- resourceId;
- subscriptionId nullable;
- customerId nullable;
- title;
- summary;
- deepLink;
- dedupeKey;
- occurredAt;
- firstDetectedAt;
- lastDetectedAt;
- readAt nullable;
- resolvedAt nullable;
- createdAt;
- updatedAt.

Stable unique identity must prevent multiple open logical notifications for the same active condition.

Prefer a DB-level uniqueness strategy compatible with preserving resolved history.

### Notification lifecycle

Derived lifecycle:
- unread + unresolved;
- read + unresolved;
- resolved.

Read does not resolve.
Resolution occurs when authoritative condition is no longer active.
Historical resolved rows are preserved.

No V1 Core dismiss-forever semantics.

### Initial kinds
Closed vocabulary:
- follow_up_overdue;
- request_to_contact;
- installment_overdue;
- payment_proof_pending;
- preparation_blocked;
- completion_due.

Add quote_action_required only if implementation proves a single precise authoritative quote condition already exists. Otherwise leave it out.

### Dedupe examples
- follow_up_overdue:<subscriptionId>
- request_to_contact:<requestId>
- installment_overdue:<installmentId>
- payment_proof_pending:<proofId>
- preparation_blocked:<subscriptionId>
- completion_due:<subscriptionId>

Stable condition identity must not include mutable display strings.

### Recipients
V1 Core notifications target internal active admin/coach users who are authorized to use the operational workspace.

Internal email uses users.email only.

Do not send operational reminder emails to customer/prospect emails in S7.2.

### Email outbox

Proposed fields:
- id;
- notificationId nullable when message is digest-level;
- recipientUserId;
- toEmail;
- subject;
- bodyText;
- bodyHtml nullable;
- messageKind;
- dedupeKey;
- status;
- attemptCount;
- nextAttemptAt;
- lastAttemptAt nullable;
- sentAt nullable;
- providerMessageId nullable;
- lastErrorCode nullable;
- createdAt;
- updatedAt.

States:
- pending;
- sending;
- sent;
- failed;
- dead_letter.

Freeze exact delivery recipient/content in the row.

### SMTP failure semantics
Notification durability is independent of SMTP.

SMTP failure:
- notification remains present/unresolved as applicable;
- outbox records failure and retry schedule;
- no source business mutation.

Notification persistence/reconciliation failure:
- scheduled job records failed;
- do not silently send a standalone email without durable notification history.

### Retry policy
Use typed configuration.

Recommended bounded defaults:
- initial eligible delivery immediately/at digest schedule;
- retry +5m;
- +30m;
- +2h;
- +12h;
- then dead_letter.

The exact implementation may model these as retry delay list/max attempts, but must stay typed/validated.

### Settings
Use a closed typed registry.

Candidate keys:
- notifications.email.enabled
- notifications.follow_up_overdue.email_enabled
- notifications.request_to_contact.email_enabled
- notifications.installment_overdue.email_enabled
- notifications.payment_proof_pending.email_enabled
- notifications.preparation_blocked.email_enabled
- notifications.completion_due.email_enabled
- notifications.follow_up_overdue.reminder_days
- notifications.installment_overdue.reminder_days
- notifications.daily_digest.enabled
- notifications.daily_digest.hour
- notifications.email.max_attempts / retry policy configuration if exposed.

Every setting:
- declared type;
- default;
- validator;
- sensitivity;
- scope/owner.

Unknown keys rejected.

V1 Core uses global operational settings. No per-user preference matrix unless implementation proves it is required.

### Default delivery policy
Dashboard/in-app notification center is primary.

Normal operational alerts should preferentially be summarized in one daily digest rather than create email spam.

Default digest:
- enabled;
- 08:00 Africa/Libreville;
- French;
- safe counts/summaries + K'FIT deep links.

Repeated unresolved reminders may become email-eligible again only according to configured reminder_days and stable reminder-window dedupe.

A 15-minute reconciliation job must not create repeated emails for the same logical reminder window.

### Privacy
Email/notification safe fields may include:
- customer display name where operationally necessary;
- subscription/reference;
- alert kind;
- safe date/due time;
- deep link.

Exclude:
- health questionnaires;
- progress measurements;
- private documents;
- payment external references;
- proof filenames/content;
- coach private notes;
- legal consent text;
- secure bearer tokens.

### Scheduled jobs
Use coordinated jobs, not uncoordinated cron side effects in each API replica.

Jobs:
- notifications.reconcile
- notifications.email-delivery

Suggested wake cadence:
- reconcile every 15 minutes;
- delivery every 5 minutes.

Each logical run:
- stable runKey;
- PostgreSQL advisory ownership;
- scheduled_job_runs outcome/attempt/error metrics;
- retry-safe effects.

### Reconciliation behavior
One reconciliation:
1. discover current authoritative source conditions using owner policies/read models;
2. compute target internal recipients;
3. upsert/open notification by stable dedupe;
4. update lastDetectedAt;
5. resolve prior open notifications whose conditions disappeared;
6. determine whether digest/reminder delivery is newly due;
7. create outbox rows using stable delivery dedupe keys;
8. commit durable changes.

Do not send SMTP inside the reconciliation transaction.

### Email delivery worker
1. claim due pending/failed rows safely;
2. prevent two workers from sending same row concurrently;
3. mark sending;
4. send through generic notification mail delivery;
5. mark sent + provider message ID;
6. on safe/transient error mark failed + nextAttemptAt;
7. after bounded attempts mark dead_letter.

A sent row is never automatically resent.

### Digest
Daily digest groups active unresolved notifications for one recipient.

Suggested subject:
K'FIT — Actions à traiter

Example safe body:
- 3 suivis en retard
- 2 demandes à contacter
- 1 échéance en retard
- 2 justificatifs à vérifier

Prefer counts/links and minimal display data.

Digest delivery dedupe must be stable per recipient + Libreville business date.

### API
Admin:
- GET /admin/notifications
- GET /admin/notifications/unread-count
- POST /admin/notifications/:notificationId/read
- POST /admin/notifications/read-all
- GET /admin/notification-settings
- PUT /admin/notification-settings

Optional scoped operations if implementation remains small:
- GET /admin/notification-email-outbox
- POST /admin/notification-email-outbox/:outboxId/retry

No generic notification content/status PATCH.

### UI
Add notification center/bell to existing admin shell.

Required UX:
- unread badge;
- unresolved/recent list;
- mark one read;
- mark all read;
- resolved/history pagination;
- deep-link navigation;
- French labels;
- keyboard/mobile/focus support.

Add small notification settings UI for approved typed keys.

If an outbox troubleshooting surface is added, keep it operational/simple; do not build a full mail administration application.

Design reference (validated by Fred 2026-10-23, UI only — no scope change): canvas « K'FIT — Refonte UI », boards 12 (desktop panel from the bell, tabs « À traiter » / « Résolues », « Tout marquer comme lu », no dismiss), 12b (mobile full-screen sheet) and 12c (« Réglages » page under Configuration in the sidebar: in-app always on, e-mail master switch, daily digest + hour, per-kind reminders with « tous les N jours » only where a reminder_days key exists). Rows show only the safe fields above; until readable references exist, show the offer name instead of the raw reference. Board switch states and day values are examples: defaults come from the settings registry. Badge = unread unresolved count. Reuse the kit (`Button`, `SegmentedControl`, `Switch`, `Field`, `Dialog`/popover, toasts). Notion: UX-16.

### Audit
Generic structural audit candidates:
- notification.read
- notification.read_all
- notification.settings_updated
- notification.email_retry_requested

Avoid flooding generic audit with every scheduled reconciliation/send outcome; scheduled_job_runs/outbox are their durable operational evidence.

Never audit:
- full email body;
- bearer;
- private customer notes;
- health content;
- payment external reference.

### Expected migration
Additive S7.2 migration is expected for:
- notifications;
- notification email outbox;
- notification settings storage if no generic typed-setting store exists;
- required unique/index/check/FK constraints.

Do not alter business-domain tables just to support notifications.

### Validation
Mandatory:
- duplicate reconciliation -> one open logical notification;
- condition disappearance -> resolvedAt, history preserved;
- read does not resolve;
- rereconcile read/unresolved notification does not duplicate;
- new logical recurrence after prior resolution follows deterministic dedupe/generation rule;
- email disabled -> notification still created;
- category email disabled -> notification still created;
- SMTP failure -> notification preserved + retry row;
- retry sends once and transitions sent;
- concurrent delivery workers do not double-send;
- sent row not resent;
- bounded attempts -> dead_letter;
- scheduler advisory lock prevents duplicate replica logical execution;
- stable job/run outcomes;
- daily digest runs for 08:00 Africa/Libreville business date;
- digest one per recipient/date;
- reminder-days dedupe;
- unknown settings rejected;
- invalid hour/retry/reminder values rejected;
- inactive/archived recipients excluded;
- privacy-safe notification/email payload;
- no business state mutation;
- existing S7.1 derived alerts remain valid;
- Mailpit runtime acceptance receives expected French digest/reminder;
- browser notification center/settings responsive + keyboard accessible.

Fred approved this complete Gate 1. Implementation is authorized for S7.2 only. S7.3 remains closed until Fred local validation.

## S7.2 execution — 2026-10-24 (Claude)

Delivered as S7.2a (server) and S7.2b (client, UX-16). Pending Fred local validation.

Defaults chosen inside the approved registry (to confirm):
- e-mail master on; daily digest on at 08:00 Africa/Libreville;
- per-kind e-mails off for all 7 kinds (digest is the default channel, avoids spam);
- reminder_days: follow_up_overdue 3, installment_overdue 7 (1–30);
- quote_action_required kept (S7.1 derives it precisely from quotes « changes_requested »), with its own e-mail key;
- recipients = active, non-archived admin users (the coach workspace is admin-only today);
- retry +5m/+30m/+2h/+12h then dead_letter (5 attempts, code constant, not exposed as a setting);
- a row stuck in « sending » > 30 min goes to dead_letter (SENDING_INTERRUPTED), never auto-resent;
- optional outbox list/retry endpoints not built (no notification.email_retry_requested audit yet).

Evidence (scratch worktree on origin/main 733020e, local PostgreSQL 5433):
- server tsc clean; unit 545 (2 Chromium PDF tests fail locally without browser, unrelated);
- integration 553/553 incl. notifications.repository.integration (Gate 1 validation list: dedupe, concurrent reconcile,
  resolution history, read ≠ resolve, recurrence, e-mail/category off, reminder windows, digest 08:00 + one per date,
  SMTP retry, SKIP LOCKED claims, sent never resent, dead letter, advisory-locked job runs, inactive/archived/coach excluded,
  privacy-safe payloads, no business mutation);
- runtime: dev API with jobs + SMTP sink received the French digest (« K'FIT — Actions à traiter », 2 demandes à contacter);
- browser (1440/390, real API): bell badge, panel, mark one/all read, resolved tab, deep link, Escape returns focus,
  Réglages save/reload/validation (45 days rejected client-side; server rejects too).

Known limits: reminders verified by integration, not by the SMTP sink run; jobs start from the dev API entrypoint
(no production entrypoint before Sprint 9); `KFIT_NOTIFICATION_JOBS=off` disables them.

## S7.3 Gate 1 — approved 2026-10-25

Status: APPROVED_FOR_IMPLEMENTATION (S7.3a server first, S7.3b client after validation).

Goal: let the admin irreversibly de-identify an archived customer or prospect, protect scopes under retention holds, purge
the private files the anonymization releases, and make every executed privacy action replayable after a restore (feeds S7.4).

### Business rules (Fred 2026-10-25)

Approved: rules 2 (sensitive-action e-mail OTP + typed confirmation, irreversible), 3 (scope, with D2), 4 (controlled
immutability exception), 5 (holds win), 6 (purge job, with D3), 7 (replay log, with D11), 8 (audit), 9 (out of V1, D4).

Rule 1 amended (D6): anonymization is manual only, on an archived customer or prospect; no automatic time-based
anonymization in V1; no retention-duration keys — only `privacy.purge.delay_days` is added to the settings registry.

Compliance (legal sign-off before production, not before coding): Gabon loi n°001/2011 / CNPDCP, health-data
sensitivity, OHADA retention of accounting records (≈10 years, to verify). Rule 3 assumes de-identified financial rows
are acceptable to keep.

### Findings from the codebase (2026-10-25)

- `retention_holds` and `anonymization_events` already exist (migration 0000, `db/schema/operations.ts`), with free-text
  statuses and only a scope/subject index. `retentionHoldStatuses = ["active","released"]` exists in `db/enums.ts`.
- `customers` and `prospects` already have `archived_at` and `anonymized_at`, but **no code writes either column**:
  there is no way to archive a customer or prospect today, so rule 1 has no eligible subject yet (D1).
- Readers already hiding archived/anonymized customers: `customers.repository.ts` (`active` filter), dashboard
  `alerts.repository.ts`, `analytics.repository.ts`. Nothing reads `prospects.archived_at/anonymized_at`
  (admin requests list shows `prospects.full_name` unfiltered).
- `documents.status` already supports `pending_purge`/`purged` and `documents.purge_after` exists, but nothing sets
  them. `documents.repository.ts` already refuses access and status changes for `pending_purge`/`purged`.
  `PrivateDocumentStorage.remove(key)` exists (`rm force`, idempotent).
- Invariant 7 (submitted questionnaire revisions and consents immutable) is enforced by the absence of any update path,
  not by a DB trigger or check.
- Customer names are copied into `receipts.snapshot_json`, `quote_versions` snapshots and their PDFs, and into
  `notifications.customer_display_name/title/summary` + `notification_email_outbox.body_text/body_html`.
- The S7.2 settings registry (`packages/shared/src/notifications/contracts.ts`) is notification-scoped
  (`NotificationSettingKey`, `sensitivity: "operational"`); privacy keys need it widened, not duplicated.
- `runScheduledJob` / job starter (`notifications/jobs/scheduled-job.runner.ts`) are generic enough to reuse as-is.
- Fresh step-up: `isFreshOtp(consumedAt, now, AUTH_FRESH_OTP_WINDOW_MS = 10 min)` already gates questionnaire answers
  (UX-14c); the OTP is e-mailed by `SensitiveActionOtpService`.

### PII / health inventory

Categories: identity / health / financial / technical. Actions: null / replace / redact (free text → null or fixed
marker) / keep / purge (document → `pending_purge`). Redaction marker (D2): free text → NULL when nullable, else
`REDACTED_TEXT = "[effacé]"`; JSON → `{}` (or `[]` for arrays) when NOT NULL.

| table.column | category | action on anonymize | rationale |
| --- | --- | --- | --- |
| customers.full_name | identity | replace « Client anonymisé · XXXX » | rule 3; NOT NULL; XXXX = first 4 hex of sha256(id), uppercase (D2a) |
| customers.whatsapp | identity | replace placeholder `anon-<id>` | rule 3; NOT NULL, indexed — placeholder, no column change (D2a) |
| customers.email, city | identity | null | rule 3 |
| customers.country, preferred_contact_channel | identity (weak) | keep | not identifying alone; country kept (D2g) |
| customers.anonymized_at | technical | set now | marker read by every filter |
| prospects.full_name, whatsapp, email, city | identity | as customers | source prospect anonymized with the customer (D8) |
| prospects.source | technical | keep | marketing attribution |
| service_requests.objective, message | health / identity free text | redact | free text from the prospect (D2e) |
| service_requests.submission_token | technical | keep | not personal |
| contact_attempts.note | identity free text | redact | coach notes about the person (D2e) |
| qualification_reviews.suitability_note, conditions_json, blockers_json | health free text | redact | may hold health remarks (D2e) |
| waitlist_entries.priority_note | free text | redact | D2e |
| questionnaire_answers.answer_json | health | redact (rule 4 exception) | rule 3 health free text |
| questionnaire_submissions.* | technical | keep | dates/status only |
| medical_clearance_records.note | health | redact | D2g |
| consent_records.verification_metadata_json | technical / identity | redact | rule 3 "consent free text"; decision + dates kept as proof |
| consent_records.decision, captured_at, definition id | legal fact | keep | proof of consent history |
| progress_measurements.feeling_note | health | redact | rule 3 measurement notes |
| progress_measurements.weight_kg, waist_cm, hips_cm, chest_cm, body_fat_estimate | health | null | numeric health data (D2b) |
| progress_photos → documents | health | purge | rule 3 (D3) |
| goals.label, baseline/target values | health | keep | D2g |
| follow_ups.note, next_action | health free text | redact | rule 3 follow-up notes |
| appointments.reschedule_note, location_or_channel | free text | redact | D2g |
| subscription_pauses.reason, subscription_status_history.reason, onboarding_items.waiver_reason, component_events.reason | free text | redact | D2g |
| subscriptions.*, payment_plans.*, installments.*, payment_allocations.* | financial | keep | rule 3 financial facts |
| payment_events.amount/method/dates | financial | keep | rule 3 |
| payment_events.external_reference, metadata_json | financial | keep | accounting reconciliation (D2c) |
| payment_proofs.claimed_*/confirmed_* | financial | keep | rule 3 |
| payment_proofs.customer_message, review_note | free text | redact | written by/about the person (D2c) |
| payment_proofs → documents (proof files) | financial evidence | keep (not pending_purge) | payment evidence (D2c) |
| quotes.*, quote_versions.amount/terms, quote_number | financial | keep | rule 3 |
| quote_versions.service_snapshot_json + PDF (customerName) | financial document | keep | issued accounting document (D2d) |
| receipts.receipt_number, amounts, snapshot_json (customerName) + PDF | financial document | keep | issued accounting document (D2d) |
| documents (sensitivity private / sensitive_health, owner subscription) | health / private | purge | rule 3 (D3) |
| document_versions.original_filename | identity (may contain name) | deleted with purge | D3 |
| secure_access_tokens (hashes) | technical | revoke active tokens, keep rows | stop outstanding links; hashes only |
| external_access_events, audit_events (ip/ua hashes) | technical | keep | hashed, audit trail |
| notifications.customer_display_name, title, summary | identity copy | replace with pseudonym | D2f |
| notification_email_outbox.body_text, body_html | identity copy | redact; pending/sending rows → dead_letter | D2f |
| users.* | staff | out of scope | not a data subject of this feature |

### Reused mechanisms

- Sensitive-action OTP (`SensitiveActionOtpService`) + `isFreshOtp` window (UX-14c pattern).
- S7.2 `runScheduledJob` / job starter, `scheduled_job_runs`, `KFIT_*_JOBS=off` kill-switch pattern.
- S7.2 typed settings registry + `operational_settings` table (widened to a closed union of notification + privacy keys).
- `AuditService`, X-Request-Id UUID guard (notifications router), Shared API Contracts, Domain Error Taxonomy.
- Advisory-lock decision (decisions.md, `customer-whatsapp:<normalized>`), `PrivateDocumentStorage.remove`.

### Architectural ownership

shared `privacy/contracts.ts` (routes, error codes, settings keys, DTOs) → `modules/privacy/repositories/privacy.repository.ts`
(transactions, locks, table writes) → `privacy.policy.ts` (pure: eligibility, hold check, pseudonym, column plan as named
constants) → `anonymization.service.ts`, `retention-hold.service.ts`, `privacy-purge.job.ts`, `privacy-replay.ts` →
`privacy.controller.ts` (admin session + fresh OTP + typed reference) → `express-privacy.router.ts`, registered in
`app.ts`, composed in `dev-app.ts`. The column plan (table → columns → action) is one declarative constant used by
both anonymize and replay.

### Persistence — migration 0015 (small, additive)

Tables exist; only constraints/indexes are missing:
- partial unique index `anonymization_events_subject_executed_uq` on (subject_type, subject_id) where status = 'executed'
  (one executed anonymization per subject; replay idempotency);
- check constraints: `retention_holds.status in ('active','released')`, `anonymization_events.status in ('executed')`
  `subject_type in ('customer','prospect')`, `scope_type in ('customer','prospect','document')`,
  `hold_type in ('legal','dispute','accounting')` (D7);
- index `documents_purge_due_idx` on (status, purge_after) for the purge job (D3);
- no column change (WhatsApp placeholder, D2a).

Existing-row check before the checks: `select status, count(*) from retention_holds group by 1` and same for
`anonymization_events` (expected 0 rows locally). Rollback: drop the index/constraints (no data change).

### Anonymization transaction (customer; prospect is the same minus subscriptions)

One transaction, fixed lock order:
1. `pg_advisory_xact_lock(hashtextextended('privacy-subject:<type>:<id>', 0))` — also taken by hold create/release.
2. `select … for update` on the subject row; refuse `PRIVACY_SUBJECT_NOT_FOUND`, `PRIVACY_SUBJECT_NOT_ARCHIVED`;
   already anonymized → idempotent success returning the existing event (double submit / retry).
3. Active hold check on the subject scope and its documents (D7) → `PRIVACY_RETENTION_HOLD_ACTIVE`.
4. Source prospect locked next (customer → prospect order) and anonymized with its requests (D8).
5. Apply the column plan table by table in a fixed order (identity → prospect free text → health → notes →
   notifications/outbox → documents to `pending_purge` with `purge_after` → revoke active secure tokens), collecting
   `{table, columns[], rows}`.
6. Insert `anonymization_events` (status executed, executed_by, metadata = column plan touched + counts, no values) and
   the `privacy.subject_anonymized` audit event.
7. Commit. Any failure rolls back everything (atomicity test). Journal append after commit (D11).

Rule 4: only this repository method writes `questionnaire_answers` / `consent_records` after submission; no other module
gains an update path (a test asserts the other repositories expose none).

### Hold rules (rule 5)

- Admin-only create/release; same subject advisory lock as anonymization, so a hold created concurrently either lands
  before (anonymize refused) or after (subject already anonymized).
- Fields: scope_type (`customer` | `prospect` | `document`, D7), scope_id, hold_type (`legal` | `dispute` | `accounting`, D7), reason (admin free text, never
  copied into audit/logs/notifications), status, started/released by/at. Release is one-way.
- Duplicate active hold for the same scope + type → `PRIVACY_HOLD_ALREADY_ACTIVE`.

### Purge job (D3)

- Job key `privacy.purge`, daily 03:00 Africa/Libreville, `windowRunKey` per business day, advisory lock via the runner,
  kill switch `KFIT_PRIVACY_JOBS=off`.
- Batch 50 documents `where status = 'pending_purge' and purge_after <= now()` ordered by purge_after, `for update skip
  locked`, hold re-checked per document (hold on document or its owner subject → skipped, counted).
- Order per document: delete storage objects first (document already inaccessible), then in one transaction delete
  `document_versions`, set `current_version_id = null`, status `purged` (tombstone row kept). A crash between the two
  steps leaves a `pending_purge` row whose files are gone; the next run deletes again (`rm force` is idempotent) and
  commits.
- Result counts only: `{scanned, purged, skippedHold, failed}`; failures leave the row for the next day.
- purge_after = anonymization time + `privacy.purge.delay_days` (default 30) (D3c). Proof files are never marked (D2c).

### Replay CLI (rule 7, D11)

- `npm run privacy:replay -- --since <iso>` (server script, local DB guard like the integration tests).
- Idempotency key = `anonymization_events.id`; the column plan is deterministic (pseudonym derived from the subject id),
  so re-applying to an already-anonymized row converges; replay twice = same end state.
- Replay also re-marks the subject's documents `pending_purge` and runs the purge pass for them (restored files deleted).
- Runs before traffic is reopened (S7.4 restore runbook). Writes one `privacy.replay_run` audit event with counts.
- Source of events: off-database journal ∪ DB events, dedupe by eventId (D11); `privacy:journal-sync` backfills the journal.

### Settings (rules 1, 6)

Closed registry keys, all `sensitivity: "privacy"`, `scope: "global"`:
- `privacy.purge.delay_days` — integer 1–365, default 30 (D3c, D6). No retention-duration keys (D6).

### API

All admin-session + CSRF + same-origin (mutations); `Cache-Control: no-store`.

| Method | Path | Step-up | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | /admin/customers/:customerId/archive | no | 200 | PRIVACY_SUBJECT_NOT_FOUND, PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION (D1) |
| POST | /admin/prospects/:prospectId/archive | no | 200 | PRIVACY_SUBJECT_NOT_FOUND, PRIVACY_SUBJECT_HAS_OPEN_REQUEST (D1) |
| POST | /admin/customers/:customerId/anonymize | fresh OTP + `{ confirmName }` (D9) | 200 `{ anonymizationEventId, executedAt }` | AUTH_FRESH_OTP_REQUIRED, PRIVACY_CONFIRMATION_MISMATCH, PRIVACY_SUBJECT_NOT_FOUND, PRIVACY_SUBJECT_NOT_ARCHIVED, PRIVACY_RETENTION_HOLD_ACTIVE |
| POST | /admin/prospects/:prospectId/anonymize | same | same | same |
| GET | /admin/retention-holds?scopeType&scopeId | no | 200 list | PRIVACY_INVALID_INPUT |
| POST | /admin/retention-holds | no | 201 | PRIVACY_INVALID_INPUT, PRIVACY_SUBJECT_NOT_FOUND, PRIVACY_HOLD_ALREADY_ACTIVE |
| POST | /admin/retention-holds/:holdId/release | no | 200 | PRIVACY_HOLD_NOT_FOUND, PRIVACY_HOLD_ALREADY_RELEASED |
| GET/PUT | existing settings endpoint, widened registry | no | 200 | unknown key / invalid value |

Unexpected → `PRIVACY_ROUTE_UNEXPECTED_FAILURE` (500), logged as error type + SQLSTATE only.
Typed confirmation = the subject's full name as displayed, compared after trim + NFC + collapsed whitespace, case-sensitive (D9).

### UI (S7.3b, French)

- Fiche client, menu ⋯: « Archiver le client » (D1); when archived: « Anonymiser… ». Dialog: « Cette action est
  irréversible. L'identité et les données de santé de ce client seront effacées ; les paiements, devis et reçus sont
  conservés. » → field « Saisis le nom {NOM} pour confirmer » → step « Code envoyé à ton adresse e-mail » (reuse the
  AnswersSheet OTP step) → « Anonymiser définitivement ». Refusal for an active hold: « Un blocage de conservation est
  actif sur ce client. Lève-le avant d'anonymiser. »
- Card « Blocages de conservation » on the fiche: list, « Ajouter un blocage » (type + motif), « Lever le blocage »
  (confirmation).
- Anonymized customer: header « Client anonymisé · XXXX », health tabs replaced by « Données effacées le {date} ».
- Configuration › Réglages: section « Confidentialité » — « Délai avant suppression des fichiers (jours) ».
- Desktop + 390 px, keyboard, focus return (S7.2b patterns).

### Audit (rule 8)

`privacy.subject_archived`, `privacy.subject_anonymized`, `privacy.hold_created`, `privacy.hold_released`,
`privacy.purge_run` (one per run, counts), `privacy.replay_run`. Metadata: IDs, subject/scope type, hold type,
table/column names, counts. Never: names, WhatsApp, e-mail, hold reason, free-text values, storage keys, filenames.

### Privacy of logs and metadata

- `anonymization_events.metadata_json` = `{ planVersion, tables: [{ table, columns, rows }], documentsMarked, tokensRevoked }`.
- Job results and CLI output: counts only. Router errors: type + SQLSTATE (S7.2 pattern).
- The pseudonym « Client anonymisé · XXXX » must not be derivable back to the person (XXXX from sha256(subject id), D2a).

### Validation

- Unit (policy): eligibility matrix, hold blocks, pseudonym determinism, column plan covers every inventory row marked
  non-keep, confirm-reference comparison, settings validation.
- Express HTTP: auth/CSRF/origin, fresh OTP missing/expired → 403 `AUTH_FRESH_OTP_REQUIRED`, mismatch → 400, error
  mapping, request-id guard, no PII in 500 bodies.
- PG integration (5433): hold blocks anonymize and purge; atomic rollback on mid-way failure (proxy-injected failure
  like the receipts tests); financial rows byte-identical after anonymize; immutable-record writers still refuse;
  anonymized subject hidden from customer list/search/analytics/alerts/notifications; concurrent anonymize + hold create
  serialize; double submit idempotent; purge only after passed purge_after, idempotent, skips holds; replay twice = same
  state; audit rows present with no PII (assert no fixture name/WhatsApp/e-mail string in audit/metadata JSON).
- `drizzle-kit migrate` on a fresh DB and on the seeded demo DB.
- Browser (S7.3b): desktop + 390 px flow archive → anonymize with Mailpit code; hold add/release; Réglages section.

### Risks

- Rule 7 vs restore: events newer than the backup survive only in the off-database journal (D11); a journal append that fails
  after commit must be backfilled with `privacy:journal-sync`.
- Over-wiping a column the business still needs (or under-wiping a free-text column holding health data) — inventory
  review by Fred is the control.
- Names inside issued receipt/quote PDFs survive anonymization (D2d); needs legal confirmation.
- Readers that do not yet filter `anonymized_at` (requests list for prospects) would show the pseudonym, not hide it.
- Purge deletes files irreversibly; a wrong `purge_after` or missing hold check destroys evidence — covered by tests
  and the default-off kill switch in non-dev environments.

### Slice plan

- **S7.3a server** (≈ 1 500–2 000 lines incl. tests): shared `privacy/contracts.ts` (+ settings registry widening);
  migration 0015; `modules/privacy/` (repository, policy, services, purge job, controller, router); archive writers
  (D1); reader updates for prospects; `scripts/privacy/replay.mjs` + `privacy:replay` script; `app.ts`, `dev-app.ts`,
  `api-server.mjs` (job start). Tests: `privacy.policy.test.ts`, `privacy.express.test.ts`,
  `privacy.repository.integration.ts`, `privacy-purge.integration.ts`, `privacy-replay.integration.ts`.
- **S7.3b client** (≈ 600–900 lines): fiche client actions + anonymize dialog with OTP step, holds card, anonymized
  customer view, Réglages « Confidentialité », API client + error messages. Acceptance: typecheck + build + browser.

### Decisions (Fred 2026-10-25)

D1. Add « Archiver » for customers and prospects. Customer: refused while any subscription is active/onboarding/paused (PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION). Prospect: refused while any request is open (PRIVACY_SUBJECT_HAS_OPEN_REQUEST). No unarchive in S7.3 (backlog item).
D2. Rule 3 scope approved with:
  a. Pseudonym « Client anonymisé · XXXX », XXXX = first 4 hex of sha256(subject id), uppercase. WhatsApp → placeholder `anon-<subject id>` (no column change).
  b. Numeric measurements (weight_kg, waist_cm, hips_cm, chest_cm, body_fat_estimate) → null.
  c. payment_events.external_reference + metadata_json kept; payment_proofs.customer_message + review_note redacted; proof files KEPT (not pending_purge).
  d. Customer name kept inside issued receipt/quote snapshots and PDFs (accounting documents — legal to confirm).
  e. Prospect free text redacted: service_requests.objective/message, contact_attempts.note, qualification_reviews.suitability_note/conditions_json/blockers_json, waitlist_entries.priority_note.
  f. notifications.customer_display_name/title/summary → pseudonym; notification_email_outbox body_text/body_html redacted; pending/sending rows → dead_letter.
  g. Other free text redacted: appointments.reschedule_note/location_or_channel, subscription_pauses.reason, subscription_status_history.reason, onboarding_items.waiver_reason, component_events.reason, medical_clearance_records.note. goals and country kept.
  Redaction marker: free text → NULL when nullable, else the constant REDACTED_TEXT = "[effacé]"; JSON → {} (or [] for arrays) when NOT NULL.
D3. Purge (rule 6 approved with): (a) only anonymization marks documents pending_purge in V1; (b) storage deleted before the DB tombstone commit; (c) purge_after = anonymization time + privacy.purge.delay_days (default 30); (d) daily 03:00 Africa/Libreville, batch 50.
D4. Out of V1 confirmed: self-service erasure/export, automatic expiry, bulk anonymization.
D5. Anonymized subjects hidden from named lists, search, alerts, notifications; their payments still count in revenue aggregates.
D6. No inert retention-duration keys. Only privacy.purge.delay_days (integer 1–365, default 30) is added to the widened settings registry. Rule 1 amended accordingly.
D7. Hold scopes = customer | prospect | document. Hold types = legal | dispute | accounting.
D8. Anonymizing a customer also anonymizes its source prospect and that prospect's requests, same transaction (lock order customer → prospect).
D9. Typed confirmation = the subject's full name as currently displayed. Compare after trim + Unicode NFC + collapse inner whitespace, case-sensitive. Mismatch → PRIVACY_CONFIRMATION_MISMATCH. The typed value is never logged or audited.
D10. Already anonymized → idempotent 200 returning the existing event.
D11. Off-database journal: after commit, append one JSON line per executed event to `${KFIT_PRIVACY_JOURNAL_DIR}/privacy-journal.jsonl` (fields: eventId, subjectType, subjectId, executedAt, planVersion, linkedSubjects; no PII), with fsync. Append failure after commit → log error type only; the DB event stays. Add `npm run privacy:journal-sync` (appends DB events missing from the journal, dedupe by eventId). `privacy:replay -- --since <iso>` reads journal ∪ DB events, dedupe by eventId. Env var missing → journal disabled with a startup warning in dev; document it in .env.example (no values printed).
D12. Purge job starts only from the dev entrypoint and honours KFIT_PRIVACY_JOBS=off (same as S7.2). Production enablement = S7.4.

D1 precision (Fred 2026-10-25, asked during S7.3a): a customer is archivable only when every subscription is `completed` or
`cancelled`; `awaiting_payment`, `medical_clearance_required`, `ready_to_start` and `completion_due` also refuse with
PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION. A prospect is archivable only when every request is terminal (`rejected`,
`abandoned`, `converted`, `closed_duplicate`).

## S7.3a execution — 2026-10-25 (Claude)

Delivered: S7.3a server only, uncommitted, pending Fred local validation. S7.3b (client) is a separate brief.

Evidence (local PostgreSQL 5433, `kfit_dev`):
- tsc clean for shared, server, client; `npm run db:check` clean.
- shared tests 59 → 62; server unit 545 → 569 (privacy policy 7, immutability scan 1, express 12, journal/job 4);
  integration 553 → 566 (`privacy.repository.integration` 13). No residue left in `kfit_dev` after the suites.
- Migration `0015_lethal_the_liberteens.sql` (generated with `npm run db:generate`; the only wrapper in the repo is the
  cadence-specific one): partial unique index `anonymization_events_subject_executed_uq` + 5 checks (hold status/scope/type,
  event status/subject type). Existing-row check before: 0 holds, 0 events. Applied on a fresh scratch DB
  (`kfit_s73_fresh`, left in place — dropping a DB is a never-tier command) and on `kfit_dev`: 16 migrations each.
- `documents_status_idx` (status, purge_after) already existed, so Gate 1's "documents purge index" needed no migration.

Defaults: `privacy.purge.delay_days` = 30 (1–365, sensitivity privacy, widened S7.2 registry); purge job `privacy.purge`
daily 03:00 Africa/Libreville, run key = Libreville business date, batch 50; `KFIT_PRIVACY_JOBS=on`;
`KFIT_PRIVACY_JOURNAL_DIR` empty by default (journal disabled, startup warning). Both documented in `.env.example`.

Implementation notes (within Gate 1 / D1–D12):
- One declarative `ANONYMIZATION_PLAN` (policy) drives anonymize and replay; a unit test proves it covers every non-keep
  inventory row and touches no kept financial column.
- Pseudonyms derive from each row's own id: the customer row from the customer id, the linked prospect from the prospect id;
  notifications take the subject's pseudonym in `customer_display_name`, `title` and `summary` (D2f, literal).
- An already-anonymized subject returns the existing event before any archived/confirmation/hold check (D10); archiving an
  archived subject returns its original `archivedAt`.
- Replay keeps the original `anonymized_at`; documents restored as available are re-marked with `purge_after = now` and
  purged at once; documents still `pending_purge` in the restored DB keep their schedule.
- The S7.2 job starter gained optional `timezone` and `runKey` (reuse, no second runner).
- Admin request queue hides anonymized prospects (D5); customers list/search, alerts and analytics lists already filtered;
  analytics finance still counts every subscription (D5 revenue). Open notifications of an anonymized customer are redacted
  at once and resolved by the next S7.2 reconcile (the alert source excludes the subject).

Known limits:
- `privacy:replay` and `privacy:journal-sync` refuse any database other than the local 5433 one until S7.4.
- Purge job starts only from the dev entrypoint (D12).
- S7.3b must add Vite proxy entries for `/admin/prospects` and `/admin/retention-holds` (`/admin/customers` exists).
- No unarchive (D1 backlog). Names inside issued receipt/quote PDFs are kept (D2d, legal to confirm).

Manual validation (Fred):
1. `npm run db:migrate`, restart `npm run dev:api`: startup shows the privacy journal warning unless
   `KFIT_PRIVACY_JOURNAL_DIR` is set; set it to a local folder outside the repo and restart.
2. Pick a customer whose subscriptions are all completed/cancelled: `POST /admin/customers/:id/archive` (CSRF headers as the
   UI sends them) → 200; with an unfinished subscription → 409.
3. `POST /auth/otp/sensitive-action` → code in Mailpit (http://localhost:8025) → `POST /auth/otp/sensitive-action/verify`
   `{ "code": "…" }` → then `POST /admin/customers/:id/anonymize` `{ "confirmName": "<exact displayed name>" }` → 200;
   wrong name → 400; after 10 minutes without a new code → 403.
4. DBeaver: `customers`/`prospects` row shows « Client anonymisé · XXXX », `anon-<id>`, null e-mail/city;
   `questionnaire_answers.answer_json` = `{}`/`[]`; `documents` of the subscription = `pending_purge` with `purge_after` +30 d;
   `payment_events`/`payment_allocations`/`installments` unchanged; one `anonymization_events` row (metadata = tables/columns/counts);
   `audit_events` `privacy.*` rows with IDs/counts only; one line in `<journal dir>/privacy-journal.jsonl`.
5. `POST /admin/retention-holds` on another archived customer, then anonymize → 409 `PRIVACY_RETENTION_HOLD_ACTIVE`;
   release → anonymize succeeds.
6. `npm run privacy:journal-sync` → `{ appended: 0 }`; `npm run privacy:replay -- --since <ISO before step 3>` → `replayed: 1`, no change.

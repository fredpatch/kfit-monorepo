# K'FIT — Sprint 7 execution spec

## Objective

Deliver the V1 Core operational layer: dashboard KPIs and alert workspaces, notification engine, retention/anonymization, backup/restore readiness and remaining hardening before Sprint 8 UAT.

## Ordered tasks

1. S7.1 — Core dashboard KPIs and operational alert workspaces — CLOSED / validated 2026-10-23.
2. S7.2 — Dashboard and email notification engine with configurable reminders — CLOSED / validated 2026-10-25.
3. S7.3 — Retention, anonymization, soft-delete purge and privacy-action replay — APPROVED_FOR_IMPLEMENTATION (Gate 1 approved 2026-10-25; S7.3a server in progress).
4. S7.4 — Backup/restore and production-hardening acceptance — APPROVED_FOR_IMPLEMENTATION (Gate 1 approved 2026-10-26, D1–D11; S7.4a in progress)

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

## CONS-02 Gate 1 — approved 2026-10-25 (recette fixes REG-F6 + REG-F7)

### Context (verified on main 001f55d)
- consent_records are append-only and superseding; a decision counts only against the LATEST published definition of its type (latestDefinitions + currentDecisions). Keep this rule.
- Required bundle = service_terms + privacy_notice (requiredConsentTypes). The onboarding link (token action "onboarding_consent") and coach capture only carry those two (repository l.~175: `.filter(requiredConsentTypes…)`; ConsentDecisions = Record<RequiredConsentType,…>).
- consent.repository.ts l.116 and l.170 refuse everything except revoke/revoke_link when subscription.status !== "onboarding".
- health_data is only captured inline by a health-category questionnaire (questionnaire.repository.ts appendHealthDecision). progress_photo_storage, marketing, publication have no capture path. Consumers: progress.repository.ts healthGranted, documents.repository.ts consentGranted (health_data, progress_photo_storage), questionnaire health gate.
- saveDefinition (consent.repository.ts l.~203) already does draft → published with immutability + content hash, but has no HTTP route ("no publishing/editing HTTP workflow in S4.4").
- secure_access_tokens has context_json → use it for the requested types; no new table expected.

### Decisions (Fred 2026-10-25)
D1. New « Demander un accord » flow for optional consents, allowed when the subscription is onboarding, active or paused (never completed/cancelled/other).
D2. Optional types = health_data, progress_photo_storage, marketing, publication (named constant optionalConsentTypes). The coach picks which ones go in a request (at least one); client default selection (health_data + progress_photo_storage) is a UI concern.
D3. Public link: new token action "optional_consent", context_json = { types, definitionIds } (latest published ids at issue time). Same public page/route family, generalized to N definitions; no pre-checked choice; each type granted or refused independently (a refusal is recorded as evidence); link consumed on submit; default validity 7 days (coach may set expiry like today); one available optional link per subscription — issuing a new one revokes the previous. Stale when any requested definition is no longer the latest published (existing CONSENT_LINK_STALE). A requested type with no published definition → refuse issue with CONSENT_DEFINITIONS_MISSING.
D4. Coach-assisted capture extended to optional types while onboarding/active/paused: capturedVia "coach_assisted", expectedDefinitionIds guard (existing pattern), no free-text note.
D5. Required types stay onboarding-only (existing link + capture unchanged). A new required version never re-blocks active/paused subscriptions.
D6. New version of an optional type keeps the existing rule (old grant no longer current). Expose per subscription in the consent detail: for each optional type → state "granted" | "refused" | "revoked" | "renewal_required" (granted on an older version) | "none", so the client can show « Accord à renouveler ».
D7. Consent texts admin API (admin session + CSRF + same-origin; publish additionally requires a fresh sensitive-action OTP via isFreshOtp, same as anonymization):
    - GET list by type with all versions (status, version, publishedAt, contentHash, title; content on detail);
    - POST create draft (next version number computed server-side), PATCH draft (title/content only while draft), DELETE draft (never published);
    - GET publish-impact: { type, activeSubscriptionsAffected } = active/paused/onboarding subscriptions whose current decision for that type is "granted" on the current latest version (they will need renewal) — counts only;
    - POST publish (OTP) → immutable, hash, publishedAt; previous latest stays in history (no auto-retire);
    - Reuse saveDefinition semantics; keep advisory/lock order via lockConsentDefinitions.
    Audit: consent.definition_draft_saved, consent.definition_published, consent.request_link_issued, consent.decision_recorded (existing), metadata = type, version, ids, counts — never text content.
D8. Slices: CONS-02a server (this run), CONS-02b client (separate).
D9. Real legal texts are a separate Fred/legal task. Add to TASKS.md under S7.4 prerequisites: "production guard: refuse production start if any published consent definition title contains « DÉMONSTRATION »" — do NOT implement it now.

Status: CONS-02a APPROVED_FOR_IMPLEMENTATION

## CONS-02a execution — 2026-10-25 (Claude)

Status: validated by Fred 2026-10-25, committed 2aae7f9. No migration (context_json carries the requested types).

Tests (agent-run, local PostgreSQL 5433):
- shared 62 → 64; server unit + express 574 → 587; integration 571 → 583.
- First full integration run: 582/583, `DrizzleRequestsRepository resolves a real Postgres unique-token collision` failed once, then passed alone and in a second full run (583/583). Reported as flaky, not touched.
- Mutation check: narrowing the optional status rule to onboarding makes 8 of the 12 new PG tests fail.

Routes (all admin routes: admin session + CSRF + same origin on mutations):
- POST /admin/subscriptions/:subscriptionId/consent-requests `{ types, expiresAt? }` → `{ token, link }` (optional link, D3)
- POST /admin/subscriptions/:subscriptionId/consents/optional-capture `{ decisions, expectedDefinitionIds }` → consent detail (D4)
- POST /admin/subscriptions/:subscriptionId/consent-link/:tokenId/revoke now revokes onboarding and optional links
- GET/POST /public/consents/:token unchanged path, generalized to the token's requested types
- GET /admin/consent-definitions; POST same path creates a draft `{ consentType, title, content }`
- GET/PATCH/DELETE /admin/consent-definitions/:definitionId
- GET /admin/consent-definitions/:definitionId/publish-impact → `{ type, activeSubscriptionsAffected }`
- POST /admin/consent-definitions/:definitionId/publish (fresh sensitive-action OTP, else 403 AUTH_FRESH_OTP_REQUIRED)

Defaults and rules: optional link validity 7 days when expiresAt is absent; status rule `consentScopeStatuses` (required: onboarding; optional: onboarding, active, paused); `ConsentDetail.optionalStates` per optional type (D6); `ConsentDetail.links[].kind/types` added; new code CONSENT_TYPE_NOT_REQUESTED (400).

Known limits:
- Editing, deleting or publishing a non-draft answers the existing CONSENT_DEFINITION_IMMUTABLE (409); no CONSENT_DEFINITION_NOT_DRAFT code was added.
- Extra audit events beyond D7: consent.definition_draft_deleted, and consent.link_revoked with reason "superseded" when a new optional link replaces one.
- CONSENT_DEFINITIONS_MISSING on optional issue is not PG-tested (every type has a published definition in kfit_dev).
- Until CONS-02b, the current Santé tab lists optional links with the onboarding links (none exist until the new API is used).

## CONS-02b plan — approved by Fred 2026-10-25 (client)

1. Public consent page renders the definitions the link carries (onboarding: both required; optional: « Tes accords facultatifs », refusal never blocks coaching). Nothing preselected, every requested text answered.
2. Santé tab: « Accords facultatifs » block with per-type state (« Accord à renouveler »), « Demander un accord » (default health_data + progress_photo_storage, 7 days) and coach-assisted optional capture while onboarding/active/paused. Required block unchanged. Link list shows the link kind.
3. New Configuration page « Textes de consentement » (/admin/consentements): versions by type, draft create/edit/delete, published read-only, publish with impact preview and sensitive-action OTP step-up.
4. API client + French error messages; status rule (consentScopeStatuses) moved to the shared contract, server stays authoritative.
Browser QA by Claude in Chrome authorized (dev:api + dev:web).

## CONS-02b execution — 2026-10-25 (Claude)

Status: delivered and committed 2026-10-25 on Fred's instruction; browser validation pending. Client only, plus `consentScopeStatuses` / `consentScopeAllows` moved to the shared contract (server re-exports them).

Checks (agent-run): tsc shared/server/client clean; client build OK; shared 64/64, server unit 587/587, integration 583/583 (unchanged counts). The client has no test runner.
NOT VALIDATED: browser behaviour. The Chrome extension was not connected, so no flow was driven in a browser.

Delivered: public page renders the link's definitions (« Tes accords facultatifs » for optional links); Santé tab split into « Conditions obligatoires » and « Accords facultatifs » with « Accord à renouveler », « Demander un accord » and « Recueillir des accords »; link list names each link's documents; new page /admin/consentements « Textes de consentement » (versions, drafts, read, publish with impact and OTP step-up); nav entry under Configuration.

## CAT-03 Gate 1 — approved 2026-10-25 (recette fix REG-F2)

### Context (verified on main)
- Tables exist, seed-only today: service_variants (archived_at), service_components (NO archived_at), service_policies (unique (service_id, variant_id) — NULL variant rows are NOT unique in PostgreSQL).
- Catalogue API (modules/catalogue) only writes service-level fields, capacity, order, publish, archive. validatePublishable (catalogue.service.ts ~l.368) checks name/slug/price/capacity only.
- Existing service_policies writer to mirror: questionnaires/repositories/template.repository.ts (~l.60–80: select scope FOR UPDATE, update or insert).
- Cadence-history protocol (S7.1, gotchas.md): writers take fence key 7247001 before owner row locks; helpers in follow-ups/repositories/cadence-history.repository.ts: lockCadenceWrites, lockPolicyCadenceScope(tx, serviceIds) → recordPolicyCadenceChanges(tx, before, at). Same transaction, before/after resolution.
- Capacity claim writers lock the service row first (onboarding.repository.ts ~l.25 comment) — variant capacity edits must follow the same order.
- Snapshots: conversion copies price/duration/components into subscriptions/subscription_components (label_snapshot, quantity_entitled, source_service_component_id FK restrict); appointments snapshot late-cancel/missed rules. Onboarding reads medical clearance LIVE via resolveEffectivePolicy (onboarding.service.ts ~l.37–47), which today accepts only not_required | required_if_risk_flag; questionnaire.repository.ts also handles "required".
- Seed values in use: componentType appointment | follow_up | program; consumptionPolicy manual; medical not_required | required_if_risk_flag.

### Decisions (Fred 2026-10-25)
D1. Variants: create; edit name, slug (unique per service), priceXaf, durationValue/Unit, capacityLimit, availabilityStatus, sortOrder; archive (never delete). Archived variants excluded from public catalogue, qualification list (already) and new conversions. Existing subscriptions never rewritten. Capacity edits follow the service-lock-first order.
D2. Components: scope = service (variantId null) or one variant of the same service; componentType ∈ {appointment, follow_up, program} (closed constant); label; quantity > 0; isMandatory; consumptionPolicy ∈ {manual} only in V1. Edit allowed (subscriptions keep snapshots). Removal = archive (new archived_at); archived components are excluded from new conversions and from the public/admin "included" lists. No hard delete.
D3. Rules: one service-level row + optional per-variant override row. Editable fields: followUpFrequencyDays (null = no cadence, else 1–90), lateCancelNoticeHours (null or 1–168), lateCancelConsumesComponent, missedConsumesComponent, medicalClearancePolicy. questionnaireTemplateId is NOT editable here (stays on the Questionnaires screen; preserve it on every write). Any write that can change a resolved cadence runs lockCadenceWrites → lockPolicyCadenceScope([serviceId]) → write → recordPolicyCadenceChanges in the same transaction. Removing a variant override = delete that override row (fallback to service), also through the cadence protocol.
D4. Medical clearance closed list: not_required | required_if_risk_flag | required. Extend resolveEffectivePolicy and the onboarding requirement derivation so "required" creates an always-blocking medical clearance item (same item/flow as the risk-flag case, without needing a risk flag). Keep questionnaire behaviour consistent.
D5. Effect of edits: late-cancel/missed rules apply to new appointments only (existing snapshots). Medical clearance applies live to subscriptions in onboarding: the rules write response includes { onboardingSubscriptionsAffected } and readiness items of those subscriptions are re-derived consistently in the same transaction (reuse the existing derivation; do not invent a new one).
D6. Deliverability check, pure function, used by publish and by a read endpoint:
    - every active (non-archived) variant reaches ≥ 1 non-archived component (service-level or its own); a variant-less offer needs ≥ 1 service-level component;
    - a service-level rules row exists with medicalClearancePolicy explicitly set (not null);
    - pricing: fixed → base price or every active variant has a price; quote → no price required;
    - time_based → every active variant resolves a duration (variant or service default); one_time → none required.
    Publish refuses with CATALOGUE_SERVICE_NOT_DELIVERABLE + list of failed rule keys. GET .../deliverability returns { deliverable, failures[] } for any offer (published offers that fail are flagged, never auto-unpublished).
D7. Migration 0016 (normal `npm run db:generate`, never hand-edit output): service_components.archived_at (nullable timestamptz); replace service_policies_scope_uq with a unique index on (service_id, variant_id) NULLS NOT DISTINCT — if Drizzle cannot express NULLS NOT DISTINCT, STOP and ask before any custom SQL. Preflight first and report: duplicate service-level policy rows per service (expected 0); if any exist, STOP and ask.
D8. UI (CAT-03b, not this run): « Variantes », « Contenu », « Règles » tabs editable + « Avant publication » checklist.
D9. Slices: CAT-03a server (this run) → CAT-03b client.

Amendment (Fred 2026-10-25, during CAT-03a): « Programme sportif 12 semaines » had only a variant-level rules row. The catalogue seed gains a service-level row with the variant's values (follow-up 7 days, required_if_risk_flag) so D6 stays as written and the seeded offer stays deliverable.

Status: CAT-03a APPROVED_FOR_IMPLEMENTATION

## CAT-03a execution — 2026-10-25 (Claude)

Status: committed 2026-10-25 on Fred's instruction (agent tests accepted); live validation with CAT-03b.

Tests (agent-run, local PostgreSQL 5433): shared 64 → 65; server unit + express 587 → 600; integration 583 → 592. tsc shared/server/client clean.
Mutation checks: an empty deliverability rule fails the publish-guard test; skipping recordPolicyCadenceChanges fails both cadence tests.

Migration 0016 (`npm run db:generate`, not edited):
```sql
DROP INDEX "service_policies_scope_uq";
ALTER TABLE "service_components" ADD COLUMN "archived_at" timestamp with time zone;
ALTER TABLE "service_policies" ADD CONSTRAINT "service_policies_scope_uq" UNIQUE NULLS NOT DISTINCT("service_id","variant_id");
```
Preflight on kfit_dev (PostgreSQL 16.15): 0 duplicate offer-level rows, 0 duplicate variant-level rows. Applied to a fresh database (kfit_cat03_fresh, left in place) and to kfit_dev; `db:check` clean.

Routes: POST/PATCH variants, POST variant archive, POST/PATCH components, POST component archive, PUT offer rules, PUT/DELETE variant rules, GET deliverability (catalogueApiRoutes). Publish now returns 409 CATALOGUE_SERVICE_NOT_DELIVERABLE + failures.

Choices and limits:
- NULLS NOT DISTINCT is a unique constraint (Drizzle supports it on constraints only); PostgreSQL backs it with a unique index. No custom SQL.
- D6 owns publish pricing: the older `fixed_price_required` check (base price mandatory for fixed offers) was removed so « every active variant has a price » can publish.
- Removing a variant override refuses with CATALOGUE_RULES_OVERRIDE_HAS_QUESTIONNAIRE when that row also carries a questionnaire assignment (deleting it would drop the assignment, D3).
- Offer-level PUT requires an explicit medical policy; on a variant, null means « same as the offer » (also for cadence and late-cancel notice).
- « required » opens a medical_clearance record (trigger `service_policy`) and the blocking item; lifting it marks only that record `waived` and removes the item when no requirement stays open. Risk-flag requirements are untouched.
- Archived variants are refused at conversion (qualification_invalid), including for qualifications made before the archive.
- Archives are idempotent (a repeat writes no audit event). Variant duration must be a value and unit pair.
- kfit_dev keeps the old seed until `npm run db:seed` runs: « Programme sportif 12 semaines » reports service_rules_missing there until then.

## CAT-03b execution — 2026-10-25 (Claude)

Status: validated by Fred live 2026-10-25 and committed. Client only (no server or shared change).
Checks (agent-run): client tsc clean, client build OK. The client has no test runner. Browser: NOT VALIDATED by agent (Fred runs the live test).

Offer sheet (board 06) per D8:
- « Contenu »: service fields as before, plus « Prestations incluses dans l'offre » (add, edit, retirer = archive with confirmation).
- « Variantes »: add, edit, archive (confirmation shows the subscriptions that keep it); per variant: its own prestations and its own rules (« Revenir aux règles de l'offre » removes the override).
- « Règles »: editable offer rules (cadence 1–90 days or none, late-cancel 1–168 h or none, two consumption switches, medical policy incl. « Toujours requis »); a toast reports clients in preparation updated (D5).
- « Avant publication »: the server deliverability report as a four-point checklist; also shown in the publish dialog, where « Publier » stays disabled until the offer is deliverable.
Limits: a variant's position is set at creation only (the overview DTO carries no stored order); the client-side « published fixed offer needs a base price » check was removed to match D6.

## POL-01 Gate 1 — approved 2026-10-25 (recette polish)

### Context (verified on main 949d710)
- F3: integration tests run against kfit_dev on 5433 by design (guard pattern: quotes.repository.integration.ts ~l.41, asserts host localhost/127.0.0.1, port 5433, path /kfit_dev). Four files have NO guard: modules/auth/tests/auth.repositories.integration.ts, modules/auth/tests/password-recovery.repository.integration.ts, modules/requests/tests/admin-requests.repository.integration.ts, modules/requests/tests/requests.repository.integration.ts. The last one inserts a PUBLIC open service « Integration test service » and its after() deletes prospects by a fixed WhatsApp "+24100000000" then the service — one FK failure aborts the rest → leaked service. « Individual check » is not in the code (manual draft, Fred archives it in the UI).
- F4: app/routes/client-profile.tsx ~l.143/166: header badge = deriveClientStatus(subscriptions) (shared customers/client-status.ts). Labels (« En pause », « Revue de fin »…) collide with subscription chip labels.
- F5: receipts/services/receipt-snapshot.ts publicReceipt() hard-codes canDownload: true; receipts.repository.ts publicCommand ~l.70–88 increments useCount on public-pdf. client receipts/components/PublicReceiptPage.tsx never refetches after a download → button stays active, next click returns RECEIPT_LINK_CONSUMED. Default maxUses 3 (1–20) is correct, unchanged.
- F8: profile/documents/DocumentsTab.tsx ~l.345: DialogContent description falls back to the upload text for every dialog without a doc (summary, photo).
- F9: « À traiter » = dashboard/services/today.policy.ts (todayTaskKinds in shared dashboard/contracts.ts ~l.64). Overdue installments / pending proofs exist only in alerts.service.ts (~l.25–32, source = DrizzleDashboardAlertsRepository.snapshot: owners, finance, proofs, quoteChanges). DashboardAlertsService already depends on TodayService (dev-app.ts ~l.189, ~l.205) → no circular dependency allowed. client dashboard/components/TodayPage.tsx ~l.82–88 header sentence.
- F10: notifications/components/NotificationCenter.tsx ~l.130–181: tab « À traiter · N » uses unread-count (repository unreadCount: resolvedAt null AND readAt null) while the list shows open (resolvedAt null).
- F11: profile/appointments/AppointmentsTab.tsx ~l.25, ~l.81: « À venir » = status in {scheduled, confirmed, reschedule_requested} regardless of time; a past scheduled/confirmed appointment stays there as « Confirmé ». Aujourd'hui agenda list in TodayPage.tsx ~l.172–188.

### Decisions (Fred 2026-10-25)
D1. F3: add the existing 5433/kfit_dev guard to the 4 files. Test fixtures: name prefix "[TEST] ", services isPublic false, unique WhatsApp per run (derived from randomUUID), cleanup by the test's own ids only, in reverse FK order, each delete in its own try/catch so one failure never skips the rest. Add scripts/dev/cleanup-test-fixtures.sql (NOT executed by you): a transaction that lists then deletes rows named « Integration test service » / « Integration Test » and their dependent request/prospect rows, ending with ROLLBACK by default and a commented COMMIT — Fred reviews and runs it in DBeaver.
D2. F4: header status rule unchanged. Add a neutral pill « N abonnements ouverts » when more than one subscription is open (isOpenSubscription), and a tooltip on the status pill « Statut global : abonnement le plus avancé ». No server change.
D3. F5: PublicReceiptMetadata gains remainingDownloads (maxUses − useCount, ≥ 0); canDownload = remainingDownloads > 0. The page shows « N téléchargement(s) restant(s) », refetches metadata after each successful download, and on RECEIPT_LINK_CONSUMED / EXPIRED / REVOKED disables the button and keeps the error message. A consumed link still refuses the whole page on load (unchanged).
D4. F8: one description per dialog kind. summary → « PDF généré à partir des mesures et objectifs enregistrés · lien protégé par un code. »; photo → « JPG, PNG ou WebP · 10 Mo maximum · consentement photos requis. »; upload unchanged.
D5. F9: new TodayTaskKind values installment_overdue and payment_proof_pending. Validated order becomes: follow_up_overdue → installment_overdue → follow_up_due → payment_proof_pending → request_new → request_follow_up → preparation_expired → preparation_ready → preparation_waiting → completion_due. installment_overdue = remainingXaf > 0 and business due date (Africa/Libreville) < today, one task per installment, most days late first; payment_proof_pending = proofs awaiting review, oldest first. Anonymized/archived subjects excluded (same owner filter as alerts, S7.3 D5). Quote changes stay alerts-only. Source: move the finance/proof read into a TodaySources entry (reuse DrizzleDashboardAlertsRepository.snapshot logic or extract a shared reader — no duplicate query logic); DashboardAlertsService then maps these two kinds from today tasks instead of its own loops. Alerts output (kinds, titles, summaries, deepLinks, order, dedupe) must stay identical — regression test. Notification reconcile (S7.2) must be unaffected — check its source and report.
D6. F9 header sentence: « N action(s) à traiter aujourd'hui » + « , dont X suivi(s) en retard » + « , Y échéance(s) en retard » (each part only when > 0); « Rien d'urgent… » only when N = 0. Task rows: installment → status « En retard · d j » (danger), meta « <offre> · <montant> FCFA restant », action « Enregistrer le paiement », link onglet=finance; proof → status « À examiner » (warning), action « Examiner le justificatif », link onglet=finance. KPIs unchanged.
D7. F10: NotificationUnreadCountResponse becomes { unread, open } (additive; open = resolvedAt null for the session user). Bell badge keeps unread; tab « À traiter · N » uses open. Same route, no new endpoint.
D8. F11: display only, no new task kind (backlog item « RDV à clôturer dans À traiter », V1.1). An appointment with status scheduled|confirmed and scheduledEnd ≤ now is « à clôturer »: profile tab shows a « À clôturer » group above « À venir » with a warning pill « À clôturer » and primary action « Marquer terminé » (existing complete action; early-completion rule unchanged); « À venir » keeps only future ones; same pill in the Aujourd'hui agenda list. Pure helper isAppointmentToClose(a, now) in client lib, unit-tested.
No migration. All API changes additive.

Status: POL-01 APPROVED_FOR_IMPLEMENTATION

## POL-01 execution — 2026-10-25 (Claude)

Status: committed 2026-10-25 on Fred's instruction; manual checks pending. No migration; API changes additive.

Tests (agent-run, local PostgreSQL 5433): shared 65 → 69; server unit + express 600 → 607; integration 592 → 594 (last full run 594/594). tsc shared/server/client clean, client build OK. Browser: NOT VALIDATED by agent.
Alerts regression (D5): dashboard alerts on kfit_dev captured before the change with the dev-app composition and re-captured after → byte-identical (1 501 bytes, 3 alerts: installment_overdue ×2, preparation_blocked ×1); plus a unit test pinning the mapped object's fields and key order.
Notification reconcile (S7.2): reads `dashboardAlerts.alerts()` (dev-app.ts); alerts unchanged → reconcile unaffected.

Per finding:
- F3 (D1): `src/testing/integration-fixtures.ts` (guard, `[TEST] ` names, per-run WhatsApp, ordered cleanup that tries every step) used by the 4 files; services private. Guard proven by running with a port-5432 URL (refused before any query). Two consecutive runs of the 4 files: 15/15 each, 0 `[TEST]` rows left. `packages/server/scripts/dev/cleanup-test-fixtures.sql` (ROLLBACK by default, not run): 3 legacy « Integration test service » rows remain for it.
- F4 (D2): client-profile header tooltip « Statut global : abonnement le plus avancé » + « N abonnements ouverts » pill (isOpenSubscription).
- F5 (D3): `remainingDownloads` in public receipt metadata; page shows remaining count, refetches after each download, disables on consumed/expired/revoked and keeps the receipt visible.
- F8 (D4): one subtitle per document creation dialog.
- F9 (D5, D6): two new task kinds from a new `TodaySources.collections` entry (= DrizzleDashboardAlertsRepository.snapshot, same owner filter); alerts map them from today tasks; header sentence via shared `todayHeaderCounts`.
- F10 (D7): unread-count returns `{ unread, open }` in one query; tab uses `open`.
- F11 (D8): shared `isAppointmentToClose`; profile « À clôturer » group above « À venir »; Aujourd'hui agenda pill.

Deviation: the pure helpers asked « in client lib » (isAppointmentToClose, receipt link-closed rule, header counts) live in `@kfit/shared` — the client has no test runner, shared does; the client imports them from there.
Incident during the run: the dev API's notifications reconcile job (every 15 min) wrote notifications on the progress test's fixture subscriptions and treated its fixture admin as a recipient, so that file's cleanup failed once and leaked 58 subscriptions plus a synthetic health_data consent text (latest version → every real health grant would read « à renouveler »). Cleaned with Fred's approval in one transaction by the fixture's ids. Root cause is outside POL-01: integration runs and the dev API jobs share kfit_dev.
Flaky: « DrizzleRequestsRepository resolves a real Postgres unique-token collision » failed in two full runs, passes alone (3/3) and in the last full run; reported, not changed.

## TEST-01 Gate 1 — approved 2026-10-25 (test DB isolation + test-data cleanup)

### Context (verified on main 3e0295e)
- Integration runs: packages/server `npm run test:integration` (build + node --test --test-concurrency=1 "dist/**/*.integration.js"), invoked with --env-file=../../.env → DATABASE_URL = local kfit_dev on 5433, the same DB the dev API and its jobs (notifications reconcile 15 min, delivery 5 min, privacy purge) use.
- Guards: src/testing/integration-fixtures.ts (isLocalTestDatabase / assertLocalTestDatabase, path /kfit_dev, testFixtureName "[TEST] ", uniqueTestWhatsapp) used by 6 files; 17 integration files still carry an inline copy of the kfit_dev guard (e.g. quotes.repository.integration.ts ~l.41).
- Migrations: src/db/migrations (drizzle-kit migrate). Legacy cleanup SQL: packages/server/scripts/dev/cleanup-test-fixtures.sql (keep as fallback; its marker names and "keep converted" rule are the reference for D5).
- Réglages page: client notifications/components/NotificationSettingsPage.tsx, route "reglages" in app/App.tsx ~l.99. Dev-only patterns: client import.meta.env.DEV (LoginForm demo button, UiGallery); server dev-only composition in dev-app.ts.
- Known flaky (POL-01 report): « DrizzleRequestsRepository resolves a real Postgres unique-token collision » fails in some full runs, passes alone.

### Decisions (Fred 2026-10-25)
D1. Test DB: integration tests run ONLY on local `kfit_test` (localhost/127.0.0.1, port 5433, path /kfit_test). Config in a gitignored `.env.test` at repo root (+ committed `.env.test.example`, no values printed). Single guard: integration-fixtures.ts asserts /kfit_test; replace all 17 inline guards by assertLocalTestDatabase (no inline copies left — add a unit test that greps dist/source for the old inline pattern or for "/kfit_dev" in *.integration.ts and fails). `test:integration` uses .env.test. The dev entrypoint must never start with DATABASE_URL pointing at kfit_test (startup check, dev warning → refuse).
D2. `npm run db:test:prepare` (packages/server): create kfit_test if missing (connect to the maintenance DB with the same credentials), then drizzle-kit migrate against it. Idempotent. No seed by default; if some integration tests depend on demo seed data, STOP and report which ones (one yes/no question: seed kfit_test with the demo SQL?).
D3. Flaky test: diagnose « unique-token collision » (likely shared state/timing with other files on the same DB); fix only if the cause is test isolation; otherwise report the cause and leave it.
D4. Cleanup is DEV ONLY, enforced twice: server routes mounted only in dev-app.ts AND each request refused unless NODE_ENV !== "production" and DATABASE_URL is local kfit_dev on 5433 (named constant, reuse the URL parser; error DEV_TOOLS_UNAVAILABLE). Client card « Données de test » on Réglages rendered only when import.meta.env.DEV; absent from the production bundle (verify with the client build: grep the dist for the card title → 0).
D5. Test data = roots whose name/title starts with "[TEST] " or equals a legacy marker (« Integration test service », « Integration Test »): services, prospects, customers, consent definitions; plus every row depending on them (requests, contacts, qualifications, waitlist, subscriptions and all subscription children, appointments, payments/receipts/proofs/quotes, documents rows, consents, notifications + outbox, cadence history…). Keep (never delete) anything also linked to a non-test customer or to a request converted for a non-test customer — same rule as the SQL script. User accounts are never deleted (Analyser lists them as « comptes de test conservés » if named "[TEST] "). Audit logs and anonymization_events are never deleted. Stored files of deleted document versions: delete from storage after commit, best effort, log ids only.
D6. Two steps:
   - GET  /admin/dev/test-data → { counts: { [kind]: number }, kept: { [kind]: number }, fingerprint } (no names, no PII, nothing changes).
   - POST /admin/dev/test-data/purge { fingerprint } → recomputes; fingerprint mismatch → 409 DEV_TEST_DATA_CHANGED (re-analyse); else deletes in ONE transaction in reverse FK order and returns the counts. Admin session + CSRF + same-origin. Audit event dev.test_data_purged with counts only.
   UI: « Analyser » shows a table kind → count (French labels) + kept counts; « Supprimer les données de test » opens a confirm dialog repeating the totals; success toast with totals; empty state « Aucune donnée de test ».
D7. Hard delete is allowed here only (test fixtures, not business data — the soft-delete rule does not apply). The deletion order is ONE declarative constant (table list) with a unit/integration test proving that every table holding an FK into the covered roots is in the list (derive from the Drizzle schema). If an immutability guard or trigger blocks a delete, STOP and ask — do not disable it.

Status: TEST-01 APPROVED_FOR_IMPLEMENTATION

## TEST-01 execution — 2026-10-25 (Claude)

Status: delivered; committed and pushed 2026-10-25 on Fred's instruction. Manual checks (Réglages purge on kfit_dev) pending.

- D1: single guard `assertLocalTestDatabase` (localhost/127.0.0.1:5433/kfit_test, postgres URL, no query) on the shared parser `src/db/database-target.ts`. Replaced 17 inline kfit_dev guards **and 7 port-only guards** (catalogue, customers, today, notifications, onboarding, request-conversion, variantless-offer), so all 30 integration files use it; a unit test fails on any inline copy or "/kfit_dev" in *.integration.ts. Root `.env.test` (gitignored) + committed `.env.test.example`; `test:integration` = `--env-file-if-exists=../../.env --env-file=../../.env.test` (.env.test overrides). Dev API (scripts/dev/api-server.mjs) exits 1 when DATABASE_URL names kfit_test (checked: exit 1).
- D2: `npm run db:test:prepare` creates kfit_test via the `postgres` maintenance DB, runs drizzle-kit migrate, then `seed:catalogue` (Fred 2026-10-25: yes; 3 customers tests + 1 agenda test read a seeded service). Ran 3×: second and third runs are no-ops.
- D3: « unique-token collision » reproduces **alone** on the isolated kfit_test (5/12 runs), so the cause is not test isolation. Cause: `isUniqueViolation` (requests.repositories.ts:15) reads only the top-level `code`; drizzle 0.44 wraps the pg error in `.cause`, so a real concurrent collision is rethrown instead of replayed. The test passes only when the second call's pre-check already sees the committed row. Left unchanged (product bug; same top-level-only check in catalogue.repositories.ts:135). Needs its own brief.
- D4–D7: shared `dev/test-data.ts` (routes, kinds, DTOs, parser, DEV_TOOLS_UNAVAILABLE / DEV_TEST_DATA_CHANGED). Server module `modules/dev-tools`: plan (one ordered constant, FK edges read from Drizzle, polymorphic owner/resource/scope links, quotes↔quote_versions←subscriptions cycle cleared via two nullable columns), pure classifier (roots by own label only; real = linked to a non-test customer/subscription; needed = FK-referenced by kept or non-test rows), fingerprint, repository (advisory lock, recompute, one transaction, FK violation → 409), service (files removed after commit, best effort, logged by document version id), controller (guard before auth on every request), router mounted only from dev-app.ts. Client card « Données de test » loaded lazily under `import.meta.env.DEV` on Réglages.
- Deviation: users have no name column, so « comptes de test conservés » counts accounts on the reserved `@example.invalid` domain (the integration suite's synthetic admins). Count only; never deleted.
- Checks (agent-run): tsc shared/server/client clean; shared 71/71; server unit 623/623 (was 607); integration on kfit_test 597/597 (POL-01: 594; +3 purge tests); kfit_dev counts before/after the full run unchanged (services 8, subscriptions 12, consent_definitions 9, customers 13, prospects 9, notifications 62); client build: 0 files contain « Données de test » / test-data/purge / DEV_TEST_DATA_CHANGED (control string from the same page found).
- Read-only analysis of kfit_dev (no purge): 3 services to delete (the legacy « Integration test service » rows), nothing kept.
- Limits: the dev API was not running during the integration run (Fred's manual step 1 covers it). No client test runner, so the bundle check is the build + grep. Fixtures named without "[TEST] " (e.g. « Synthetic Dashboard ») are not detected, by design (D5).

## S7.3b Gate 1 — approved 2026-10-26 (privacy client)

### Context (verified on main fa06b35)
- customers.repository.ts l.15: `const active = and(isNull(archivedAt), isNull(anonymizedAt))` is applied to listActive, getDetail (l.46), getOverviewSource, getAnalyticsSource, searchActive. After « Archiver » the fiche (GET /admin/customers/:customerId) returns 404 → « Anonymiser… » and the anonymized view are unreachable. This is the gap.
- Anonymization (S7.3a) already writes the pseudonym into customers.full_name, WhatsApp → `anon-<id>`, email → null.
- shared customers/contracts.ts: AdminCustomer (l.23), AdminCustomerDetailResponse (l.65), routes (l.4–11; `detail: "/admin/customers/:customerId"`).
- shared requests/contracts.ts: AdminServiceRequestProspect (l.178) = { id, fullName, whatsapp, email }. admin-requests.repositories.ts l.214 hides anonymized prospects from the queue (keep).
- server privacy/services/privacy.policy.ts: TERMINAL_REQUEST_STATUSES (l.18), prospect eligibility (l.53); customer archive eligibility (D1 precision: every subscription completed|cancelled).
- Holds: GET /admin/retention-holds supports scopeType/scopeId filters (privacy.controller.ts l.65).
- client/vite.config.ts: no proxy entry for /admin/prospects nor /admin/retention-holds (Fred has a local uncommitted line for the latter — overwrite it with the committed version, report it).

### Decisions (Fred 2026-10-26)
D1. Customer read path: GET /admin/customers/:customerId also returns archived and anonymized customers. Response gains `privacy: { archivedAt: string|null; anonymizedAt: string|null; archivable: boolean; activeHolds: number }`. archivable = not archived AND every subscription completed|cancelled (reuse the privacy policy rule, no copy). Anonymized: customer.whatsapp and customer.email returned as null (type: detail customer whatsapp string|null), fullName = stored pseudonym. List, search, overview, analytics, alerts, notifications stay unchanged (S7.3 D5): analytics still 404 for archived/anonymized.
D2. New GET /admin/customers/archived → { customers: [{ id, displayName, archivedAt, anonymizedAt, activeHolds }] }, archivedAt desc, archived (named) + anonymized (pseudonym only, no contact fields). Registered BEFORE /:customerId.
D3. Archived fiche is read-only in the UI (S7.3b-2). Server: audit every writer that takes a customerId or acts on its subscriptions and report whether an archived/anonymized customer is refused (cite line). Fix only with a one-line guard returning an existing error code; anything bigger → report, do not fix.
D4. Dialog error order (UI, S7.3b-2): button disabled when activeHolds > 0; on submit name mismatch 400 → OTP 403 → hold 409 fallback. Server unchanged.
D5. Prospects: request detail `prospect` gains `privacy: { archivedAt, anonymizedAt, archivable }`, archivable = not archived AND every request of the prospect in TERMINAL_REQUEST_STATUSES. UI actions live in the request detail ⋯ menu (S7.3b-2).
D6. Holds card on customer fiche only (active + archived). Document-scope holds stay API-only (backlog). No server change.
D7. Réglages « Confidentialité » uses the existing settings API (privacy.purge.delay_days already in the registry). Commit Vite proxy entries /admin/prospects and /admin/retention-holds in this slice.
D8. Slices: S7.3b-1 server (this run) → S7.3b-2 client.
No migration. All API changes additive.

Status: S7.3b-1 APPROVED_FOR_IMPLEMENTATION

## S7.3b-1 execution — 2026-10-26 (Claude)

Status: delivered; committed and pushed 2026-10-26 on Fred's instruction → Fred: validate; then S7.3b-2 (client).

- Routes: GET /admin/customers/:customerId now also returns archived and anonymized customers, plus `privacy { archivedAt, anonymizedAt, archivable, activeHolds }` (D1); anonymized → whatsapp/email null, fullName = stored pseudonym. New GET /admin/customers/archived → { customers: [{ id, displayName, archivedAt, anonymizedAt, activeHolds }] }, archivedAt desc, registered before /:customerId (D2). Request detail `prospect.privacy { archivedAt, anonymizedAt, archivable }` (D5). All admin-session reads, no audit (as before), no migration.
- Implementation: repository `getDetail(id, visibility: "active" | "include_archived")` (service passes include_archived; list, search, overview, analytics, alerts, notifications untouched). archivable via `customerArchivable` / `prospectArchivable` in privacy.policy.ts, built on the existing archive refusal rules. activeHolds = active customer-scope holds (document-scope holds stay API-only, D6).
- D3 writer audit (archived ⇒ every subscription completed|cancelled; nothing checks customers.archived_at except conversion matching):
  - Refused by subscription-status guards: subscription lifecycle commands except renew (subscriptions.repository.ts:70), appointment schedule/reschedule (appointments.repository.ts:73, :137), follow-up create/cadence (follow-ups.repository.ts:86, :75), measurement/create-goal (progress.repository.ts:110, :132), consents issue/capture/optional (consent.repository.ts:141, public :223), questionnaires (questionnaire.repository.ts:192, public :228), onboarding (onboarding.repository.ts:22-23).
  - Fixed with a one-line guard (existing codes): receipts issue (receipts.repository.ts:106 → RECEIPT_INVALID_PAYMENT), quotes issue (quotes.repository.ts:184 → QUOTE_INVALID_STATE). Integration-tested, mutation-checked.
  - Not refused, bigger change needed (reported, not fixed): **renew from completed** (policy :5; creates a new onboarding subscription for the archived customer, which then reopens every onboarding writer); appointment status actions / restore-component / response-link (appointments.repository.ts:106-135); follow-up complete/cancel (follow-ups.repository.ts:96-103); goal pause/resume/cancel/confirm-outcome (progress.repository.ts:145-158); documents upload/summary/photo/version/link (documents.repository.ts:81+); finance plans/payments/corrections (finance.repository.ts:166); payment-proof link + review; receipts share/void; quotes create/version/edit/share/cancel/synchronize; consents revoke (likely intended). Status guards there would also block legitimate work on completed subscriptions, so a customer-level check is needed.
  - Public tokens: archiving revokes none (privacy.repository.ts:77-87); payment-proof upload, quote respond, appointment response and document view stay live for an archived customer until anonymization (which revokes them, :239-241).
- Vite: /admin/prospects and /admin/retention-holds proxied. No local uncommitted vite.config.ts line was present (working tree clean at start).
- Client: minimal type adaptation only (WhatsApp button hidden when whatsapp is null).
- Checks (agent-run): tsc shared/server/client clean; client build ok; shared 71/71; server unit 625/625 (TEST-01: 623); integration on kfit_test 604/604 (TEST-01: 597; +5 customers-privacy, +1 receipts, +1 quotes).
- Flaky (pre-existing, unrelated): express unit tests occasionally fail with `fetch failed` (a different test each time: dashboard GET, notification settings, admin requests contact-attempt); 3 of 5 full unit runs passed.

## ARCH-01 Gate 1 — approved 2026-10-26 (archived subjects freeze)

### Context (verified on main d6fdf61)
- Archive: privacy.repository.ts archive() l.~73–88 — lockSubject (advisory, l.47) → subject row FOR UPDATE → refusal rules → set archived_at → audit. Already-archived returns early (l.78). It revokes no token.
- Anonymize requires archived (PRIVACY_SUBJECT_NOT_ARCHIVED), locks the subject row FOR UPDATE, then updates subscription rows. Token revocation: applyAll l.~239–241 via tokenResourceIds(tx, scope, docs) l.162 (subscriptions, requests, document versions, appointments, installments, proofs, quotes, quote versions, receipts).
- Nothing checks customers.archived_at / prospects.archived_at in writers except conversion matching (activeCustomerWhatsappMatches, customers.repository.ts l.33). Full D3 audit with lines: sprint-7.md § S7.3b-1 execution. Unguarded today: renew from completed (subscriptions.repository.ts ~l.127), appointment status/restore-component/response links (appointments.repository.ts ~l.106–135), follow-up complete/cancel (follow-ups.repository.ts ~l.96–103), goal pause/resume/cancel/confirm-outcome (progress.repository.ts ~l.145–158), documents upload/summary/photo/version/link (documents.repository.ts ~l.81+), finance plans/payments/corrections (finance.repository.ts ~l.166), payment-proof link + review, receipts share/void, quotes create/version/edit/share/cancel/synchronize. Stop-gap one-line guards: receipts.repository.ts ~l.106 (RECEIPT_INVALID_PAYMENT), quotes.repository.ts ~l.184 (QUOTE_INVALID_STATE).
- Prospect writers: admin-requests.repositories.ts createContactAttempt ~l.312, transitionStatus ~l.389, recordQualificationReview ~l.444, createWaitlistEntry ~l.560, withdrawWaitlistEntry ~l.681; request-conversion.repository.ts. Public request form requests.repositories.ts ~l.73 matches an existing prospect by WhatsApp with no archived filter → a returning person's new request attaches to the archived prospect.
- No unique index on customers/prospects whatsapp (indexes only).

### Decisions (Fred 2026-10-26)
D1. Freeze: a customer or prospect with archived_at not null (archived or anonymized) is frozen. Every admin or public writer acting on that customer, its subscriptions (and their children) or that prospect / its requests refuses with CUSTOMER_ARCHIVED or PROSPECT_ARCHIVED (409). One shared assertion per subject type (e.g. assertCustomerWritable(tx, { customerId } | { subscriptionId }), assertProspectWritable(tx, { prospectId } | { requestId })), used by every writer. It replaces the two stop-gap guards (receipts ~l.106, quotes ~l.184) — those return CUSTOMER_ARCHIVED now.
D2. Lock order: the assertion selects the subject row FOR SHARE and is the FIRST row lock in the writer transaction (only advisory fences such as the cadence fence 7247001 may come before it). Archive/anonymize take the same row FOR UPDATE → they serialize with writers, no lock cycle with anonymize updating subscription rows. Resolve customerId from subscriptionId with a plain read before locking.
D3. Exceptions (never frozen): consent revoke (withdrawal); privacy actions (archive, anonymize, holds, unarchive); system jobs (privacy purge, notification reconcile/delivery); reads. Keep them as one named exemption list.
D4. Renew from a completed subscription of an archived customer → CUSTOMER_ARCHIVED. Accounting corrections (receipt void, payment correction, plans) are frozen too: correction = unarchive first (D6). Corrections on an anonymized customer's financial rows are refused in V1 (compliance open item, legal sign-off).
D5. Archive revokes every non-revoked public link of the subject in the same transaction, reusing tokenResourceIds (customer scope: its subscriptions + documents + proofs/quotes/receipts; prospect scope: its requests). Audit metadata gains tokensRevoked (count). Calling archive on an already-archived subject is still idempotent (same archivedAt) and also revokes any remaining live link (covers subjects archived before ARCH-01). Revoked links stay revoked after unarchive.
D6. Unarchive: POST /admin/customers/:customerId/unarchive and POST /admin/prospects/:prospectId/unarchive. Admin session + CSRF + same-origin (no OTP). Body { reason } with reason ∈ closed list unarchiveReasons = accounting_correction | returning_customer | archived_by_mistake (French labels in shared: « Correction comptable », « Client de retour », « Archivé par erreur »). Not archived → PRIVACY_SUBJECT_NOT_ARCHIVED (409); anonymized → PRIVACY_SUBJECT_ANONYMIZED (409, new code — anonymization stays irreversible); invalid reason → PRIVACY_INVALID_INPUT. Same locks as archive (lockSubject → row FOR UPDATE). Sets archived_at null; audit privacy.subject_unarchived { subjectType, reason }. Active holds do not block unarchive.
D7. Public request form: the WhatsApp match only considers prospects with archived_at null and anonymized_at null; otherwise a new prospect row is created (same behaviour as conversion's active-only customer match). The public response stays identical either way (no existence leak).
D8. Coverage: one declarative constant listing every guarded writer (module → method) plus the D3 exemption list; a test fails when a repository write method in the covered modules is in neither list (static source scan of repository classes is acceptable — keep it simple and report how it works and its blind spots).
D9. Customer detail privacy DTO (S7.3b-1): add `unarchivable: boolean` (archived AND not anonymized). Additive.
D10. Slices: ARCH-01 server (this run) → S7.3b-2 client (archived fiche read-only, « Désarchiver… » dialog with the reason list, then the rest of S7.3b).
No migration. All API changes additive except the two stop-gap error codes (D1).

Status: ARCH-01 APPROVED_FOR_IMPLEMENTATION

## ARCH-01 execution — 2026-10-26 (Claude)

Status: delivered; committed and pushed 2026-10-26 on Fred’s instruction → Fred: validate; then S7.3b-2 (client).

- Mechanism (D1, D2): `privacy/repositories/subject-freeze.ts` — `assertCustomerWritable(tx, { customerId } | { subscriptionId })` and `assertProspectWritable(tx, { prospectId } | { requestId })` resolve the owner with a plain read, then take the subject row FOR SHARE as the first row lock of the writer transaction (only advisory fences such as cadence 7247001 come before). A frozen subject throws `SubjectArchivedError` (rolls back); each module router catch maps it to 409 { error: CUSTOMER_ARCHIVED | PROSPECT_ARCHIVED } via `respondIfSubjectArchived`. Archive/anonymize/unarchive take the same row FOR UPDATE after the subject advisory lock.
- Guarded writers (route registrations, D8 constant `ARCHIVE_FREEZE_GUARDED_ROUTES`): appointments 3 (schedule, every appointment action via appointmentApiRoutes[action], public response), follow-ups 4, progress 6, documents 8, finance 6, payment-proofs 8 (incl. public upload), receipts 4 (issue, share, link revoke, void), quotes 9 (incl. public respond), consents 6 (incl. public submit), questionnaires 4 (incl. public submit), onboarding 5, subscriptions 1 (every lifecycle command incl. renew via subscriptionApiRoutes[action]), requests 6 (contact attempt, status, qualification, waitlist entry/withdraw, conversion). Total 70 route keys in 13 modules. Placement: one guard per execute dispatcher (after the plain ownership read, before the first FOR UPDATE), per-action owner resolvers in documents, payment-proofs, receipts, quotes.
- Stop-gaps (S7.3b-1) removed: receipts issue and quotes issue now answer CUSTOMER_ARCHIVED through the shared guard.
- Exemptions (D3, `ARCHIVE_FREEZE_EXEMPTIONS`): consent revoke; privacy archive/unarchive/anonymize/holds; jobs privacy.purge, notifications.reconcile, notifications.email-delivery; reads. Also listed because they have no customer/prospect target: consent texts, questionnaire templates, notifications state, customer create, public request form (D7). Public document link verify/download is treated as a read: the link is revoked at archive (D5).
- D5: archive revokes every live link of the subject in its transaction (customer: subscriptions, documents, versions, appointments, installments, proofs, quotes, quote versions, receipts; prospect: its requests) through the same helper anonymize now uses; audit privacy.subject_archived { subjectType, tokensRevoked }. Re-archive: same archivedAt, revokes remaining links, audit privacy.subject_links_revoked { subjectType, tokensRevoked } when > 0.
- D6: POST /admin/customers/:customerId/unarchive and /admin/prospects/:prospectId/unarchive, body { reason } ∈ unarchiveReasons; PRIVACY_SUBJECT_NOT_ARCHIVED / PRIVACY_SUBJECT_ANONYMIZED (409), PRIVACY_INVALID_INPUT (400); audit privacy.subject_unarchived { subjectType, reason }. D7: public request matches only active prospects. D9: privacy.unarchivable.
- Coverage test (D8): scans every router of the covered modules for `router.post|put|patch|delete(<route expression>`; each must be guarded or exempt, no listed route may be stale, and each guarded module must call the assertion in its repositories. A synthetic router source shows an unlisted route failing. Blind spots: the two dynamic families (appointmentApiRoutes[action], subscriptionApiRoutes[action]) are one key each (their dispatchers guard every non-read action); writers reached from GET routes, jobs or scripts are not scanned; the test proves the assertion is present per module, not per action (integration tests cover one representative per module).
- Checks (agent-run): tsc shared/server/client clean; client build ok; shared 72/72; server unit 630/630 (S7.3b-1: 625); integration on kfit_test 614/614 (S7.3b-1: 604; +9 archive-freeze, +1 receipt void). Mutation checks: disabling the customer guard, the archive revocation or the D7 filter each fails the matching integration tests. No flaky unit failure in this run.
- Limits: when a public appointment/consent/questionnaire submission is refused as archived, the access-event row records ROUTE_UNEXPECTED_FAILURE before the 409 (cosmetic). Corrections on an anonymized customer stay refused (D4 open compliance item).

## S7.3b-2 Gate 1 — approved 2026-10-26 (privacy client)

### Context (verified on main 356070a)
- Server API ready: privacyApiRoutes (shared privacy/contracts.ts l.~21: archive/anonymize customer + prospect, holds list/create/release) + unarchive routes (ARCH-01); unarchiveReasons + French labels (l.~56); CreateRetentionHoldInput { scopeType, scopeId, holdType, reason } (l.~94); retentionHoldTypeLabels. GET /admin/customers/archived (S7.3b-1). Customer detail privacy { archivedAt, anonymizedAt, archivable, unarchivable, activeHolds } (shared customers/contracts.ts l.~73); anonymized → whatsapp/email null, fullName = pseudonym. Request detail prospect.privacy { archivedAt, anonymizedAt, archivable }.
- Anonymize controller order (privacy.controller.ts l.~61–68): input → fresh OTP (403 AUTH_FRESH_OTP_REQUIRED) → repository: name mismatch 400 PRIVACY_CONFIRMATION_MISMATCH → hold 409 PRIVACY_RETENTION_HOLD_ACTIVE → 200 (alreadyAnonymized idempotent). Name normalization: server privacy.policy.ts l.~34–36 (NFC + trim + collapse whitespace, case-sensitive).
- OTP step pattern: consents/components/ConsentTextsPage.tsx PublishDialog l.~184–266 (try → 403 → requestSensitiveActionOtp → OtpCodeInput → verifySensitiveActionOtp → retry; sensitiveOtpRequestMessage).
- Fiche: app/routes/client-profile.tsx — header l.~150–220 (no ⋯ menu today; WhatsApp button hidden when whatsapp null), « Nouvel abonnement » disabled button, profileTabs l.37 (apercu, analyse, rendez-vous, suivis, preparation, progression, documents, paiements, sante), TabsContent l.~242–291. UI primitives: components/ui dropdown-menu, dialog, tooltip, field, segmented-control, empty-state, status-pill.
- Clients: customers/components/ClientsPage.tsx — views via customerOverviewViews + `vue` param (l.~21–29), data GET /admin/customers/overview. customers/api/customers-api.ts has no archived/privacy calls. No privacy API client exists.
- Requests: requests/components/RequestDetail.tsx — header l.~137–151 (name, WhatsApp, e-mail, WhatsApp button), ⋯ DropdownMenu l.~156–170 with destructive group.
- Réglages: notifications/components/NotificationSettingsPage.tsx — draft over notificationSettingKeys; registry (shared notifications/contracts.ts l.~86–100) already holds privacy.purge.delay_days (int 1–365, default 30, group "privacy"); DEV TestDataCard l.~27, ~176.
- Gate 1 UI text: sprint-7.md § S7.3 Gate 1 › « UI (S7.3b, French) ».

### Decisions (Fred 2026-10-26)
D1. Clients: new view « Archivés » (vue=archives), fed by GET /admin/customers/archived (own query, not the overview). Columns: Nom (pseudonym when anonymized), Archivé le, État (pill « Archivé » or « Anonymisé »), Blocages (count, hidden when 0). Row → fiche. Empty « Aucun client archivé ». Other views unchanged.
D2. Archived fiche (archived, not anonymized): banner under the header « Client archivé le {date} · fiche en lecture seule. » + button « Désarchiver… ». Tab contents wrapped in one ReadOnlyFiche boundary = native `<fieldset disabled>` (disables every button/input inside; links stay usable). « Analyse » tab hidden (server 404). « Nouvel abonnement » hidden. Subscription chips and tab switching stay usable.
D3. Header ⋯ menu (new): active customer → « Archiver le client » (disabled + tooltip « Tous les abonnements doivent être terminés ou annulés. » when !archivable) and « Ajouter un blocage de conservation »; archived → « Désarchiver… » (when unarchivable), « Ajouter un blocage de conservation », separator, « Anonymiser… » (destructive); anonymized → « Ajouter un blocage de conservation » only. Archive confirm dialog: « Archiver {nom} ? La fiche passe en lecture seule et les liens publics envoyés au client sont désactivés. Tu pourras la désarchiver. » → « Archiver ».
D4. Unarchive dialog: required radio list of the 3 unarchiveReasons (shared labels, no default) + note « Les liens publics désactivés ne sont pas rétablis. » → « Désarchiver ». Errors: 409 PRIVACY_SUBJECT_ANONYMIZED / NOT_ARCHIVED → refetch + message.
D5. Anonymize dialog (Gate 1 text): warning paragraph; when activeHolds > 0 → message « Un blocage de conservation est actif sur ce client. Lève-le avant d'anonymiser. » and the action disabled; field « Saisis le nom {NOM} pour confirmer »; action enabled only when the normalized input equals the displayed name — move the server normalization function to @kfit/shared and reuse it on both sides (no copy; server tests unchanged). Flow follows the server order: submit → 403 → OTP step (PublishDialog pattern, « Code envoyé à ton adresse e-mail ») → auto-retry → 400 mismatch → back to the name step « Le nom saisi ne correspond pas. » → 409 hold → hold message + refetch holds. Success: toast « Client anonymisé. », refetch detail + archived list, focus back to the ⋯ trigger. The typed name is never persisted (no draft storage) nor logged.
D6. Anonymized view: title/breadcrumb = pseudonym, no contact lines, no WhatsApp button, pill « Anonymisé »; banner « Données effacées le {date}. Les paiements, devis et reçus sont conservés. »; tabs Progression, Documents, Santé et consentements → EmptyState « Données effacées le {date} »; Analyse hidden; other tabs read-only as in D2.
D7. Holds card « Blocages de conservation » under the header, outside the read-only boundary, shown when ≥ 1 active hold (GET holds?scopeType=customer&scopeId=). Rows: type label, motif, posé le {date}, « Lever le blocage » (confirm dialog « Lever ce blocage ? L'anonymisation et la suppression des fichiers redeviennent possibles. »). « Ajouter un blocage de conservation » dialog: type (select, retentionHoldTypeLabels) + motif (required textarea, server max) → « Ajouter ». Available in every state. Customer scope only (document holds stay API-only).
D8. Prospect (RequestDetail): pill « Prospect archivé » / « Prospect anonymisé » in the header. Archived → decision actions (primary + ⋯ decisions) hidden; ⋯ = « Désarchiver le prospect… », separator, « Anonymiser le prospect… ». Anonymized → pseudonym, no WhatsApp/e-mail/WhatsApp button, no ⋯ menu. Active and archivable → extra destructive group item « Archiver le prospect ». Same dialog components as the customer (subjectType prop; confirmation name = prospect.fullName). No holds card for prospects (API-only).
D9. Réglages: section « Confidentialité » with one number field « Délai avant suppression des fichiers (jours) » (1–365, registry label) + help « Les fichiers d'un client anonymisé sont supprimés définitivement après ce délai. », saved through the existing save flow. Notification sections keep only their own keys.
D10. One client map privacy-error-messages.ts for every privacy + archive code (incl. CUSTOMER_ARCHIVED « Ce client est archivé : désarchive-le pour modifier sa fiche. », PROSPECT_ARCHIVED, PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION, PRIVACY_SUBJECT_HAS_OPEN_REQUEST, AUTH_FRESH_OTP_REQUIRED handled by the flow). If a central client error-to-message fallback exists, add CUSTOMER_ARCHIVED / PROSPECT_ARCHIVED there; otherwise report, do not edit every module.
D11. API client: new privacy/api/privacy-api.ts (archive, unarchive, anonymize, holds list/create/release) + customersApi.archived(). Query keys invalidated on every privacy mutation: customer detail, customers overview, archived list, holds, request detail/queue. Desktop + 390 px, keyboard, focus return (S7.2b patterns), French UI.
No server change. If one turns out necessary, STOP and ask (one yes/no question).

Status: S7.3b-2 APPROVED_FOR_IMPLEMENTATION

## S7.3b-2 execution — 2026-10-26 (Claude)

Status: delivered, uncommitted → Fred: validate S7.3b-2 + ARCH-01 live (manual steps in the brief).

- Shared (`privacy/subject-view.ts`, tests `subject-view.test.ts`, 5 tests): `normalizeConfirmName` / `confirmationMatches` moved from server privacy.policy.ts (the policy re-exports them, server tests unchanged); `subjectMode` (active | archived | anonymized), `customerPrivacyMenu` (D3), `prospectPrivacyMenu` (D8), `ficheTabVisibility` + `ficheReadOnly` (D2, D6).
- Client API (D11): `privacy/api/privacy-api.ts` (archive, unarchive, anonymize per subject type; customer holds list/create/release), `customersApi.archived()`, `privacy/api/privacy-queries.ts` (archived list, active customer holds, `usePrivacyRefresh` invalidating ["customers"], ["privacy","holds"], ["requests"]). Error map `privacy/lib/privacy-error-messages.ts` (D10).
- D10 central fallback: none exists — each of 17 client modules has its own `*ErrorMessage`; CUSTOMER_ARCHIVED / PROSPECT_ARCHIVED are mapped only in the privacy map (not added module by module). With the read-only fiche, those codes are reachable only through a race.
- Clients (D1): view « Archivés » (vue=archives) after the overview views, own query, columns Nom / Archivé le / État / Blocages, mobile cards. The view row now renders independently of the overview query.
- Fiche (D2–D7): ⋯ menu from `customerPrivacyMenu` (disabled « Archiver le client » with tooltip + sr-only reason); banners archived / anonymized; `ReadOnlyFiche` = `<fieldset disabled>` around tab contents (reset styles, min-w-0); Analyse hidden and unknown tab → Aperçu; « Nouvel abonnement » hidden when frozen; anonymized: pill, no contact lines, no WhatsApp, erased tabs (Progression, Documents, Santé) → EmptyState. Holds card outside the boundary, release + add dialogs. Dialogs: archive, unarchive (radio reasons, no default), anonymize (name step → 403 auto-sends the code → verify → auto-retry → 400 back to name step → 409 hold message + refresh). Focus returns to the opener, or the ⋯ trigger when the opener is gone (`usePrivacyDialog`).
- RequestDetail (D8): pills « Prospect archivé » / « Prospect anonymisé »; frozen → no decision buttons, no « + Tentative », ⋯ = privacy entries only; anonymized → no contact text, no WhatsApp, no ⋯; active + archivable → « Archiver le prospect » in the destructive group.
- Réglages (D9): card « Confidentialité », number field on privacy.purge.delay_days (registry label, 1–365, inline error), saved by the existing Enregistrer.
- Checks (agent-run): tsc shared/server/client clean; client build ok; shared 77/77 (+5); server unit 630/630; integration on kfit_test 614/614 (shared change on the server path).
- NOT VALIDATED by the agent: browser runs (desktop + 390 px), ARCH-01 HTTP 409 checks from the console — Fred runs them from his browser (agent browser use declined).
- Limits: prospect anonymize dialog passes activeHolds=0 (prospect holds are API-only); a server 409 still shows the hold message. Anonymized prospect detail relies on the request detail route returning anonymized prospects (not exercised by the agent).

## FIX-02 Gate 1 — approved 2026-10-26 (error handling after S7.3)

### Context (verified on main 544b57d)
- Drizzle wraps driver errors: SQLSTATE/constraint sit on `error.cause`. Two helpers read only the top level → a real unique violation becomes 500:
  - requests/repositories/requests.repositories.ts l.15 isUniqueViolation (used l.127 service_requests_submission_token_uq, l.135 service_requests_reference_uq retry) → Notion row « Collision de jeton de demande… »;
  - catalogue/repositories/catalogue.repositories.ts l.135 isUniqueViolation (used l.250, l.265 → "slug_conflict").
- Local helpers that already walk the cause chain (behaviour to preserve): quotes.repository.ts l.21 dbCode, receipts.repository.ts l.20 dbCode, finance.repository.ts l.23 databaseFailure, payment-proofs.repository.ts l.20 databaseCode, catalogue-content.repository.ts l.47 isUniqueViolation, request-conversion.repository.ts l.16 isConversionLinkConflict, dev-tools/repositories/test-data.repository.ts l.26 isForeignKeyViolation.
- Public access events record the wrong result when ARCH-01 refuses: appointments.repository.ts l.222 (APPOINTMENT_ROUTE_UNEXPECTED_FAILURE), consent.repository.ts l.251 (CONSENT_ROUTE_UNEXPECTED_FAILURE), questionnaire.repository.ts l.246 (QUESTIONNAIRE_ROUTE_UNEXPECTED_FAILURE). SubjectArchivedError lives in the privacy module (privacy/routes/subject-archived.response.ts uses it).
- Documents: documents.service.ts persistThen l.72–80 already removes the stored file when the repository fails or throws (incl. SubjectArchivedError) → no orphan; only a test is missing.
- Flaky: express unit tests fail with « fetch failed » on a random test in ~2/5 full runs (reported in ARCH-01 / S7.3b-2).
- Client: 18 module `<module>ErrorMessage(error)` functions (e.g. finance/api/finance-api.ts l.30), each duplicating the AUTH_SESSION_REQUIRED and AUTH_CSRF_INVALID / AUTH_ORIGIN_INVALID branches. CUSTOMER_ARCHIVED / PROSPECT_ARCHIVED French texts exist only in privacy/lib/privacy-error-messages.ts l.~19 → other modules show their generic fallback.

### Decisions (Fred 2026-10-26)
D1. One server helper `pgErrorInfo(error): { code: string; constraint: string | null } | null` in packages/server/src/db/pg-error.ts: walks `.cause` (stops on self-reference and after 10 levels), returns the first object with a string `code`. Plus `isPgUniqueViolation(error, constraint?)` and `isPgForeignKeyViolation(error)`. Replace the 2 buggy helpers AND the 7 local walkers by it (pure refactor for those 7 — same outcomes; existing tests unchanged). No other behaviour change.
D2. Effects of D1: request token collision → existing retry/409 path (whatever l.127/135 already intend); catalogue offer slug conflict → existing "slug_conflict" outcome → its current 409 code. Do not invent new codes.
D3. Access events: when the caught error is SubjectArchivedError, record its code (CUSTOMER_ARCHIVED / PROSPECT_ARCHIVED) instead of *_ROUTE_UNEXPECTED_FAILURE in the 3 repositories above. Grep every other repository that records a *_ROUTE_UNEXPECTED_FAILURE result into an access/event row and apply the same rule there (report the list). The HTTP response stays 409 (unchanged).
D4. Documents: regression test only — upload on an archived customer → 409 CUSTOMER_ARCHIVED and the storage directory contains no new file (use the test storage root). Same for add-version.
D5. Flaky « fetch failed »: diagnose (likely server listen/close lifecycle or port reuse in the express test helper, or keep-alive sockets after close). Fix only if the cause is in the test harness (e.g. listen on port 0 + await close + closeAllConnections). Product code unchanged. Prove with 10 consecutive full unit runs (report pass count). If not reproducible or the cause is elsewhere, report the evidence and leave it.
D6. Client: one `commonApiErrorMessage(code: unknown): string | null` in client lib/api-error-messages.ts handling AUTH_SESSION_REQUIRED, AUTH_CSRF_INVALID, AUTH_ORIGIN_INVALID (current texts, unchanged) and CUSTOMER_ARCHIVED, PROSPECT_ARCHIVED (texts moved from privacy-error-messages.ts, privacy keeps importing them). Each of the 18 module functions calls it first and drops its own duplicated AUTH branches. Module-specific messages keep priority only for module codes. No visual change otherwise.
No migration. No API contract change.

Status: FIX-02 APPROVED_FOR_IMPLEMENTATION

## FIX-02 execution — 2026-10-26 (Claude)

Status: delivered, uncommitted → Fred: validate.

- Counts: shared 77 → 77; server unit 630 → 633 (+3 pg-error); integration on kfit_test 614 → 618 (+4: forced token collision, slug conflict, D3 access events, D4 documents).
- D1: `packages/server/src/db/pg-error.ts` (`pgErrorInfo`, `isPgUniqueViolation`, `isPgForeignKeyViolation`; constants PG_UNIQUE_VIOLATION, PG_FOREIGN_KEY_VIOLATION, PG_ERROR_MAX_DEPTH = 10). Replaced 9 helpers: requests.repositories isUniqueViolation and catalogue.repositories isUniqueViolation (the 2 top-level-only ones), quotes dbCode, receipts dbCode, finance databaseFailure, payment-proofs databaseCode, catalogue-content isUniqueViolation, request-conversion isConversionLinkConflict (now two `isPgUniqueViolation(error, constraint)` calls), test-data isForeignKeyViolation. Their existing tests are unchanged and green.
- D2: new integration test forces the submission-token collision deterministically (an open transaction holds an uncommitted row with the same token; the repository insert blocks on the unique index; commit → wrapped 23505 → existing replay path → "replayed"). The existing race test is kept; with the helper mutated back to top-level-only it still passes (it rarely reaches the collision path), while the forced test fails. Catalogue: real router + service + repository over HTTP, duplicate slug on create and on PATCH → 409 CATALOGUE_SERVICE_SLUG_CONFLICT (was 500); fails under the same mutation.
- D3: `accessFailureResult(error, unexpected)` in privacy/repositories/subject-freeze.ts; applied in appointments.repository.ts, consent.repository.ts, questionnaire.repository.ts. Grep of every repository writing an access/event row from a catch: only those 3. quotes.repository.ts l.96 records QUOTE_ROUTE_UNEXPECTED_FAILURE for a PDF render failure inside the transaction (not a caught freeze) → unchanged. Test: archived customer + live tokens inserted after archive → each public call rejects with CUSTOMER_ARCHIVED and the access event row records CUSTOMER_ARCHIVED (fails when the helper is mutated). HTTP stays 409.
- D4: test over the real documents router with PrivateDocumentStorage on a temp root and a local ClamAV INSTREAM stand-in: upload and add-version on an archived customer → 409 CUSTOMER_ARCHIVED, storage root empty after each (fails when persistThen's catch-side remove is disabled). No product change.
- D5: not fixed — cause not in the named harness pattern. Evidence: all 25 express tests listen on port 0; 21 already use closeAllConnections + awaited close, including subscriptions.express.test where a failure was observed (2 consecutive tests). 1 failure in 13 plain full runs before the final check, 0 in 35 runs with a fetch-cause preload (15 single, 20 under double load), so the cause code was never captured. Final 10 consecutive full unit runs: 9 × 633/633, 1 × 628/633 — 5 tests failing at once in 3 different test files (finance, follow-ups, privacy express), i.e. separate processes, which points to the environment (Windows loopback/socket or load) rather than one test helper. Product and harness unchanged; backlog line kept.
- D6: `packages/client/src/lib/api-error-messages.ts` `commonApiErrorMessage(code, audience = "admin")` with AUTH_SESSION_REQUIRED / AUTH_CSRF_INVALID / AUTH_ORIGIN_INVALID (one wording, Fred 2026-10-26: majority texts) and CUSTOMER_ARCHIVED / PROSPECT_ARCHIVED (moved from privacy-error-messages.ts, which imports them). 18 module functions call it first: appointments, catalogue, consents, customers, dashboard, documents, finance, follow-ups, notifications, onboarding, payment-proofs, privacy, progress, questionnaires, quotes, receipts, subscriptions, requests (new `requestErrorMessage(error)` used by the 4 admin call sites; the public request form keeps its typed path). Wording change accepted by Fred: AUTH texts in customers, privacy, notifications, consents, questionnaires now use the common wording; documents, quotes, requests, dashboard (CSRF) gain AUTH messages instead of their fallback.
- D6 addition (no visual change for customers): the 7 functions also used by public link pages take `audience`; the 16 public call sites pass "public", so CUSTOMER_ARCHIVED / PROSPECT_ARCHIVED keep showing the module's existing fallback to the customer instead of the coach instruction « désarchive-le… ».
- Checks (agent-run): tsc shared/server/client clean; client build ok; shared 77/77; server unit 10 runs as above; integration 618/618.
- Limits: D5 open (environmental flake, ~1 run in 10–20 on this machine). No browser check of D6 texts (no runner; tsc + build only).

## SEC-01 Gate 1 — approved 2026-10-26 (security floor, CVE-2026-111497)

### Context (verified on main 1bfbc31)
- Runtime not pinned: root package.json engines `"node": ">=22"`; no .nvmrc; .github/workflows/ci.yml setup-node `node-version: 22` (resolves whatever 22.x the runner has).
- Lockfile: express 5.2.1, body-parser 2.3.0 (decodes `Content-Encoding: br` request bodies).
- Body parsers: app.ts l.84 `app.use(express.json({ limit: "1mb" }))` inside createServerApp (app-level, before every router); documents/routes/express-documents.router.ts l.12 `raw({type:[pdf, jpeg, png, webp]})`. Check payment-proofs and any other router for `raw(` / `express.raw` / `express.text` / `urlencoded` and list them.
- Entrypoint: only dev-app.ts createDevelopmentRuntime (l.~92) — no production entrypoint yet (S7.4 later). No Dockerfile yet.
- Outbound HTTP: no server-side fetch/axios/http.request found in src (grep). Puppeteer renders local HTML; SMTP via nodemailer.

### Decisions (Fred 2026-10-26)
D1. Security-floor registry: packages/server/src/security/security-floor.ts — one declarative constant SECURITY_FLOOR = [{ id: "CVE-2026-111497", component: "node", minimumByLine: { 22: "22.23.4", 24: "24.22.1", 26: "26.12.1" }, publishedAt: "2026-10-22", note: "Brotli decoder OOB write (Node2Shell / HTTP2Shell)" }]. Pure function evaluateRuntimeFloor(version: string, floor = SECURITY_FLOOR) → { ok: true } | { ok: false, failures: [{ id, reason: "below_minimum" | "unsupported_line", current, required? }] }. A major line absent from minimumByLine = unsupported_line (covers EOL 20/25/18…). Semver compare without new dependency. Runtime advisories only; npm packages stay with npm audit. Adding the next advisory must be a one-entry change (say so in a comment).
D2. Startup check: assertRuntimeSecurityFloor({ nodeEnv, version = process.version, log }) — production → throw (refuse to start) with the failure ids; any other env → one structured warning (ids + versions, no stack). Called first in createDevelopmentRuntime and exported for the future production entrypoint (S7.4). Named constant for the error code SECURITY_FLOOR_NOT_MET.
D3. CI + local pinning: add `.nvmrc` = 22.23.4; root engines `">=22.23.4"`; ci.yml setup-node `node-version-file: .nvmrc`; new CI step right after Setup Node: `node packages/server/scripts/security/check-runtime-floor.mjs` (reads the compiled registry or a tiny duplicated-free JSON export — no copy of the table; exits 1 with the failure list). Also `npm run security:check` at root running the same script. Do not run npm ci.
D4. Request encoding guard: middleware rejectEncodedRequestBodies mounted in createServerApp BEFORE express.json (therefore before every router, incl. documents raw). Allowed: header absent, or exactly "identity" (case-insensitive, trimmed). Anything else (br, gzip, deflate, lists) → 415 { error: "REQUEST_ENCODING_UNSUPPORTED" }, body never read. Named constant ALLOWED_REQUEST_CONTENT_ENCODINGS = ["identity"] citing CVE-2026-111497. Applies to every method, admin and public routes. Response compression (if any) unaffected.
D5. Outbound: confirm by grep (src + scripts) that no server code fetches remote HTTP. If one exists, report it (file, line, target) and do NOT change it — decision in S7.4 Gate 1.
D6. Deploy note for S7.4 (doc only, no Dockerfile now): sprint-7.md S7.4 prerequisites gets "base image pinned to an exact patched tag (e.g. node:22.23.4-alpine, never node:22); smoke test records `node --version`; security:check runs in the image build".
No migration. No API contract change except the new 415 code (add it to the shared error vocabulary only if a shared list of generic HTTP codes exists; otherwise server constant + report).

Status: SEC-01 APPROVED_FOR_IMPLEMENTATION

## SEC-01 execution — 2026-10-26 (Claude)

Status: delivered, uncommitted → Fred: validate.

- Node used: v24.22.1 (above the floor for line 24). `npm run security:check` → ✔.
- Counts: shared 77 → 77; server unit 633 → 643 (+5 floor/startup, +3 encoding middleware, +2 check script); integration on kfit_test 618 → 618.
- D1: `packages/server/src/security/security-floor.ts` — SECURITY_FLOOR (one entry, CVE-2026-111497), `parseNodeVersion` (strict "vX.Y.Z" / "X.Y.Z"; a suffix or anything else is unreadable), `evaluateRuntimeFloor`. Unreadable versions fail closed as `unsupported_line` (keeps D1's two reasons). Next advisory = one entry (comment + test with a synthetic second entry).
- D2: `security/runtime-floor.startup.ts` — SECURITY_FLOOR_NOT_MET, SecurityFloorError, `assertRuntimeSecurityFloor({ nodeEnv, version, log })`; first statement of createDevelopmentRuntime; exported for the S7.4 production entrypoint. Dev warning = one line `SECURITY_FLOOR_NOT_MET {"failures":[…]}`, no stack.
- D4: `security/reject-encoded-request-bodies.ts` — ALLOWED_REQUEST_CONTENT_ENCODINGS = ["identity"], REQUEST_ENCODING_UNSUPPORTED; mounted in createServerApp after the request logger and before express.json, so before every parser. Responses set `Connection: close` so the unread body cannot be parsed as a next request on the same socket. No shared list of generic HTTP codes exists → server constant only.
  - Parser coverage (all behind the guard): app.ts `express.json({ limit: "1mb" })` (app-level); documents router `raw({ type: pdf/jpeg/png/webp, limit: "11mb" })` (create, add-version, progress photo); payment-proofs router `raw({ type: () => true, limit: "11mb" })` invoked inside the public upload handler. No express.text / urlencoded anywhere in src.
  - Tests through the real createServerApp: br, gzip, deflate, case/space variants and lists → 415 with the handler never reached; absent / identity / " Identity " reach the route; GET /health unaffected; document upload (br) and public payment-proof upload (gzip) → 415 before raw(); control upload without the header reaches storage. Removing the mount from dist/app.js fails 2 of the 3 tests. Live dev API: POST /requests with `Content-Encoding: br` → 415.
- D3: `.nvmrc` = 22.23.4; root engines `>=22.23.4`; root `npm run security:check`; ci.yml setup-node `node-version-file: .nvmrc` + step "Runtime security floor" right after Setup Node. `scripts/security/check-runtime-floor.mjs` runs before `npm ci`/build, so it imports the registry source `src/security/security-floor.ts` through Node type stripping (no dist, no copy of the table); a Node too old to strip types is below every floor line, and the import failure exits 1. KFIT_SECURITY_FLOOR_TEST_VERSION is ignored when NODE_ENV=production. Script tests: exit 0 on this runner, exit 1 for v22.23.3 and v20.19.0, override ignored in production.
- D5: no outbound HTTP in packages/server/src (only TCP to ClamAV: dev/startup-checks.ts l.29, documents/services/document-storage.service.ts l.46). Scripts (dev preflights, not runtime): preflight/auth-staging.mjs l.31 → AUTH_STAGING_PROXY_URL (default http://127.0.0.1:8080); preflight/password-recovery.mjs l.168 → its own local test server, l.183 and l.205 → Mailpit API (MAILPIT_API_URL, default http://127.0.0.1:8025); preflight/files.mjs l.42/73 → ClamAV TCP. Unchanged; for S7.4 Gate 1.
- Limits: CI not run here (the new step and `node-version-file` are validated only by reading the workflow and running the script locally on Node 24); type stripping on Node 22.23.4 is assumed from the 22.x line, not run. package-lock.json still records the root engines `>=22` (npm rewrites it on the next install; npm ci not run, per D3). One full unit run had 5 express failures in 2 files (receipts, admin-requests) while the watch-mode dev API was restarting on the same dist/; the 2 files passed 3/3 alone and the next full run passed 643/643 — same flake as FIX-02 D5.

## S7.4 prerequisites (SEC-01 D6)
- base image pinned to an exact patched tag (e.g. node:22.23.4-alpine, never node:22); smoke test records `node --version`; security:check runs in the image build.

## S7.4 Gate 1 — approved 2026-10-26

Scope: code-side production readiness + proven backup/restore. Actual staging/production deployment, Dockerfile, nginx, Certbot, host timer install and off-server destination = Sprint 9.
D1 shared runtime factory, createProductionRuntime(), dev tools never mounted in production.
D2 production refuse-to-start: security floor, required env present and not placeholder, KFIT_APP_BASE_URL https, DB not kfit_dev/kfit_test, privacy journal dir writable, no published consent titled « DÉMONSTRATION ».
D3 privacy jobs always on in production; KFIT_PRIVACY_JOBS=off refused.
D4 global X-Request-Id: valid UUID kept, otherwise generated; echoed in the response.
D5 outbound HTTP: none in runtime; dev preflights dev-only; SEC-01 audit closed.
D6 ops:backup → encrypted bundle (pg_dump custom + private files + privacy journal + SHA-256 manifest) to BACKUP_DIR, copied to BACKUP_SECONDARY_DIR; BACKUP_ENCRYPTION_KEY never logged.
D7 retention 7 daily + 4 weekly (named constants), rotated by the script.
D8 scheduling by host timer calling the script (not node-cron); documented in S7.4, installed in Sprint 9.
D9 ops:restore: verify manifest first; restore into a named target DB; refuse non-empty target without --confirm-overwrite; restore files + journal; run privacy:replay automatically before traffic; audit event with counts only; replay guard widened to the confirmed restore target, still refuses kfit_dev.
D10 automated restore drill test: backup → anonymize after backup → restore → subject re-anonymized, files and counts match.
D11 runbook docs/runbooks/backup-restore.md + production start checklist; Fred runs a full local drill on the prod compose = S7.4 acceptance.
Then SEC-02 (trusted devices / suspicious-device OTP) before Sprint 8 UAT.

## S7.4a scope

### Context (verified on main 580fca4)
- Only runtime: src/dev-app.ts createDevelopmentRuntime() (l.~93), started by scripts/dev/api-server.mjs (loads ../.env, refuses kfit_test, runStartupChecks, starts notification + privacy jobs, listens 127.0.0.1, SIGINT/SIGTERM shutdown). AuthRouteService cookieMode hard-coded "development" (l.119) → cookies not Secure. devToolsController always passed (l.306). No `trust proxy`.
- Privacy jobs: api-server.mjs l.35 `KFIT_PRIVACY_JOBS=off` disables; journal optional (dev-app.ts l.247 createPrivacyJournal(process.env.KFIT_PRIVACY_JOURNAL_DIR), warning only).
- Env read by src: DATABASE_URL, NODE_ENV, LOG_LEVEL, KFIT_APP_BASE_URL, PRIVATE_STORAGE_ROOT, CLAMAV_HOST/PORT, SMTP_HOST (+ SMTP_* in .env.example), AUTH_ACCESS_TOKEN_SECRET, AUTH_AUDIT_HASH_PEPPER, AUTH_OTP_PEPPER, AUTH_RECOVERY_TOKEN_SECRET, AUTH_REFRESH_TOKEN_PEPPER (loadAuthConfig), KFIT_PRIVACY_JOURNAL_DIR, plus document/other peppers — grep and list the complete set. .env.prod.example only has POSTGRES_* + DATABASE_URL.
- consent_definitions (db/schema/onboarding.ts l.35): title, status ("draft" default; published state value — confirm), publishedAt, retiredAt.
- X-Request-Id: 13 routers read headers["x-request-id"] (auth, customers, requests, admin-requests, onboarding, privacy, catalogue, today, analytics, subscriptions, documents, notifications, dev-tools); only notifications and dev-tools validate it. audit_events.request_id is uuid → a non-UUID header makes audited writes fail (500).
- database-target.ts has namesIntegrationTestDatabase().

### Decisions (Gate 1 D1–D5, detailed)
A1 (D1). Runtime factory: extract the shared wiring of createDevelopmentRuntime into createRuntime(options: { mode: "development" | "production"; env }) in src/runtime.ts; createDevelopmentRuntime() and new createProductionRuntime() are thin wrappers. Production: cookieMode "production"; devToolsController NOT passed (and dev-tools module not imported by the production entry chain if feasible — report); `app.set("trust proxy", "loopback")` (nginx on the same host, Sprint 9). Dev behaviour byte-for-byte unchanged (existing tests prove it).
A2 (D1). Entrypoint: scripts/prod/api-server.mjs — no dotenv (env comes from the process/compose), NODE_ENV must equal "production" else exit 1; runs the production guards (A3) BEFORE listen; binds KFIT_API_HOST (default 127.0.0.1) and KFIT_API_PORT; starts notification + privacy jobs; graceful shutdown like dev. Root/server script `start:prod` (requires prior build). Not wired into any compose file yet (Sprint 9).
A3 (D2). Guards in src/runtime/production-guards.ts — pure checks + one async DB check, each failure has a code; all failures collected then one error listing codes (no secret values in messages):
  - SECURITY_FLOOR (existing assertRuntimeSecurityFloor, production throws);
  - ENV_MISSING: named constant PRODUCTION_REQUIRED_ENV (complete list from Context grep, incl. SMTP_*, PRIVATE_STORAGE_ROOT, CLAMAV_*, KFIT_PRIVACY_JOURNAL_DIR, KFIT_APP_BASE_URL, all AUTH_* secrets/peppers); empty or placeholder values (named PLACEHOLDER_PATTERNS: "change-me", "changeme", "example", "dev-", "xxx", "todo", case-insensitive) count as missing; secrets shorter than 32 chars → ENV_WEAK_SECRET;
  - APP_BASE_URL_NOT_HTTPS;
  - DATABASE_TARGET_FORBIDDEN: database name kfit_dev or kfit_test, or host localhost:5433 (dev port);
  - PRIVACY_JOURNAL_UNAVAILABLE: dir exists, is a directory, writable (write+remove a probe file);
  - PRIVACY_JOBS_DISABLED: KFIT_PRIVACY_JOBS=off in production (D3); KFIT_NOTIFICATION_JOBS=off allowed but logged as warning;
  - DEMO_CONSENT_PUBLISHED (S7.3 D9): any consent_definitions row currently published (status published, retiredAt null) whose title contains « DÉMONSTRATION » (case-insensitive, accent-insensitive: also DEMONSTRATION) → refuse; message gives count and consent types only.
  Exported runProductionGuards({ env, pool/db, version }) → { ok } | { ok:false, failures:[{code, detail}] }.
A4 (D3). Privacy jobs always start in production; journal mandatory (A3). Dev unchanged.
A5 (D4). Global middleware requestIdMiddleware mounted first in createServerApp (before the SEC-01 encoding guard): keep header if it is a canonical UUID (any version, case-insensitive, single value), otherwise overwrite req.headers["x-request-id"] with randomUUID(); always set response header X-Request-Id. Remove the now-redundant local guards in notifications and dev-tools only if trivially equivalent; leave the other 11 routers reading the header (they now always get a UUID). Named constant cites S7.4 D4.
A6 (D5). Outbound HTTP: record in sprint-7.md "SEC-01 D5 audit closed: runtime has no outbound HTTP; dev preflight scripts are dev-only (auth-staging, password-recovery/Mailpit)". No code change.
A7. .env.prod.example: add every PRODUCTION_REQUIRED_ENV key with an obvious placeholder value (so the guard rejects an unedited copy) and a one-line French comment per group. No real values. .env.staging.example: same keys.
No migration. No API contract change except the always-present X-Request-Id response header.

Status: S7.4a APPROVED_FOR_IMPLEMENTATION

## S7.4a execution — 2026-10-26 (Claude)

Status: delivered, uncommitted → Fred: validate.

- Node v24.22.1; `npm run security:check` ✔. Counts: shared 77 → 77; server unit 643 → 656 (655 pass + 1 skipped: read-only journal dir on Windows); integration on kfit_test 618 → 623, also 623/623 without the root .env (CI-like).
- A1: `src/runtime.ts` `createRuntime({ mode, env, devToolsController? })` holds the whole composition (moved verbatim from dev-app.ts; `process.env` → `env`; cookieMode = mode). `dev-app.ts` = development wrapper injecting the dev-tools factory; `prod-app.ts` `createProductionRuntime(env)`. Production: Secure cookies, `trust proxy` = "loopback" (PRODUCTION_TRUST_PROXY), dev tools never mounted.
  - Dev-tools exclusion: runtime.ts and prod-app.ts import only the DevToolsController type; controller, service and repository are loaded by dev-app.ts only. app.ts still imports the dev-tools router module (routing code, mounted only when a controller is passed) — not loaded: the destructive service/repository.
- A2: `scripts/prod/api-server.mjs` (no dotenv; NODE_ENV must be "production"; guards before anything listens; DB client loaded only when the guards need it; runStartupChecks; privacy jobs always, notification jobs unless KFIT_NOTIFICATION_JOBS=off; binds KFIT_API_HOST (default 127.0.0.1) : KFIT_API_PORT; SIGINT/SIGTERM shutdown). `npm run start:prod` (root + server). Not wired into compose (Sprint 9).
- A3: `src/runtime/production-guards.ts`. Codes: SECURITY_FLOOR, ENV_MISSING, ENV_WEAK_SECRET, APP_BASE_URL_NOT_HTTPS, DATABASE_TARGET_FORBIDDEN, PRIVACY_JOURNAL_UNAVAILABLE, PRIVACY_JOBS_DISABLED, DEMO_CONSENT_PUBLISHED. All collected, one log line `CODE (detail)` with key names / counts / consent types only.
  - PRODUCTION_REQUIRED_ENV: DATABASE_URL, KFIT_APP_BASE_URL, PRIVATE_STORAGE_ROOT, KFIT_PRIVACY_JOURNAL_DIR, CLAMAV_HOST, CLAMAV_PORT, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, AUTH_OTP_PEPPER, AUTH_AUDIT_HASH_PEPPER, AUTH_REFRESH_TOKEN_PEPPER, AUTH_ACCESS_TOKEN_SECRET, AUTH_RECOVERY_TOKEN_SECRET (secrets = the 5 AUTH_*, ≥ 32 chars). Optional, defaulted: NODE_ENV, LOG_LEVEL, AUTH_*_TTL/limits (loadAuthConfig), KFIT_API_HOST/PORT, KFIT_NOTIFICATION_JOBS.
  - PLACEHOLDER_PATTERNS also contains "change_me" (deviation: the existing .env.*.example values are CHANGE_ME_WITH_A_STRONG_SECRET, which the brief's list did not match).
  - A key already ENV_MISSING is not probed again (journal dir, database). The demo-consent query is read-only and also runs on a forbidden target; an unreachable database reports DEMO_CONSENT_PUBLISHED "not verified".
- A4: privacy jobs always start in the production entry; the journal is required by the guards. Dev unchanged.
- A5: `src/http/request-id.middleware.ts` mounted first in createServerApp (before the request logger and the SEC-01 guard): canonical UUID kept, anything else (absent, empty, malformed, oversized, repeated → Node joins "a, b") replaced by randomUUID(); X-Request-Id always on the response. Routers touched: none — the 11 reading the header now always get a UUID; the local guards in notifications and dev-tools were kept because both routers are also mounted alone in their own express tests (in the app they are now no-ops).
- A6: SEC-01 D5 audit closed: runtime has no outbound HTTP; dev preflight scripts are dev-only (auth-staging, password-recovery/Mailpit).
- A7: .env.prod.example and .env.staging.example gain every PRODUCTION_REQUIRED_ENV key with a « change-me » placeholder and a French comment per group. Unedited copies refused with ENV_MISSING only (verified by running the entry with each file).
- Tests: guards (unit, each code alone, all-good, multiple, placeholders, short secrets, targets, journal missing / file / read-only skipped on Windows), demo consent (integration: draft/retired ok, published and unaccented refused), runtime (integration: Secure cookies, trust proxy, dev tools 404 in production; dev unchanged), request id (express: kept / replaced / echoed / seen by the route; integration: login with "not-a-uuid" → 200 and audited with the generated UUID — fails when the middleware is removed), entry smoke (spawn: NODE_ENV ≠ production → 1; empty production env → 1, ENV_MISSING, planted value never printed).
- Verified by hand: dev API restarted unchanged (same startup lines); `x-request-id: nope` on the dev API → generated UUID echoed; NODE_ENV=production with the dev .env → ENV_MISSING, DATABASE_TARGET_FORBIDDEN, DEMO_CONSENT_PUBLISHED (refused before listen).
- Limits: no production start was attempted (by design); runStartupChecks is reused from dev/ (it checks DB, SMTP, ClamAV). Read-only journal-dir test runs on Linux CI only.

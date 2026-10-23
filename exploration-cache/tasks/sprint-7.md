# K'FIT — Sprint 7 execution spec

## Objective

Deliver the V1 Core operational layer: dashboard KPIs and alert workspaces, notification engine, retention/anonymization, backup/restore readiness and remaining hardening before Sprint 8 UAT.

## Ordered tasks

1. S7.1 — Core dashboard KPIs and operational alert workspaces — CLOSED / validated 2026-10-23.
2. S7.2 — Dashboard and email notification engine with configurable reminders — APPROVED_FOR_IMPLEMENTATION.
3. S7.3 — Retention, anonymization, soft-delete purge and privacy-action replay — CLOSED until S7.2 validation.
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

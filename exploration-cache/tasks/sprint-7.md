# K'FIT — Sprint 7 execution spec

## Objective

Deliver the V1 Core operational layer: dashboard KPIs and alert workspaces, notification engine, retention/anonymization, backup/restore readiness and remaining hardening before Sprint 8 UAT.

## Ordered tasks

1. S7.1 — Core dashboard KPIs and operational alert workspaces — VALIDATED by Fred, 2026-10-23; publication authorized.
2. S7.2 — Dashboard and email notification engine with configurable reminders — eligible for planning after S7.1 acceptance; separate Gate 1 required, no implementation authorized.
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
- Fred confirmed **"All green"** after this handoff and authorized documentation, commit and push. Gate 2 is accepted on developer-reported evidence; no additional exact human command results or resolution of the recorded agent failure is claimed.
- S7.1 is validated, Sprint 7 remains open, and S7.2 requires a separately approved plan/Gate 1.

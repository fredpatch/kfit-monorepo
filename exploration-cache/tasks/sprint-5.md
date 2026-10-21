# K'FIT — Sprint 5 execution spec

## Objective

Deliver the authoritative post-onboarding subscription/coaching lifecycle: activation, pause/resume, completion review, cancellation and renewal first; then appointments, follow-ups, goals/progress and personalized documents in dependency order.

## Ordered tasks

1. S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution — VALIDATED.
2. S5.2 — Appointment scheduling, confirmation links, cancellation policy and history — VALIDATED.
3. S5.3 — Structured follow-ups, overdue detection and configurable follow-up cadence — VALIDATED.
4. S5.4 — Progress measurements, structured goals and coach-confirmed status suggestions — APPROVED_FOR_IMPLEMENTATION.
5. S5.5 — Personalized document versioning and secure temporary delivery links.

## S5.1 — planning

Backlog task: **Subscription lifecycle with pause, completion_due, renewal and cancellation resolution**.

### Business rules

Sources: `exploration-cache/project/state-machines.md §4`, `exploration-cache/project/database-schema.md`, `exploration-cache/project/relational-contract.md §3/§5`, Notion business decisions, and reusable Explicit State Transitions + Atomic Business Operation patterns.

Allowed S5.1 commands:
- `ready_to_start -> active`
- `active -> paused`
- `paused -> active`
- `active -> completion_due`
- `completion_due -> completed`
- `completion_due -> active` (explicit extension/reopen)
- `ready_to_start | active | paused | completion_due -> cancelled`

S5.1 does not open payment-driven transitions. Payment remains an independent axis.

### Activation

- named command only; no generic status patch;
- requires current status `ready_to_start`;
- rechecks no blocking onboarding/medical requirement has reappeared;
- sets `actualStartDate` once;
- establishes/validates `plannedEndDate` from immutable subscription duration snapshot;
- clears pre-start capacity reservation;
- writes status history + audit in the same transaction.

### Duration snapshot gap

Current subscriptions preserve service/variant/price but do not snapshot duration. Catalogue edits must not rewrite an existing subscription's commercial meaning.

Proposed migration:
- `subscriptions.duration_value_snapshot` nullable integer;
- `subscriptions.duration_unit_snapshot` nullable text;
- check: both null or both present; value > 0 when present.

Writers:
- S4.2 conversion updated to snapshot selected variant duration when present, otherwise service duration;
- S5.1 renewal clones the prior subscription duration snapshot.

Existing rows:
- preflight lists rows missing a duration snapshot;
- dev/staging backfill may use current selected variant/service duration only after developer approval;
- no production destructive/backfill assumption.

Duration units stay limited to catalogue-supported values.
For duration-based subscriptions, activation computes `plannedEndDate` from `actualStartDate + snapshot duration`.
For truly punctual/no-duration services, `plannedEndDate` may remain null and completion_due is coach-driven.

### Pause / resume

Pause:
- current status must be `active`;
- reason is mandatory non-empty coach text stored in `subscription_pauses.reason`;
- creates exactly one open pause row;
- stores `originalEndDate = current plannedEndDate`;
- transitions subscription to `paused`;
- history + audit atomic.

Resume:
- current status must be `paused`;
- exactly one open pause must exist;
- coach explicitly supplies `revisedEndDate` when the subscription has a planned end;
- revised end must be after resume time and cannot precede original end;
- no automatic "add pause days" calculation;
- closes the pause row with `endedAt` + `revisedEndDate`;
- updates subscription `plannedEndDate`;
- transitions to `active`;
- history + audit atomic.

For punctual subscriptions with no planned end, resume does not require a revised end.

### Completion due

Reaching `plannedEndDate` never marks `completed` automatically.

S5.1 provides an explicit admin command:
- `active -> completion_due`
- allowed when planned end has been reached OR coach explicitly opens closure review early with mandatory reason;
- no scheduled job in S5.1.

This leaves Sprint 7 scheduled operational jobs free to surface overdue/completion queues later.

### Completion

`completion_due -> completed` only.

Before completion:
- inspect `subscription_components`;
- if any mandatory/owed-by-coach quantity remains unresolved, completion is rejected by default;
- explicit override requires non-empty reason;
- set `actualEndDate` and `completedAt`;
- preserve component balances/history; do not zero counters;
- history + audit atomic.

No automatic goal completion or finance mutation.

### Cancellation

Cancellation is a named command from allowed non-terminal states.
- mandatory reason;
- set `cancelledAt`;
- do not delete appointments/components/history;
- no refund/payment mutation in Sprint 5;
- if paused, close the open pause at cancellation time without inventing a revised end date;
- history + audit atomic;
- completed/cancelled subscriptions are terminal in S5.1.

### Renewal

Business rule: renewal creates a new linked subscription; never reopens/commercially mutates the old one.

Proposed schema:
- `subscriptions.renewed_from_subscription_id` nullable self-FK RESTRICT;
- unique when non-null, yielding a linear renewal chain;
- source request remains null on renewed subscriptions.

Renewal command:
- allowed from `completion_due` or `completed`;
- locks source subscription and renewal-link key;
- rejects if a renewal child already exists;
- requires explicit new planned start date;
- creates new subscription in `onboarding`;
- same customer/service/variant;
- clones agreed price/currency, duration snapshot and component entitlement snapshots;
- consumed/owed counters reset to zero on new components;
- does not clone onboarding/consent/questionnaire decisions;
- creates initial status history + `subscription.renewed` audit atomically;
- old subscription status is not changed merely by renewal creation.

Commercial repricing/service change during renewal is out of S5.1; that belongs to later quote/amendment behavior.

### API proposal

- `GET /admin/subscriptions/:subscriptionId`
- `POST /admin/subscriptions/:subscriptionId/activate`
- `POST /admin/subscriptions/:subscriptionId/pause`
- `POST /admin/subscriptions/:subscriptionId/resume`
- `POST /admin/subscriptions/:subscriptionId/completion-due`
- `POST /admin/subscriptions/:subscriptionId/complete`
- `POST /admin/subscriptions/:subscriptionId/cancel`
- `POST /admin/subscriptions/:subscriptionId/renew`

All mutations: authenticated admin + existing same-origin/CSRF protections.

### Concurrency / hard commit

Every command locks the subscription row `FOR UPDATE`, reloads required related state, validates current status and writes:
- subscription mutation;
- pause/renewal/component side effects where applicable;
- append-only `subscription_status_history`;
- transaction-scoped audit.

Double submits after state change return a stable typed conflict and create no duplicate history/pause/renewal rows.

### Audit

Suggested events:
- `subscription.activated`
- `subscription.paused`
- `subscription.resumed`
- `subscription.completion_due`
- `subscription.completed`
- `subscription.cancelled`
- `subscription.renewed`

Safe metadata only: from/to status, structural IDs, timestamps/dates, override boolean. Do not copy free-text reasons into generic audit metadata.

### Client

French admin subscription detail/lifecycle panel:
- current status/timeline;
- start/end dates;
- open/closed pause history;
- component entitlement summary;
- only valid named actions shown;
- confirmation inputs for pause/resume/completion override/cancel/renew.

UI does not determine transition validity; server remains authoritative.

### Out of scope

- appointments/component consumption;
- follow-up cadence/overdue jobs;
- goals/progress;
- personalized documents;
- payments/refunds;
- subscription amendments or service/price changes;
- automatic completion_due scheduled job;
- automatic completion;
- automatic renewal;
- customer-facing lifecycle controls.

### Validation target

Unit/shared/Express:
- closed transition map and invalid-state coverage;
- date/reason/override validation;
- auth/CSRF;
- stable typed errors;
- renewal input/response contracts.

PostgreSQL integration:
1. activate ready subscription; actual start/history/audit written once;
2. activation rejected if blocker reappeared;
3. duration snapshot drives planned end, not mutable catalogue;
4. pause creates one open pause + history/audit;
5. duplicate/concurrent pause creates no duplicate open pauses;
6. resume requires explicit revised end for duration-based subscription;
7. resume closes pause and updates planned end;
8. completion_due does not happen automatically from date alone;
9. early completion_due requires reason;
10. complete rejected with unresolved coach-owed component;
11. completion override with reason succeeds and preserves balances;
12. cancel from each allowed state;
13. cancel while paused closes open pause safely;
14. terminal completed/cancelled reject further lifecycle mutations;
15. renewal creates exactly one linked onboarding subscription;
16. renewal clones commercial/component snapshots but resets consumption;
17. concurrent renewals create one child;
18. audit failure rolls back each representative command;
19. history is append-only and chronological.

Fred Gate 2:
- activate a ready subscription;
- pause then resume with manually chosen new end date;
- open completion review;
- verify completion blocked by owed component, then override with reason;
- cancel a separate subscription;
- renew completion_due/completed subscription and inspect new onboarding child;
- DBeaver inspect subscriptions, status history, pauses, components and audit.

Gate 1 approved by Fred.


### S5.1 Gate 1 — approved rules

Fred approved the S5.1 lifecycle plan.

Locked:
- named lifecycle commands only; no generic status patch;
- ready_to_start -> active rechecks blockers and writes actualStartDate/history/audit atomically;
- subscription duration is snapshotted so catalogue edits cannot alter existing commercial duration;
- pause creates one open pause with mandatory reason;
- resume uses an explicitly chosen revised end date for duration-based subscriptions; no automatic pause-day arithmetic;
- reaching planned end never auto-completes; completion_due is explicit;
- completion checks unresolved coach-owed components and requires explicit override+reason when necessary;
- cancellation requires reason and never mutates finance/refunds;
- renewal creates one new linked onboarding subscription and never reopens the old subscription;
- renewal clones commercial/component snapshots but resets consumption/owed counters;
- payment remains an independent axis;
- appointments, follow-ups, goals/progress, documents, jobs and finance remain out of S5.1.

Proposed schema additions are approved:
- subscriptions.duration_value_snapshot
- subscriptions.duration_unit_snapshot
- subscriptions.renewed_from_subscription_id

Do not start S5.2 until Fred validates S5.1 locally.


### S5.1 validation evidence

Validated locally by Fred on 2026-10-21. Agent baseline before the final correction: server 231 passed, shared 35 passed, PostgreSQL 177/177 including 44 lifecycle cases. Typecheck/build/db:check/diff were green. Gate 2 validated activation, pause/resume with manual revised end, completion review, completion safeguards, cancellation, renewal, and DBeaver history/audit invariants. A questionnaire-policy fallback mismatch was corrected during Gate 2 and passed fresh-request retest. Exact post-correction automated counts were not separately reported.

Do not start S5.2 implementation before Fred approves its Gate 1 plan.


## S5.2 — planning

Backlog task: **Appointment scheduling, confirmation links, cancellation policy and history**.

### State model

Appointment records are historical business facts.

Allowed transitions:
- scheduled -> confirmed
- scheduled|confirmed -> reschedule_requested
- scheduled|confirmed|reschedule_requested -> rescheduled
- scheduled|confirmed -> completed
- scheduled|confirmed -> cancelled
- scheduled|confirmed -> missed

Terminal in S5.2:
- rescheduled
- completed
- cancelled
- missed

A reschedule never overwrites original schedule facts. It creates a new linked appointment.

### Schema additions

Proposed migration:
- appointments.rescheduled_from_appointment_id nullable self-FK RESTRICT + unique;
- appointments.late_cancel_notice_hours_snapshot nullable integer;
- appointments.late_cancel_consumes_component_snapshot boolean NOT NULL default false;
- appointments.missed_consumes_component_snapshot boolean NOT NULL default false;
- appointments.cancelled_at nullable timestamp;
- appointments.cancelled_by_type nullable text.

Existing rows preflight before migration. No destructive backfill assumptions.

### Policy snapshot

At appointment creation:
1. load subscription/service/variant;
2. resolve variant policy field-by-field with service fallback;
3. snapshot late-cancel notice/consumption and missed-consumption settings onto appointment.

Historical appointment decisions always use appointment snapshots, never current catalogue values.

### Scheduling

Only active subscriptions may receive new appointments.

If component is linked:
- must belong to same subscription;
- quantityConsumed < quantityEntitled;
- S5.2 consumes max one unit per appointment.

Create appointment, appointment event and audit atomically.

### Secure response links

Reuse secure_access_tokens/external_access_events.

Token:
- resource = appointment;
- action = appointment_response;
- random/hash-only;
- explicit expiry;
- revocable;
- GET non-consuming;
- successful response consuming;
- rate-limited;
- no OTP.

Customer actions:
- confirm
- decline
- request_reschedule

### Cancellation policy

Coach cancellation:
- never consumes entitlement;
- mandatory reason.

Customer cancellation:
- authoritative server time determines lateness relative to scheduledStart;
- on-time never consumes;
- late consumes one linked component only if snapshot says so.

No linked component => no consumption.

### Missed

Admin may mark missed only once scheduledStart has passed.

Consume one linked component only if missed policy snapshot says so.

### Completed

Admin marks completed.
Linked component completion consumes one entitlement unit atomically.
No entitlement available => reject.

Early completion before scheduledEnd requires explicit override + reason.

### Component accounting

component_events are append-only.

S5.2 event types:
- appointment_completed
- late_customer_cancel
- missed
- restoration

Update quantityConsumed in same transaction.

Double-submit/replay cannot create a second consumption event.

Explicit restoration:
- reason required;
- only when appointment previously consumed a component;
- max one restoration per consumptive event;
- decrements quantityConsumed by one;
- never changes appointment status.

### Rescheduling

Customer request:
- appointment -> reschedule_requested;
- optional rescheduleNote;
- no component consumption.

Coach reschedule:
- source status scheduled|confirmed|reschedule_requested;
- new start/end required;
- subscription must currently be active;
- source -> rescheduled;
- create replacement appointment linked through rescheduled_from_appointment_id;
- replacement keeps same subscription/component and copied policy snapshots;
- revoke active source response tokens;
- replacement starts scheduled/pending;
- issue replacement response link separately.

### Subscription lifecycle interaction

Creation/reschedule-to-new-slot require subscription active.

Existing appointment may still be finalized as completed/missed/cancelled after subscription changes state, provided appointment-state/time invariants permit it. S5.2 never mutates subscription lifecycle.

### API proposal

Admin:
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

Public:
- GET /public/appointments/:token
- POST /public/appointments/:token

### Validation target

Shared/unit/Express:
- closed transition map;
- scheduling/date validation;
- component ownership/remaining entitlement validation;
- policy fallback/snapshot;
- cancellation lateness boundary;
- auth/CSRF;
- public token input/replay/error taxonomy.

PostgreSQL integration:
1. schedule active subscription appointment;
2. reject scheduling non-active subscription;
3. reject component from another subscription;
4. policy snapshot remains unchanged after catalogue policy edit;
5. customer confirmation;
6. on-time customer decline consumes nothing;
7. late decline + consume=false consumes nothing;
8. late decline + consume=true consumes exactly one;
9. coach cancellation never consumes;
10. missed before scheduledStart rejected;
11. missed + consume policy true consumes one;
12. completion consumes one linked entitlement;
13. no remaining entitlement rejects completion/new linked appointment as applicable;
14. duplicate completion/cancel/missed cannot double-consume;
15. restoration appends event and decrements once;
16. duplicate restoration rejected;
17. customer reschedule request stores history without consuming;
18. coach reschedule creates replacement and preserves original facts;
19. replacement copies policy snapshot and source component;
20. reschedule revokes source response tokens;
21. public GET non-consuming;
22. successful public response consumes token;
23. replay cannot apply a second response;
24. audit failure rolls back appointment/component/token authoritative writes;
25. free-text reason/note absent from generic audit metadata.

Fred Gate 2:
- schedule appointment on active subscription/component;
- issue customer response link;
- confirm one appointment;
- on-time decline another and verify no consumption;
- late decline under consuming policy and verify component counter/event;
- reschedule request + coach replacement;
- complete appointment and verify entitlement consumed;
- mark missed scenario according to policy;
- restore one consumed unit;
- DBeaver verify original/rescheduled rows, events, token hashes, component events/counters and safe audit.

Do not start S5.3 until Fred validates S5.2 locally.


### S5.2 Gate 1 — approved rules

Fred approved the S5.2 appointment plan.

Locked:
- appointment lifecycle uses named commands only;
- rescheduling never overwrites original schedule facts; it creates a linked replacement appointment;
- late-cancel/missed policy is snapshotted at appointment creation and historical decisions never consult current catalogue policy;
- only active subscriptions may receive new appointments or rescheduled replacement slots;
- customer confirmation/decline/reschedule request uses a scoped, expiring, hash-only secure link with no customer account and no OTP;
- coach cancellation never consumes entitlement;
- on-time customer cancellation never consumes entitlement;
- late customer cancellation consumes at most one linked component only when the appointment snapshot says so;
- missed consumes at most one linked component only when the snapshot says so;
- completed linked appointment consumes one entitlement atomically;
- component_events are append-only; quantity_consumed is updated in the same transaction;
- restoration is explicit, reasoned, append-only and does not reopen/change appointment status;
- S5.2 never mutates subscription lifecycle;
- reminders/jobs, calendar integrations, follow-ups, payments, customer accounts and multi-coach scheduling remain out of scope.

Proposed appointment schema additions are approved:
- rescheduled_from_appointment_id
- late_cancel_notice_hours_snapshot
- late_cancel_consumes_component_snapshot
- missed_consumes_component_snapshot
- cancelled_at
- cancelled_by_type

Do not start S5.3 until Fred validates S5.2 locally.


### S5.2 validation evidence

Validated locally by Fred on 2026-10-21.

- Server 251 passed; shared 37 passed.
- PostgreSQL integration 224 passed, including 47 appointment cases.
- Typecheck/build/db:check/diff green.
- Migration 0006_free_tusk.sql applied locally; no backfill needed.
- Reviewer passed with notes; QA passed with limitations.
- Gate 2 validated scheduling, secure customer responses, confirmation/decline/reschedule, immutable reschedule chains, late-cancel/missed policy snapshots, completion, component consumption/restoration, token semantics and safe audit evidence.
- Cancellation-window semantics validated: null means no late penalty; exactly at deadline is on time.

Do not start S5.3 implementation before its plan is inspected and Fred approves Gate 1.


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

Do not start S5.4 until Fred validates S5.3 locally.


### S5.3 Gate 1 — approved rules

Fred approved the S5.3 follow-up plan.

Locked:
- effective cadence = subscription override -> variant policy -> service policy; null disables monitoring;
- cadence is operational/current configuration, not an immutable commercial snapshot;
- meaningful activity = activation, completed appointment, structured follow-up recorded, or open follow-up completed;
- appointment scheduled/confirmed/cancelled/missed/rescheduled, token activity, payment, questionnaire and consent do not reset cadence;
- subscription cadence health is derived at read time as healthy/due/overdue;
- only active subscriptions participate in cadence queue;
- paused subscriptions are excluded and pause time freezes cadence using subscription_pauses history;
- overdue is not persisted and no scheduled job is introduced in S5.3;
- follow_ups stored states remain open/done/cancelled, with overdue for next actions derived from nextActionAt;
- exactly at nextActionAt is due, strictly later is overdue;
- follow-up create/complete/cancel use named commands only;
- free-text notes/next actions/cancel reasons never enter generic audit metadata;
- S5.3 never mutates subscription lifecycle.

Proposed schema additions are approved:
- follow_ups.completed_at
- follow_ups.cancelled_at
- follow_up_events append-only history table

Do not start S5.4 until Fred validates S5.3 locally.


### S5.3 validation evidence

Validated locally by Fred on 2026-10-21.

- Server 274 passed; shared 39 passed.
- PostgreSQL integration 275 passed, including 51 follow-up cases.
- Typecheck/build/db:check/diff green.
- Migration 0007_misty_kronos.sql applied locally; no backfill needed.
- Reviewer passed with notes; QA passed with limitations.
- Gate 2 validated cadence override/reset, structured follow-up create/complete/cancel, appointment-driven cadence reset, pause/resume active-time arithmetic, global queue behavior and DBeaver invariants.
- Cadence uses active elapsed time; overdue is derived and never persisted.
- Queue history loading may need batching at larger scale; deferred as optimization.

Do not start S5.4 implementation before its plan is inspected and Fred approves Gate 1.


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

Do not start S5.5 until Fred validates S5.4 locally.


### S5.4 Gate 1 — approved rules

Fred approved the S5.4 progress/goals plan.

Locked:
- progress measurements are append-only historical facts; no edit/delete in S5.4;
- recording structured progress measurements requires current health_data grant;
- progress-photo storage/linkage requires separate progress_photo_storage grant; publication/marketing remains separate and is never inferred;
- progress photos stay private by default; upload/version/share infrastructure remains S5.5 unless existing private-document linkage can be reused without opening scope;
- goal status uses named transitions only;
- suggested_status is deterministic advisory state only and never mutates authoritative goal.status automatically;
- coach confirmation is required for achieved / partially_achieved / not_achieved;
- coach override differing from suggestion requires reason;
- goal history is append-only via goal_events;
- subscription pause/completion/cancellation never auto-finalizes or auto-pauses goals in S5.4;
- no medical diagnosis, BMI/risk scoring or AI-generated conclusions;
- health/body values, notes and override reasons never enter generic audit metadata.

Proposed schema additions are approved:
- goals.metric_key nullable text
- goal_events append-only table

Do not start S5.5 until Fred validates S5.4 locally.

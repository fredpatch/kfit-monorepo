# K'FIT — Sprint 5 execution spec

## Objective

Deliver the authoritative post-onboarding subscription/coaching lifecycle: activation, pause/resume, completion review, cancellation and renewal first; then appointments, follow-ups, goals/progress and personalized documents in dependency order.

## Ordered tasks

1. S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution — VALIDATED.
2. S5.2 — Appointment scheduling, confirmation links, cancellation policy and history — APPROVED_FOR_IMPLEMENTATION.
3. S5.3 — Structured follow-ups, overdue detection and configurable follow-up cadence.
4. S5.4 — Progress measurements, structured goals and coach-confirmed status suggestions.
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

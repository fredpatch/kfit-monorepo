# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-5
Sprint            5 — Abonnements, rendez-vous, suivi, objectifs et documents
Active slice      S5.3 — Structured follow-ups, overdue detection and configurable follow-up cadence
Workflow state    PLANNING
Last validated    S5.2 — 2026-10-21
Next action       Planner: inspect S5.3 follow-up workflow; no implementation before Gate 1
```

## Sprint 5 objective

Build the authoritative subscription/coaching delivery lifecycle after the validated Sprint 4 onboarding foundation.

## Sprint 5 execution order

1. S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution — CLOSED, Fred validated 2026-10-21.
2. S5.2 — Appointment scheduling, confirmation links, cancellation policy and history — CLOSED, Fred validated 2026-10-21.
3. S5.3 — Structured follow-ups, overdue detection and configurable follow-up cadence — PLANNING.
4. S5.4 — Progress measurements, structured goals and coach-confirmed status suggestions.
5. S5.5 — Personalized document versioning and secure temporary delivery links.

Gate 1 approved by Fred. Implement S5.1 only. Do not open S5.2 while S5.1 is unvalidated.

## Blockers

Before production:
- Legal validation for the applicable Gabon context.
- True encrypted off-server backup destination.

## Environment constraints

- Docker PostgreSQL: localhost:5433; native PostgreSQL: 5432.
- Remote/chat runtimes do not run project commands; only Fred's local execution closes validation gates.

## Handoff

```text
Branch            sprint-5
Sprint            5
Slice             S5.3
Workflow state    PLANNING
Done              S5.1 implementation + correction + review + QA + Fred Gate 2 validation
Validation done   Gate 2 green; browser/DBeaver lifecycle acceptance green
Next action       Planner: inspect S5.3 only
```


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

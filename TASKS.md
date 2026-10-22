# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

Two tracks run in parallel. Business logic changes only in Track A; Track B is UI plus read-only API additions.

```text
Track A — Sprint 5 (business features)
Branch            sprint-5
Sprint            5 — Abonnements, rendez-vous, suivi, objectifs et documents
Active slice      S5.5 — Personalized document versioning and secure temporary delivery links
Workflow state    PLANNING
Last validated    S5.4 — 2026-10-21
Next action       Planner: inspect S5.5 personalized document workflow; no implementation before Gate 1

Track B — Refonte UI (admin + public screens)
Branch            main
Active step       UX-10 — Connexion (board 09)
Workflow state    AWAITING_HUMAN_VALIDATION — diff delivered, rules validated 2026-10-22
Last delivered    UX-9b — 2026-10-22 — 8a4e435
Next action       Fred: apply ux-10-connexion.diff, check login/recovery locally (Mailpit), push; then UX-11
```

## Sprint 5 objective

Build the authoritative subscription/coaching delivery lifecycle after the validated Sprint 4 onboarding foundation.

## Sprint 5 execution order

1. S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution — CLOSED, Fred validated 2026-10-21.
2. S5.2 — Appointment scheduling, confirmation links, cancellation policy and history — CLOSED, Fred validated 2026-10-21.
3. S5.3 — Structured follow-ups, overdue detection and configurable follow-up cadence — CLOSED, Fred validated 2026-10-21.
4. S5.4 — Progress measurements, structured goals and coach-confirmed status suggestions — CLOSED, Fred validated 2026-10-21.
5. S5.5 — Personalized document versioning and secure temporary delivery links — PLANNING.

Gate 1 approved by Fred. Implement S5.1 only. Do not open S5.2 while S5.1 is unvalidated.

## Blockers

Before production:
- Legal validation for the applicable Gabon context.
- True encrypted off-server backup destination.
- Device-OTP login + trusted device per the Sprint 1 auth contract (today `/auth/login` issues a session on any device).

## Environment constraints

- Docker PostgreSQL: localhost:5433; native PostgreSQL: 5432.
- Remote/chat runtimes do not run project commands; only Fred's local execution closes validation gates.

## Handoff

```text
Branch            sprint-5
Sprint            5
Slice             S5.5
Workflow state    PLANNING
Done              S5.1 implementation + correction + review + QA + Fred Gate 2 validation
Validation done   Gate 2 green; browser/DBeaver lifecycle acceptance green
Next action       Planner: inspect S5.5 only
```

Refonte UI handoff:

```text
Branch            main
Step              UX-10 — Connexion
Workflow state    AWAITING_HUMAN_VALIDATION
Done              Connexion, Mot de passe oublié (3 steps), Initialisation, password meter,
                  recovery bound in dev-app.ts when SMTP_HOST is set, legacy auth CSS removed
Rules             8 rules validated by Fred 2026-10-22 (Refonte UI § Status, UX-10)
Validation done   Agent: client tsc + build, server tsc + 326 tests, shared 45 tests,
                  browser pass desktop + 390 px (errors, wrong code, reset, re-login, no h-scroll)
                  against a throwaway SMTP sink
Not validated     Fred local run with Mailpit; staging/prod SMTP configuration
Out of scope      New-device OTP + trusted device (Notion « Session security », pre-prod blocker)
Next action       Fred: apply + check + push; Claude: UX-11 planning (brand assets still missing)
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
| UX-9c | 02 | Charts, sparklines, deltas, first name | needs Sprint 7 series API | Sprint 7 | — |
| UX-10 | 09 | Connexion, Mot de passe oublié, Initialisation, password meter; recovery service bound in `dev-app.ts` (SMTP) | none (existing `/auth/recovery/*`) | Delivered — awaiting push | — |
| UX-11 | 10, 11a | Public page + mobile request | — | To do — prod blocked by brand assets | — |
| UX-12 | 11b–d | Customer pages (questionnaire, consent, appointment) | — | To do | — |
| UX-13 | — | Cleanup: legacy CSS removal, a11y, reduced motion, mobile pass, full UI recette | — | To do | — |

### Locked decisions (2026-10-22)

- Business time zone **Africa/Libreville (UTC+1)** for today, week (Monday start), appointment display and datetime inputs — `@kfit/shared` `time/business-time.ts`, client `lib/format.ts`.
- Client status derived in one place: `@kfit/shared` `customers/client-status.ts`.
- Capacity limit below occupied places → warn, don't block. Occupancy = S4 capacity-claim rule.
- Analytics rules (attendance, cadence, pace, responsiveness) validated in UX-4c.
- Aujourd'hui « À traiter » order: follow-ups overdue → due → new requests → request follow-ups → preparation expired → ready → waiting → completion due. KPIs show current values only until Sprint 7.
- Slug frozen after publication (UI). CSV export out of V1 (V1.1, compliance).

### Open decisions (Fred)

- [x] UX-10 scope: client-only, device OTP deferred (Fred 2026-10-22, 8 rules validated).
- [ ] Currency display: FCFA on public pages vs XAF in admin?
- [ ] Multi-subscription progress: exclude measurements taken without health consent?
- [ ] Client test framework (Vitest + Testing Library)?
- [ ] Funnel counting rules (Sprint 7).

### Risks / pre-prod items

- **Auth contract gap (compliance):** Sprint 1 contract requires OTP on unknown devices before a session is issued; `/auth/login` always issues one. Pre-prod blocker until the device-OTP server slice ships.
- **Recovery needs SMTP:** `/auth/recovery/*` answers 501 unless `SMTP_HOST`/`SMTP_FROM` are set; staging/prod env must define them (UI then shows « Récupération indisponible »).
- **Prod reverse proxy:** if it lists API paths, add `/admin/today` and `/admin/appointments` (Vite dev proxy done).
- **Brand assets:** logo and coach photo missing → UX-11 cannot go to prod.
- Legacy screens still format dates in the device time zone → migrate to `lib/format.ts` during UX-10…13.
- Server `npm test` glob runs only 4 tests → run `node --test $(find dist -name "*.test.js")` (Fred to fix the script).

### Sprint 7 needs for mockup fidelity (board 02 — Aujourd'hui)

> Notion: UX-9c, [API·UX] Séries temporelles, Endpoint agrégé des KPI, Statistiques de l'entonnoir, Prénom dans la session.

- [ ] **Weekly requests chart** — requests received per business week (Mon–Sun, Africa/Libreville); periods 4 sem. / 8 sem. / 12 mois (monthly buckets for 12 mois); current week highlighted; tooltip `N demandes · 6–12 oct.`. Replaces the « Historique disponible au Sprint 7 » card.
- [ ] **Conversion rate** in that chart's header (`47 sur 8 semaines · taux de conversion 38 %`) — depends on funnel counting rules.
- [ ] **KPI sparklines** — 8 weekly points for: clientes actives (end-of-week value), suivis en retard (end-of-week value), nouvelles demandes, séances réalisées. `KpiTile` already takes `trend` + `trendLabel`.
- [ ] **KPI delta vs previous period** (`+12 % vs période précédente`) — define the reference period and the favourable direction per KPI (fewer overdue follow-ups = good). `KpiTile` already takes `delta`.
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

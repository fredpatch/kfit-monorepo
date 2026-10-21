# K'FIT — Sprint 5 execution spec

## Objective

Deliver the authoritative post-onboarding subscription/coaching lifecycle: activation, pause/resume, completion review, cancellation and renewal first; then appointments, follow-ups, goals/progress and personalized documents in dependency order.

## Ordered tasks

1. S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution — APPROVED_FOR_IMPLEMENTATION.
2. S5.2 — Appointment scheduling, confirmation links, cancellation policy and history.
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

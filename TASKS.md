# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-5
Sprint            5 — Abonnements, rendez-vous, suivi, objectifs et documents
Active slice      S5.2 — Appointment scheduling, confirmation links, cancellation policy and history
Workflow state    PLANNING
Last validated    S5.1 — 2026-10-21
Next action       Planner: inspect S5.2 appointment scheduling task; no implementation before Gate 1
```

## Sprint 5 objective

Build the authoritative subscription/coaching delivery lifecycle after the validated Sprint 4 onboarding foundation.

## Sprint 5 execution order

1. S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution — CLOSED, Fred validated 2026-10-21.
2. S5.2 — Appointment scheduling, confirmation links, cancellation policy and history — PLANNING.
3. S5.3 — Structured follow-ups, overdue detection and configurable follow-up cadence.
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
Slice             S5.2
Workflow state    PLANNING
Done              S5.1 implementation + correction + review + QA + Fred Gate 2 validation
Validation done   Gate 2 green; browser/DBeaver lifecycle acceptance green
Next action       Planner: inspect S5.2 only
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

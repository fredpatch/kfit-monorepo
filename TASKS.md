# K'FIT — Active Execution State

> Single source of active state for agents. Backlog/roadmap: Notion. Sprint specs: `exploration-cache/tasks/`. History: `changelog.md`, `exploration-cache/sessions/`, Git.
> Update rules: WORKFLOW §12 and §14.

## Now

```text
Branch            sprint-5
Sprint            5 — Abonnements, rendez-vous, suivi, objectifs et documents
Active slice      S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution
Workflow state    APPROVED_FOR_IMPLEMENTATION
Last validated    Sprint 4 — closed 2026-10-21
Next action       Implementer: execute approved S5.1 server-first lifecycle plan only
```

## Sprint 5 objective

Build the authoritative subscription/coaching delivery lifecycle after the validated Sprint 4 onboarding foundation.

## Sprint 5 execution order

1. S5.1 — Subscription lifecycle with pause, completion_due, renewal and cancellation resolution — APPROVED_FOR_IMPLEMENTATION.
2. S5.2 — Appointment scheduling, confirmation links, cancellation policy and history.
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
Slice             S5.1
Workflow state    APPROVED_FOR_IMPLEMENTATION
Done              Sprint 4 closed/aligned; sprint-5 branch created; S5.1 inspected
Validation done   none for S5.1
Next action       Implementer
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

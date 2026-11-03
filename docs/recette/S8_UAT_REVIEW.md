---
titre: Sprint 8 - UAT review and completion investigation
public: développeur
statut: à revoir
vérifié-sur: da0eee3
couvre: [Sprint 8, UAT-002]
---

# Sprint 8 - UAT review, 2026-11-03

## Scope and evidence

Fred reports having reviewed all S0-S9 scenarios and reports completion succeeding without selecting the displayed override or entering its reason. The behavior was observed with superadmin and an account described as admin/coach.

This review preserves Fred's submitted checkboxes in S5-S9. It reviews all ten scenario files and the completion implementation, plus read-only structural evidence for the subscription supplied by Fred. It does not implement a correction or change business rules. Code baseline: `da0eee3`.

## Completion finding: UAT-002

**Confirmed:** the client warning and server blocker measure different quantities. **Not established:** a server-side bypass when a positive coach-owed quantity actually exists.

### Approved rule

- `exploration-cache/tasks/sprint-5.md`, S5.1, Completion: inspect component balances; unresolved mandatory/coach-owed quantities require explicit override and a non-empty reason; preserve balances/history.
- `exploration-cache/project/state-machines.md`, Subscription rules: unresolved coach-owed mandatory components require explicit override/reason.
- `docs/guides/guide-coach.md`, subscription lifecycle: completing with services still owed requires a reason.

Opening `completion_due` is the review step. The terminal `complete` command performs `completion_due -> completed`; these are separate actions.

### Client path

1. `packages/client/src/profile/overview/subscription-commands.ts:75`: `outstandingComponents()` sums `max(0, quantityEntitled - quantityConsumed)`.
2. `packages/client/src/profile/overview/DecisionDialog.tsx:161`: any positive unused quantity displays the checkbox and “Terminer quand même (motif obligatoire)”.
3. `subscription-commands.ts:66`: a completion reason is required only when the checkbox is selected.
4. `DecisionDialog.tsx:96`: unchecked sends `overrideOutstandingComponents: false`, without `overrideReason`.

The UI does not require selection simply because this warning appears.

### Server path

1. `packages/server/src/modules/subscriptions/services/subscriptions.service.ts:81`: the override must be boolean; selecting it requires a non-empty reason.
2. `packages/server/src/modules/subscriptions/repositories/subscriptions.repository.ts:337`: when completing, positive `quantityOwedByCoach` and no override returns `SUBSCRIPTION_COMPONENTS_OUTSTANDING`.
3. Unused entitlement alone is not this server condition. No superadmin exception appears in that completion branch.

| Synthetic component                     | Client warning          | Server condition without override |
| --------------------------------------- | ----------------------- | --------------------------------- |
| entitled 4, consumed 1, owed by coach 0 | 3 unused, warning shown | No coach-owed blocker             |
| entitled 4, consumed 1, owed by coach 1 | 3 unused, warning shown | Coach-owed blocker applies        |

The actual client helper was executed with these synthetic values. The server column describes the inspected repository predicate, not a live HTTP reproduction.

Existing integration tests explicitly cover owed quantities blocking ordinary completion, override without reason failing, and explicit motivated override succeeding. The “settled completion succeeds without overriding” test uses entitled 4, consumed 2, owed 0: unused entitlement can already remain in the accepted baseline.

### Evidence from Fred's subscription

After the initial source review, Fred supplied a local link selecting subscription `48b39acc-c0fc-4e84-9561-2d2dbc3bca16`. The root `.env` target was verified as local `kfit_dev` on port 5433 before opening read-only transactions. No business data was written, and no names, contact details, tokens or free-text reasons were read into this report.

- The selected subscription is an onboarding renewal, not the completed subscription.
- Its `renewed_from_subscription_id` identifies source subscription `24a4060c-3bd7-4168-bb62-60c1ad58b705`.
- The source is `completed`, with completion recorded on 2026-11-03 at 08:18:12 Africa/Johannesburg.
- Both source components have entitled 1, consumed 0, owed by coach 0. Their `updated_at` values precede completion.
- The source history records `completion_due -> completed`, with no completion reason.
- Its `subscription.completed` audit records `completionOverride=false` and success.
- The history actor currently has role `superadmin`. That join identifies the current stored role, not an immutable historical session-role snapshot.

This case explains the report: the UI counts two unused services, while the server has no positive coach-owed balance to block. It does not demonstrate a server-side or superadmin bypass. The original network payload and a genuine coach-role attempt were not captured.

### Roles

`SubscriptionsController` requires `hasRole(session, "admin")`. `packages/shared/src/auth/roles.ts` admits admin/superadmin and denies the actual `coach` role. The repository completion condition is role-independent.

Therefore, “admin/coach account” is insufficient to conclude that a role guard was bypassed. Verify the effective session role. A genuine `coach` session succeeding on this route would be a separate authorization concern.

### Triage and next evidence

- UAT-002: OPEN, P2 for the confirmed misleading warning and inconsistent completion explanation.
- Escalate to P1 if a request with positive authoritative `quantityOwedByCoach`, false override and no reason is shown to complete successfully.
- The supplied renewal and completed source were identified; counters/history/audit support the UI mismatch explanation. Capture the effective session role and request body/response if a positive-owed or genuine coach-role case is reported. Exclude personal data and tokens.
- Test both synthetic cases through the UI and API on a controlled local dataset, including a genuine coach role.
- Align the UI with the approved server condition after a correction is approved. Requiring an override for every unused entitlement would change current behavior and needs an explicit business decision.

No fix is included in this investigation. S8's checked blocker/override assertions require retest; S9's completion assertion does not settle UAT-002.

## Scenario review

These are counts of the saved checklist marks, not an assertion that the agent executed the scenarios.

| Scenario                    | Checked | Unchecked | Review outcome                                                        |
| --------------------------- | ------- | --------- | --------------------------------------------------------------------- |
| S0 preflight                | 0       | 14        | Checklist evidence still unrecorded                                   |
| S1 public request           | 0       | 20        | Checklist evidence still unrecorded                                   |
| S2 qualification/conversion | 0       | 19        | Checklist evidence still unrecorded                                   |
| S3 onboarding               | 30      | 0         | Recorded green; UAT-001 remains RESOLVED                              |
| S4 active coaching          | 25      | 0         | Recorded green                                                        |
| S5 finance/documents        | 23      | 4         | Payment-plan section remains unchecked                                |
| S6 dashboard/notifications  | 21      | 0         | All saved execution checks marked complete                            |
| S7 privacy/operations       | 22      | 2         | Durable journal and synchronization/replay remain unchecked           |
| S8 completion/renewal       | 15      | 0         | Completion blocker/override result contested by UAT-002               |
| S9 final regression         | 29      | 7         | Execution marks recorded; all seven exit-gate checks remain unchecked |
| Total                       | 165     | 66        | Formal Sprint 8 closure is not established                            |

S5 pending: opening Payments, payment-plan inspection, authoritative collected/due/future/overdue values, and payment/lifecycle independence.

S7 pending: durable privacy-journal evidence and business-idempotent synchronization/replay.

S9 pending: no open P0/P1; no untriaged finding; explicit handling of remaining P2/P3; Fred's final acceptance; Sprint 8 closure readiness; and the ARCH-resume handoff. An OPEN P2 requires explicit disposition before closure under Sprint 8 D4.

Fred's statement that all scenarios were reviewed is retained. Unchecked items are not silently converted to passes; reconcile their evidence with Fred.

## Validation and handoff

- Read-only source review: completion rules, client payload, server guard, role hierarchy, existing service/repository tests.
- Synthetic client-helper reproduction: both warning/server-condition cases above.
- `npm test`: server 724 passed, one existing Windows-specific skip; shared 90/90 passed. Local database inspection used read-only transactions for the supplied subscription and its renewal source. No database writes or live completion requests were performed; repository integration tests were inspected, not rerun.
- Formatting, dash lint and diff checks passed. `npm run docs:check` reports seven pre-existing metadata problems in untouched documents: frontend architecture, recette README/reference, scenarios S0-S2, and S3's unsupported `validé` status.
- No schema, application code, dependency or business-document changes.
- Next: GPT/Fred review the confirmed UAT-002 warning mismatch and the structural evidence above, approve a narrow UI correction/retest if appropriate, reconcile remaining checklist evidence, then decide final regression and Sprint 8 closure.

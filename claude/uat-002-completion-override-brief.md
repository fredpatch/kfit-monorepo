# UAT-002 - Completion blocker override hardening

Role: implementer for one Sprint 8 P1 correction.

Base: current `main` after UAT-002 triage.

## Accepted defect statement

Do not reinterpret or re-diagnose the issue.

Fred reports that an abonnement in `completion_due` can be completed even while a blocker is displayed, with the override checkbox left unchecked and no reason supplied. Fred reports this with both superadmin and admin/coach accounts.

The accepted expected behavior is:

- if a completion blocker exists, ordinary completion must be refused;
- completion may proceed only through an explicit override;
- override requires explicit selection plus a non-empty reason;
- same rule for admin/coach and superadmin;
- superadmin has no implicit bypass.

## Severity

P1 / blocking Sprint 8.

## Reusable patterns

Apply:

- Explicit State Transitions: completion remains a named lifecycle command.
- Atomic Business Operation: completion state/history/audit remain one transaction.
- Audit Event System: overridden completion must be distinguishable from normal completion without leaking unnecessary free text into generic audit metadata.

## Existing contract to preserve

Shared contract already defines:

```ts
export type CompleteSubscriptionInput = {
  overrideOutstandingComponents: boolean;
  overrideReason?: string;
};
```

Do not invent a second endpoint or a new lifecycle status.

No schema migration is expected.

## Locked business rules

1. Only `completion_due -> completed` is in scope.
2. The authoritative service blocker for this slice is any snapshotted subscription component where:
   `quantityConsumed < quantityEntitled`.
3. `quantityOwedByCoach` is NOT the authoritative remaining-service signal for completion.
4. If no service blocker exists:
   - `overrideOutstandingComponents=false` must complete normally;
   - no override reason is required.
5. If a service blocker exists:
   - override=false + no reason -> reject;
   - override=false + reason -> reject;
   - override=true + blank/missing reason -> reject;
   - override=true + non-empty reason -> allow completion.
6. Same result for admin/coach and superadmin.
7. Role must never alter the blocker rule.
8. UI checkbox state is advisory/input only; server decides from current locked DB state.
9. A reason alone must never act as override.
10. A truthy/string-like value must never act as override; input remains strict boolean.
11. Successful override must be explicit in durable history/audit evidence.
12. Component balances are preserved exactly; no automatic consumption/settlement.
13. Finance remains independent.
14. Unpaid or partially-paid finance must NOT block operational completion.
15. The completion UI must surface a strong financial warning when remainingXaf > 0, but completion remains allowed if there is no service blocker.
16. Renewal behavior is regression-only.
17. No unrelated frontend ARCH migration.

## Server service validation

File:

`packages/server/src/modules/subscriptions/services/subscriptions.service.ts`

Preserve strict input validation.

For `complete`:

- `overrideOutstandingComponents` must be boolean;
- optional `overrideReason` must be string <= 2000 chars;
- trim reason;
- if override=true and trimmed reason empty -> `SUBSCRIPTION_COMPLETION_REASON_REQUIRED`;
- if override=false, ignore/reject neither the presence of a non-empty reason at transport level, but the repository must not treat it as permission.

Do not infer override from reason.

Do not add role-specific behavior.

## Repository authoritative guard

File:

`packages/server/src/modules/subscriptions/repositories/subscriptions.repository.ts`

Inside the existing transaction and after the subscription/components are locked/read:

For `complete` compute:

```ts
const hasOutstandingComponents = components.some(
  (c) => c.quantityConsumed < c.quantityEntitled,
);
```

Do not use `quantityOwedByCoach` to derive the completion blocker.

Then enforce in this logical order:

```text
if blocker exists AND override !== true
  -> SUBSCRIPTION_COMPONENTS_OUTSTANDING

if override === true AND reason blank
  -> SUBSCRIPTION_COMPLETION_REASON_REQUIRED

if blocker does not exist AND override === true
  -> choose safest existing behavior:
     either allow explicit override with reason, or reject as unnecessary,
     but do not broaden scope unless current tests/business rules already define it.
     Report exact behavior chosen.
```

The critical invariant is:

```text
any component with consumed < entitled
+ override=false
MUST NEVER reach completed
```

Do not use actor role to bypass this check.

### History / audit

On successful normal completion:

- keep current completion history semantics.

On successful overridden completion:

- the status history row must preserve the supplied override reason if current history model already supports reason;
- generic audit metadata should expose structural evidence only, for example:
  - `overrideOutstandingComponents: true`;
  - `outstandingComponentCount` or equivalent count if already safe;
- do not copy the free-text reason into generic audit metadata if current audit conventions avoid private free text.

Do not mutate component balances.

## Role regression

Inspect route/controller authorization only enough to prove that both admin and superadmin reach the same service/repository completion rule.

Do not introduce separate role branches.

Add tests proving identical business outcome across available roles if the current HTTP/integration test fixtures support that without broad test refactoring.

## Client behavior

Files:

- `packages/client/src/profile/overview/DecisionDialog.tsx`
- related command helpers only if needed;
- existing finance query/API consumer for the selected subscription, but do not redesign finance transport.

Current UI already sends:

```ts
{
  overrideOutstandingComponents: values.overrideOutstanding,
  ...(values.overrideOutstanding ? { overrideReason: reason } : {})
}
```

Preserve that model.

Required UX behavior when the selected subscription has remaining service entitlement (`quantityConsumed < quantityEntitled`):

- show the warning/override checkbox;
- leave it unchecked by default;
- when unchecked, the completion submit action must not be presented as a valid ordinary completion of the blocked subscription;
- preferred: disable final confirmation until checkbox is selected, with clear explanatory text;
- once checked, require non-empty reason before submit;
- reason field must be visibly required only for the override path;
- unchecking override clears any override-specific validation state where practical;
- never auto-check it;
- never infer it from typing a reason.

French wording should clearly state:

`Des prestations restent dues par le coach. Pour terminer malgré ce blocage, sélectionne explicitement la dérogation et renseigne un motif.`

Checkbox label:

`Terminer malgré le blocage`

Reason label when override selected:

`Motif de la dérogation`

Keep server errors as final authority.

### Financial warning

The dialog must also surface current finance status when the subscription has remaining client balance.

Source of truth:
- existing finance read model for the same subscription;
- `remainingXaf > 0` means a financial balance remains.

Behavior:
- show a visually strong warning;
- do NOT disable completion because of finance alone;
- do NOT auto-check service override because of finance;
- do NOT send any finance mutation from the completion dialog;
- wording:

`Solde financier restant : {amount} FCFA. L'abonnement peut être terminé, mais ce solde restera dû après la clôture.`

If finance detail cannot be loaded, do not invent a zero balance. Preserve current lifecycle behavior and report the load limitation; server completion remains independent from finance.

Do not couple completion transaction to finance.

## Shared/API contract

Prefer no shared contract shape change.

Only change shared errors/contracts if implementation proves an existing typed error is insufficient.

Existing errors are expected to remain sufficient:

- `SUBSCRIPTION_COMPONENTS_OUTSTANDING`
- `SUBSCRIPTION_COMPLETION_REASON_REQUIRED`

Do not add a new endpoint.

## Required tests

### Service

Prove exact transport matrix:

1. override=false + no reason -> command reaches repository as false.
2. override=false + reason -> still reaches repository as false; reason does not become override.
3. override=true + no reason -> reason-required failure before repository.
4. override=true + blank reason -> reason-required failure.
5. override=true + valid reason -> normalized command.
6. string `"true"` -> invalid input.
7. unknown fields -> invalid input.

### Repository integration

Using a `completion_due` subscription with at least one component where `quantityConsumed < quantityEntitled`:

1. override=false + no reason -> `SUBSCRIPTION_COMPONENTS_OUTSTANDING`; status unchanged.
2. override=false + reason -> same failure; status unchanged.
3. override=true + blank/missing reason -> `SUBSCRIPTION_COMPLETION_REASON_REQUIRED`; status unchanged.
4. override=true + valid reason -> completed exactly once.
5. component balances unchanged after override.
6. a component with `quantityOwedByCoach = 0` but `quantityConsumed < quantityEntitled` still blocks completion.
7. a fully consumed component with `quantityOwedByCoach > 0` does not define the remaining-service blocker by itself unless another explicit rule already requires it; report exact behavior.
8. normal completion with all components fully consumed still succeeds with override=false.
9. repeat complete after success -> transition-invalid; no duplicate history/audit.
10. audit failure rolls back status/history as before.
11. overridden history/audit contains the approved structural distinction.
12. no role-specific repository bypass exists.

### HTTP/role coverage

If existing route test harness makes this bounded:

- admin/coach request with blocker and override=false -> same 409/error;
- superadmin request with blocker and override=false -> same 409/error;
- explicit override + valid reason works according to normal authorization for both allowed roles.

Do not create a large authorization refactor solely for this test.

### Client

Add focused tests if current client test infrastructure exists for this component without introducing new test tooling.

At minimum statically prove:

- remaining entitlement (for example 0/1 or 1/4) shows service blocker checkbox;
- fully consumed entitlement does not show service blocker checkbox;
- unchecked checkbox cannot submit successful blocked client intent;
- checked without reason is rejected client-side;
- checked + reason sends true + reason;
- reason alone never sends true;
- remaining finance balance shows the financial warning;
- finance warning alone does not disable normal completion.

## UAT docs

After implementation, not before:

- update `docs/recette/S8_FINDINGS.md`: UAT-002 -> RETEST, not RESOLVED;
- update `docs/recette/scenarios/S8-completion-renewal.md` with explicit blocker/override matrix;
- keep S9 exit gate unchecked until Fred confirms retest;
- do not mark Sprint 8 closed;
- do not add changelog validated entry until Fred confirms local retest.

## Fred retest matrix

Fred must run:

1. subscription with 0/1 or equivalent remaining service -> blocker visible;
2. remaining service + override unchecked + no reason -> refused;
3. remaining service + override unchecked + reason typed -> refused;
4. remaining service + override checked + blank reason -> refused;
5. remaining service + override checked + valid reason -> succeeds exactly once;
6. repeat blocker-path checks with admin/coach and superadmin;
7. all components fully consumed + override unchecked -> normal completion succeeds;
8. unpaid/partially-paid balance with no service blocker -> financial warning visible, completion still allowed;
9. unpaid/partially-paid balance + service blocker -> both warning and blocker shown; service override rules still apply;
10. refresh and verify persisted state;
11. DBeaver: status/history correct;
12. component quantities unchanged;
13. audit/history distinguishes overridden completion;
14. finance balances/events unchanged.

Only Fred's confirmation closes UAT-002.

## Checks

Codex may run sandbox checks; Fred remains the validation authority.

Run/report:

```bash
npm run format
npm run lint:dashes
npm run typecheck
npm test
npm run build
npm run db:check
npm run test:integration
git diff --check
```

If `docs:check` still reports the known untouched metadata issues, report them separately and do not hide them.

## Out of scope

Do NOT:

- change lifecycle states;
- change completion_due entry rules;
- auto-settle owed components;
- modify finance;
- modify renewal rules;
- add new role privileges;
- create superadmin bypass;
- add schema fields unless absolutely proven necessary;
- redesign subscription API;
- migrate unrelated frontend architecture;
- close Sprint 8.

## Expected report

Return:

1. base commit;
2. files changed;
3. exact authoritative guard behavior;
4. client UX behavior;
5. tests added;
6. role coverage;
7. checks/results;
8. migration yes/no;
9. deviations;
10. Fred retest checklist.

Stop after UAT-002 implementation.

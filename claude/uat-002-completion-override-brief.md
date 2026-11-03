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
2. The authoritative blocker for this slice is any `subscription_component.quantityOwedByCoach > 0`.
3. If no blocker exists:
   - `overrideOutstandingComponents=false` must complete normally;
   - no override reason is required.
4. If a blocker exists:
   - override=false + no reason -> reject;
   - override=false + reason -> reject;
   - override=true + blank/missing reason -> reject;
   - override=true + non-empty reason -> allow completion.
5. Same result for admin/coach and superadmin.
6. Role must never alter the blocker rule.
7. UI checkbox state is advisory/input only; server decides from current locked DB state.
8. A reason alone must never act as override.
9. A truthy/string-like value must never act as override; input remains strict boolean.
10. Successful override must be explicit in durable history/audit evidence.
11. Balances/components are preserved exactly; no automatic settlement.
12. Finance remains independent.
13. Renewal behavior is regression-only.
14. No unrelated frontend ARCH migration.

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
const hasOutstandingComponents =
  components.some((c) => c.quantityOwedByCoach > 0);
```

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
blocker + override=false
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
- related command helpers only if needed.

Current UI already sends:

```ts
{
  overrideOutstandingComponents: values.overrideOutstanding,
  ...(values.overrideOutstanding ? { overrideReason: reason } : {})
}
```

Preserve that model.

Required UX behavior when `outstandingComponents(view) > 0`:

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

Using a `completion_due` subscription with `quantityOwedByCoach > 0`:

1. override=false + no reason -> `SUBSCRIPTION_COMPONENTS_OUTSTANDING`; status unchanged.
2. override=false + reason -> same failure; status unchanged.
3. override=true + blank/missing reason -> `SUBSCRIPTION_COMPLETION_REASON_REQUIRED`; status unchanged.
4. override=true + valid reason -> completed exactly once.
5. component balances unchanged after override.
6. normal completion with no outstanding components still succeeds with override=false.
7. repeat complete after success -> transition-invalid; no duplicate history/audit.
8. audit failure rolls back status/history as before.
9. overridden history/audit contains the approved structural distinction.
10. no role-specific repository bypass exists.

### HTTP/role coverage

If existing route test harness makes this bounded:

- admin/coach request with blocker and override=false -> same 409/error;
- superadmin request with blocker and override=false -> same 409/error;
- explicit override + valid reason works according to normal authorization for both allowed roles.

Do not create a large authorization refactor solely for this test.

### Client

Add focused tests if current client test infrastructure exists for this component without introducing new test tooling.

At minimum statically prove:

- blocked completion shows checkbox;
- unchecked checkbox cannot submit successful client intent;
- checked without reason is rejected client-side;
- checked + reason sends true + reason;
- reason alone never sends true.

## UAT docs

After implementation, not before:

- update `docs/recette/S8_FINDINGS.md`: UAT-002 -> RETEST, not RESOLVED;
- update `docs/recette/scenarios/S8-completion-renewal.md` with explicit blocker/override matrix;
- keep S9 exit gate unchecked until Fred confirms retest;
- do not mark Sprint 8 closed;
- do not add changelog validated entry until Fred confirms local retest.

## Fred retest matrix

Fred must run:

1. blocker + override unchecked + no reason -> refused;
2. blocker + override unchecked + reason typed -> refused;
3. blocker + override checked + blank reason -> refused;
4. blocker + override checked + valid reason -> succeeds exactly once;
5. repeat 1-4 with admin/coach;
6. repeat blocker-path checks with superadmin;
7. no blocker + override unchecked -> normal completion succeeds;
8. refresh page and verify persisted state;
9. DBeaver: status/history correct;
10. component quantities unchanged;
11. audit/history distinguishes overridden completion;
12. finance remains unchanged.

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

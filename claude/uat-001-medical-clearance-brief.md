# UAT-001 - Medical clearance workflow

Role: implementer for one Sprint 8 P1 correction.

Base: current `main` after UAT-001 planning.

## Problem

K'FIT can create a blocking medical requirement but cannot clear it.

Current behavior:

- `medical_clearance_records` is created by:
  - effective catalogue policy `required`; or
  - questionnaire risk when policy is `required_if_risk_flag`.
- At most one medical requirement may be open for a subscription.
- The mirrored onboarding item is `medical_clearance`, blocking and pending.
- Generic onboarding `complete` and `waive` are intentionally forbidden for this item.
- No API/UI command records medical clearance, so the subscription can never reach `ready_to_start`.

This is UAT-001 / P1.

## Reusable patterns

Apply:

- Explicit State Transitions: named command, no generic status patch.
- Atomic Business Operation: record + blocker + audit in one transaction.
- Audit Event System: structural metadata only, no medical free text in generic audit.

## Goal

Add a dedicated admin/coach medical-clearance command and matching Preparation UI action.

Flow:

```text
open medical requirement
→ explicit admin clearance command
→ medical record cleared
→ mirrored medical blocker resolved
→ onboarding recomputed
→ ready remains a separate command
```

Capacity reservation remains independent.

## Locked business decisions

1. One named command: `clear_medical`.
2. It only resolves an existing open medical requirement. It never creates one.
3. Valid subscription state: `onboarding` only.
4. Exactly one open medical requirement must exist.
   - zero open → typed failure;
   - more than one open → typed history/invariant failure.
5. Open statuses are the existing authoritative set:
   - `required`
   - `pending`
   - `awaiting_document`
   - `under_review`
6. Successful command writes atomically:
   - medical record `status = "cleared"`;
   - `clearedAt = now`;
   - `clearedByUserId = actor.userId`;
   - optional trimmed note to `medical_clearance_records.note`;
   - resolves/removes the mirrored `medical_clearance` onboarding blocker only if no open medical requirement remains;
   - audit `medical_clearance.cleared`.
7. Audit metadata may contain only structural evidence:
   - `medicalClearanceRecordId`;
   - `triggerSource`.
   Never include the note or questionnaire answers.
8. Generic onboarding permissions stay unchanged:
   `medical_clearance -> canComplete=false, canWaive=false`.
9. No catalogue-policy or questionnaire mutation may act as a clearance shortcut.
10. No document-upload workflow in this slice. Existing nullable `documentId` remains untouched.
11. `ready_to_start` is not automatic. Fred/coach must still use the explicit existing Ready command.
12. Limited-capacity offers still require a valid capacity reservation after medical clearance.
13. No schema migration expected.
14. No unrelated frontend ARCH migration in this defect slice.

## Shared contract

Update:

`packages/shared/src/onboarding/contracts.ts`

Add route:

```ts
medicalClearance:
  "/admin/subscriptions/:subscriptionId/onboarding/medical-clearance/clear"
```

Add caller-owned input type:

```ts
export type ClearMedicalOnboardingInput = {
  note?: unknown;
};
```

Add typed errors, exact names:

```text
ONBOARDING_MEDICAL_CLEARANCE_NOT_REQUIRED
ONBOARDING_MEDICAL_CLEARANCE_HISTORY_INVALID
```

Meaning:

- NOT_REQUIRED = no open medical requirement exists.
- HISTORY_INVALID = more than one open medical requirement exists.

Keep all existing error codes and route contracts.

Update contract tests. The prior test saying "six approved admin commands" must become seven.

## Service command

Update `OnboardingCommand`:

```ts
| { action: "clear_medical"; note: string | null }
```

Input validation:

- body must be an object;
- only `note` is allowed;
- absent/null/empty/whitespace note => `null`;
- non-string non-null note => invalid input;
- trimmed note max 2000 chars;
- no itemId.

Do not allow arbitrary record IDs from the client. The server identifies the single open record from subscription state.

## Repository transaction

Implement inside the existing onboarding transaction boundary.

For `clear_medical`:

1. Existing customer writable/freeze check applies.
2. Lock subscription as current mutation path already does.
3. Require subscription status `onboarding`.
4. Select open medical records for the subscription `FOR UPDATE`.
5. If zero:
   return `medical_clearance_not_required`.
6. If >1:
   return `medical_clearance_history_invalid`.
7. Update the one record:
   - status cleared;
   - note;
   - clearedAt;
   - clearedByUserId.
8. Recompute open medical requirements.
9. If none remain, resolve the mirrored onboarding medical item.
   Preferred representation: mark it `completed` with `completedAt = now` rather than deleting it, because the UAT expects visible historical evidence after a real clearance.
   Do not make generic completion available.
10. Append `medical_clearance.cleared` audit in the same transaction.
11. Return the normal refreshed `OnboardingDetail`.

### Important distinction

The existing policy helper currently deletes a pending medical item when a policy-created requirement disappears because the policy was lifted.

That behavior remains unchanged.

A real clearance is different: it is an explicit business event and should leave completed checklist evidence.

## Controller / route

Extend the existing onboarding pipeline.

- admin authorization unchanged;
- same-origin + CSRF required;
- route is POST;
- subject archived behavior unchanged.

Map repository failures to the shared typed errors.

Recommended HTTP mapping:

- NOT_REQUIRED -> 409
- HISTORY_INVALID -> 409
- invalid input -> 400
- invalid state -> 409

No generic medical controller.

## Tests - required

### Shared contracts

- seven approved admin commands;
- route exact;
- input contains only caller-owned note;
- error codes unique and include the two new medical errors.

### Service tests

Prove:

- missing note -> null;
- whitespace note -> null;
- note trimmed;
- >2000 invalid;
- non-string invalid;
- unrelated body field invalid;
- clear_medical never accepts itemId as a business identifier.

### Repository integration

Add medical record cleanup to test teardown if not already present.

Prove:

1. policy `required` creates one open medical record + pending blocker.
2. `clear_medical` clears it:
   - status cleared;
   - clearedAt set;
   - clearedByUserId actor;
   - note stored if supplied;
   - onboarding item completed;
   - audit event written.
3. audit metadata excludes note content.
4. second `clear_medical` returns NOT_REQUIRED and makes no duplicate audit/write.
5. zero requirement returns NOT_REQUIRED.
6. multiple synthetic open records return HISTORY_INVALID and write nothing.
7. wrong subscription state rejects.
8. capacity remains independent:
   - after clearance on a limited offer without valid hold, `canReady=false`;
   - after valid hold and all other blockers satisfied, `canReady=true`.
9. existing questionnaire risk requirement can be cleared with the same command.
10. a later safe questionnaire revision never clears it implicitly before the explicit command.
11. transaction rollback on audit failure leaves medical record and blocker unchanged.

## Client API

Update:

`packages/client/src/onboarding/api/onboarding-api.ts`

Add:

```ts
clearMedical(id: string, note?: string)
```

POST to the shared route.

Send:

- `{}` when note absent/blank, or
- `{ note: trimmed }`.

Add French messages:

- NOT_REQUIRED:
  `"Aucune validation médicale en attente sur cet abonnement."`
- HISTORY_INVALID:
  `"L'historique médical de préparation est incohérent. Actualise puis contacte l'administrateur technique."`

Do not migrate the whole onboarding API transport in this UAT fix.

## Client UI

Update only the current Preparation flow.

File:

`packages/client/src/profile/preparation/PreparationTab.tsx`

For an unresolved item where:

```text
itemType === "medical_clearance"
owner === "medical"
```

show a dedicated button:

`Valider l'avis médical`

Do not expose generic Complete/Waive.

Open an explicit confirmation dialog.

Dialog content:

- Title: `Valider l'avis médical`
- Explanation:
  `Confirme uniquement après avoir reçu la validation médicale nécessaire. Cette action sera enregistrée dans l'historique.`
- Optional textarea label:
  `Note interne facultative`
- Hint:
  `Évite les détails médicaux inutiles. Cette note reste dans le dossier de validation médicale.`
- maxLength 2000
- buttons:
  - Retour
  - Confirmer la validation

On success:

- use the existing `apply()` refresh path;
- toast: `Validation médicale enregistrée.`
- close dialog;
- do not automatically reserve capacity;
- do not automatically mark Ready.

Keep the existing FE-ARCH migration paused. No page/feature moves in this fix.

## UAT checklist update

Update `docs/recette/scenarios/S3-onboarding.md` only after implementation to reflect the real command:

- dedicated medical validation action visible;
- optional note;
- after clearance medical blocker is completed;
- limited capacity still blocks Ready until reservation;
- Ready remains explicit.

Update `docs/recette/S8_FINDINGS.md` to `RETEST` after implementation, not RESOLVED.

Do not update `changelog.md` until Fred validates.

## Static/local checks

Codex may run its sandbox checks, but they are not project validation.

Run:

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

If the known broad `npm test` glob issue still exists, report it exactly rather than hiding it.

## Fred local validation

After implementation Fred must validate the exact UAT-001 path:

1. use an onboarding subscription with medical blocker;
2. confirm dedicated `Valider l'avis médical` action appears;
3. open dialog;
4. submit once with a short synthetic note;
5. blocker becomes completed/resolved;
6. refresh page - state persists;
7. DBeaver: record = cleared, actor/time present;
8. audit: structural ids/source only; note absent;
9. repeat action is unavailable or returns safe conflict without duplicate effect;
10. limited-capacity subscription still cannot Ready without reservation;
11. reserve place;
12. with all other blockers green, Ready becomes available;
13. explicitly mark Ready;
14. risk-triggered medical blocker follows same flow.

Only after Fred confirms this green can UAT-001 become RESOLVED and S3 continue.

## Out of scope

Do NOT:

- add medical file upload;
- add doctor identity/signature;
- interpret medical content;
- change risk evaluator;
- clear medical requirement from questionnaire correction;
- clear it by catalogue policy edit;
- allow generic checklist complete/waive;
- auto-ready subscription;
- change capacity rules;
- add new lifecycle statuses;
- migrate frontend architecture beyond touched code;
- change unrelated UAT scenarios.

## Expected report

Return:

1. base commit;
2. files changed;
3. exact shared contract additions;
4. repository transaction behavior;
5. tests added;
6. client UX added;
7. checks/results;
8. deviations;
9. migration yes/no;
10. Fred validation checklist.

Stop after UAT-001 implementation.

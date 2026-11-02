# K'FIT - Sprint 8 execution spec

## Objective

Run the formal V1 Core UAT and correction gate on the complete business loop before staging/production.

Sprint 8 validates the integrated product. It does not introduce new product scope.

## Status

Gate 1 approved by Fred on 2026-11-02. S8.1 scenario pack generated; S0 preflight is current.

Correction work is authorized only for defects discovered by UAT, one active finding at a time.

## Dependencies

- Sprints 1-7 are implemented and locally validated.
- FE-ARCH-01 reference foundation is validated; broader architecture migration is paused until Sprint 8 closes.
- Existing UAT source: `docs/recette/RECETTE_V1_CORE.md`.
- Production legal review and encrypted off-server backup remain Sprint 9 blockers, not Sprint 8 blockers.

## Gate 1 - approved decisions

### D1 - Fred-only Sprint 8 UAT

Sprint 8 UAT is executed by Fred only because K'FIT is currently available only on Fred's local machine.

- Fred performs the complete technical and functional V1 Core acceptance.
- No coach hands-on UAT is required to close Sprint 8.
- Coach hands-on acceptance moves to Sprint 9, once a staging/hosted environment is accessible, together with training and deployment acceptance.

### D2 - Controlled UAT data

Use a fresh, deterministic `kfit_dev` data set for the formal pass.

- Keep test identities/data obviously synthetic.
- Do not use production personal or health data.
- Preserve evidence needed for failed scenarios until triage is complete.
- Reset only through documented dev/test tooling.

### D3 - Finding severity

Use four severities:

- P0 - blocker: unsafe, data-loss/security/privacy issue, or impossible core flow.
- P1 - major: core V1 behavior is wrong or an essential path cannot be completed reliably.
- P2 - minor: behavior works but has a non-blocking defect, confusing UX, or recoverable inconsistency.
- P3 - polish: wording, visual detail, low-impact ergonomics.

### D4 - Exit rule

Sprint 8 can close only when:

- all P0/P1 findings are fixed and retested;
- no finding remains untriaged;
- Fred's critical end-to-end pass is green;
- any remaining P2/P3 is explicitly deferred with owner and target sprint;
- final automated suite is green or any known flake is explicitly identified and accepted according to the existing retry rule.

## Ordered tasks

1. S8.1 - UAT baseline and scenario pack.
2. S8.2 - Fred technical end-to-end pass and findings log.
3. S8.3 - Fix/retest loop, one defect at a time.
4. S8.4 - Final regression and Fred sign-off.
5. S8.5 - Sprint 8 closure and ARCH-resume handoff.

## S8.1 - UAT baseline and scenario pack

Update the existing recette to current V1 Core:

- catalogue editing and offer photos;
- trusted-device login / device OTP;
- Supervision;
- notifications bell/settings/email digest;
- retention/anonymization/holds/purge;
- backup/restore evidence references;
- Sprint 6 finance flows;
- personalized documents;
- final cross-cutting regression.

Create/maintain:

```text
docs/recette/
├── README.md
├── RECETTE_V1_CORE.md
├── S8_FINDINGS.md
└── scenarios/
    ├── S0-preflight.md
    ├── S1-public-request.md
    ├── S2-qualification-conversion.md
    ├── S3-onboarding.md
    ├── S4-active-coaching.md
    ├── S5-finance-documents.md
    ├── S6-notifications-dashboard.md
    ├── S7-privacy-operations.md
    ├── S8-completion-renewal.md
    └── S9-final-regression.md
```

Scenario sheets are executable checklists, not implementation specs.

## S8.2 - Fred technical pass

Run the full integrated flow on `kfit_dev`:

visitor/catalogue/photos
→ request
→ contact/qualification
→ conversion
→ onboarding
→ required/optional consents
→ questionnaire
→ medical clearance when applicable
→ activation
→ appointments
→ follow-ups
→ progress/goals
→ payment plan/payment events/proofs
→ quotes/receipts/documents
→ completion/renewal
→ archive/anonymize/holds/purge

Also verify:

- notification center + settings + digest behavior;
- dashboard and deep links;
- Supervision as superadmin;
- trusted-device/session/recovery behavior;
- public token security/replay boundaries;
- responsive/keyboard route coverage.

Every defect goes to `docs/recette/S8_FINDINGS.md`.

## S8.3 - correction loop

For each finding:

inspect
→ classify severity
→ identify owner/rule
→ implement smallest fix
→ Fred retests exact scenario
→ mark finding resolved
→ continue

Rules:

- one active defect at a time;
- no unrelated feature work;
- frontend fixes must follow FE-ARCH-01 for files touched;
- P2/P3 may be deferred only explicitly;
- changelog records validated fixes only.

## S8.4 - final regression and Fred sign-off

Fred reruns the critical integrated flow after all P0/P1 fixes and records the final technical/functional acceptance.

Coach hands-on acceptance is explicitly deferred to Sprint 9 because the app is not yet hosted in an environment the coach can access.

## S8.5 - Sprint 8 closure and ARCH-resume handoff

Run final release-candidate checks and record exact results:

```text
npm run typecheck
npm test
npm run build
npm run db:check
npm run test:integration
```

Then:

- verify all Sprint 8 acceptance criteria;
- update Notion;
- update TASKS.md;
- update exploration-cache;
- update changelog.md with validated Sprint 8 changes only;
- record accepted P2/P3 deferrals;
- identify the exact first post-UAT ARCH migration slice;
- Sprint 9 starts only after the agreed ARCH migration checkpoint is reached.

## Acceptance criteria

Sprint 8 is accepted when:

- complete visitor-to-completion flow passes;
- critical security/privacy boundaries pass;
- finance/document history is coherent;
- notification/dashboard/supervision behavior passes;
- privacy archive/anonymization/retention operations pass;
- responsive/keyboard spot checks pass;
- P0/P1 = 0 open;
- no untriaged finding;
- Fred final acceptance completed;
- final automated suite recorded.

## Blockers

Sprint 8 blockers:

- any P0/P1 finding discovered during UAT until fixed/retested.

Not Sprint 8 blockers, but production blockers for Sprint 9:

- applicable Gabon legal review;
- true encrypted off-server backup destination.

## Current task

S0 - local UAT preflight. After S0 is green, continue sequentially with S1.

## Architecture rule during UAT

Broader FE-ARCH migration remains paused.

If a UAT fix touches frontend code, apply the validated FE-ARCH rules to that touched area where practical without expanding the defect scope.

After Sprint 8 closes, resume the broader ARCH migration before Sprint 9 deployment/staging work.


## UAT-001 - medical clearance workflow missing

Status: P1 / RESOLVED - Fred validated locally on 2026-11-02. Implementation a28b7e1; docs/closure 15476f3.

### Observed

The product can create one open `medical_clearance_records` requirement per subscription from either:

- offer policy `required`; or
- questionnaire risk when policy is `required_if_risk_flag`.

The same open requirement is reused. More than one open medical requirement is treated as invalid history.

The onboarding item mirrors that requirement and is intentionally not generic-completable or waivable.

Missing: the named command that clears the medical requirement.

### Reusable patterns

- Explicit State Transitions (KNW-9): named command, current-state validation, no generic status patch.
- Atomic Business Operation (KNW-24): requirement record + onboarding blocker + audit update in one transaction.
- Audit Event System (KNW-32): actor/action/target/outcome structural evidence; no sensitive medical detail in generic audit metadata.

### Approved and implemented decisions

1. Add one named admin command: `clear medical clearance`.
2. It is valid only while the subscription is in onboarding/pre-start state and has exactly one open medical requirement.
3. Command clears the existing open record; it never creates a clearance record from nothing.
4. Persist atomically:
   - medical record `status = cleared`;
   - `clearedAt = now`;
   - `clearedByUserId = actor`;
   - optional medical note stays on the medical record only, never generic audit;
   - remove/resolve the mirrored onboarding medical blocker only when no open medical requirement remains;
   - append structural audit `medical_clearance.cleared` with record id + trigger source only.
5. No generic complete/waive permission change.
6. No policy/questionnaire mutation as a clearance mechanism.
7. No document-upload workflow in this corrective slice. Existing nullable `documentId` remains untouched; document evidence can be a later explicitly scoped enhancement.
8. Client adds a dedicated action on the medical checklist row, with explicit confirmation and optional note.
9. After success, refresh onboarding/customer lifecycle data; `ready_to_start` remains a separate explicit command and still requires capacity reservation where applicable.
10. No schema migration is expected unless implementation proves an existing DB constraint is missing.

### Validation gate

Must prove:

- no open requirement -> typed conflict/not-found;
- exactly one open requirement -> cleared once;
- repeat clearance -> no duplicate effect;
- wrong subscription state rejected;
- archived customer freeze preserved;
- medical record actor/time persisted;
- note absent from generic audit;
- onboarding blocker resolves atomically;
- capacity blocker remains independent;
- `ready_to_start` becomes possible only when every other blocker + capacity rule is satisfied;
- risk/policy trigger history remains unchanged.

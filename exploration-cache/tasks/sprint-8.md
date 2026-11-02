# K'FIT - Sprint 8 execution spec

## Objective

Run the formal V1 Core UAT and correction gate on the complete business loop before staging/production.

Sprint 8 validates the integrated product. It does not introduce new product scope.

## Status

Planning / Gate 1 proposed on 2026-11-02.

Implementation/correction work is not authorized beyond defects found by UAT until Fred approves Gate 1.

## Dependencies

- Sprints 1-7 are implemented and locally validated.
- FE-ARCH-01 reference foundation is validated; broader architecture migration is paused until Sprint 8 closes.
- Existing UAT source: `docs/recette/RECETTE_V1_CORE.md`.
- Production legal review and encrypted off-server backup remain Sprint 9 blockers, not Sprint 8 blockers.

## Gate 1 - proposed decisions

### D1 - Two-pass UAT

Run UAT in two passes:

1. Fred technical/full pass first.
2. Coach acceptance pass after all blocking technical findings are resolved.

Reason: the coach should validate the business workflow, not rediscover technical defects that Fred can catch first.

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
- coach acceptance pass is completed;
- any remaining P2/P3 is explicitly deferred with owner and target sprint;
- final automated suite is green or any known flake is explicitly identified and accepted according to the existing retry rule.

## Ordered tasks

1. S8.1 - UAT baseline and scenario pack.
2. S8.2 - Fred technical end-to-end pass and findings log.
3. S8.3 - Fix/retest loop, one defect at a time.
4. S8.4 - Coach acceptance pass.
5. S8.5 - Final regression, sign-off evidence and Sprint 8 closure.

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

## S8.4 - coach acceptance

Coach validates the user-facing business flow after Fred's P0/P1 gate is green.

Focus:

- catalogue clarity;
- request/qualification workflow;
- client onboarding;
- daily client management;
- appointments/follow-ups/progression;
- finance/document workflow;
- dashboard/notifications;
- understandable privacy/archive actions.

Coach acceptance is not a legal compliance review.

## S8.5 - final regression and closure

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
- identify exact first Sprint 9 task.

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
- coach acceptance completed;
- final automated suite recorded.

## Blockers

Sprint 8 blockers:

- any P0/P1 finding discovered during UAT until fixed/retested.

Not Sprint 8 blockers, but production blockers for Sprint 9:

- applicable Gabon legal review;
- true encrypted off-server backup destination.

## Current task

Gate 1 approval, then S8.1 UAT baseline/scenario pack.

## Architecture rule during UAT

Broader FE-ARCH migration remains paused.

If a UAT fix touches frontend code, apply the validated FE-ARCH rules to that touched area where practical without expanding the defect scope.

After Sprint 8 closes, resume the broader ARCH migration.

# FE-ARCH-04 - Consents feature migration

Role: bounded frontend architecture migration implementer.

Base: current `main` after validated FE-ARCH-03 (`5f76fb0`).

## Context

Sprint 8 UAT is closed. FE-ARCH-02 (Catalogue) and FE-ARCH-03 (Requests) are validated.

Target dependency direction:

```text
app
↓
pages
↓
features
↓
shared
↓
@kfit/shared
```

Current Consents debt:

- consents capability still lives at top-level `src/consents/`;
- admin router imports `ConsentTextsPage` directly from the domain folder;
- public router imports `PublicConsentPage` directly from the domain folder;
- consent API creates separate admin/public Axios transports and owns CSRF plumbing;
- consent query keys are handwritten inside components;
- `profile/health/HealthTab.tsx` imports consent API directly from the old top-level path.

This slice migrates Consents only.

## Goal

Move Consents into:

```text
packages/client/src/features/consents/
├── api/
├── components/
└── queries/
```

Add route-level wrappers:

```text
pages/admin/consents/ConsentTextsPage.tsx
pages/public/consent/PublicConsentPage.tsx
```

Preserve every existing consent business rule and UX behavior.

## Locked scope

Move:

```text
packages/client/src/consents/api/*
packages/client/src/consents/components/*
```

to:

```text
packages/client/src/features/consents/api/*
packages/client/src/features/consents/components/*
```

Create:

```text
packages/client/src/features/consents/queries/
```

for stable query keys/hooks.

Remove old `src/consents/` only after zero remaining imports.

Do not migrate another domain.

## Admin page composition

Current implementation:
`consents/components/ConsentTextsPage.tsx`

Rename during move to:

`features/consents/components/ConsentTextsWorkspace.tsx`

Export:

`ConsentTextsWorkspace`

Add:

`pages/admin/consents/ConsentTextsPage.tsx`

with composition only.

Update admin router to lazy-load the page wrapper.

Route remains:

`/admin/consentements`

Do not change:
- draft/publish/delete flow;
- fresh OTP flow;
- impact preview;
- labels/statuses;
- French copy;
- immutable version behavior.

## Public page composition

Current implementation:
`consents/components/PublicConsentPage.tsx`

Rename during move to:

`features/consents/components/PublicConsentView.tsx`

Export:

`PublicConsentView`

Add:

`pages/public/consent/PublicConsentPage.tsx`

with composition only.

Update public router to lazy-load the page wrapper.

Route remains:

`/consent`

Token remains in URL hash exactly as before.

Do not change:
- hash-token handling;
- per-link query identity semantics;
- required vs optional handling;
- no-preselection behavior;
- replay behavior;
- public error messages;
- submit behavior.

## Shared HTTP migration

Update:

`features/consents/api/consent-api.ts`

to use:

`shared/api/http-client.ts`

### Admin transport

Preserve:
- credentials enabled;
- CSRF on mutating methods.

Use canonical shared client/factory.

### Public transport

Preserve:
- credentials disabled;
- CSRF disabled.

Recommended:

```ts
const publicHttp = createApiHttpClient({
  withCsrf: false,
  config: { withCredentials: false },
});
```

or behavior-equivalent.

After migration:
- no `axios.create()` in Consents;
- no direct `buildCsrfHeaders` / `requiresCsrfHeader` imports in Consents.

Error helpers may use `apiErrorData` / `apiErrorCode` where behavior remains identical.

Do not change:
- route paths;
- request/response payloads;
- typed errors;
- French messages;
- API contracts.

## Stable query keys

Create:

`features/consents/queries/consent-keys.ts`

Preserve current key values exactly.

Recommended factory:

```ts
export const consentKeys = {
  definitions: ["consent-definitions"] as const,
  definition: (id: string | null) =>
    ["consent-definition", id] as const,
  definitionImpact: (id: string) =>
    ["consent-definition-impact", id] as const,
  publicLink: (queryId: string) =>
    ["public-consent", queryId] as const,
};
```

Do not change key semantics.

Use these keys in:
- admin definitions list;
- definition detail;
- publish impact;
- public link.

Create hooks only where they reduce duplication without changing behavior:
- `useConsentDefinitions()`
- `useConsentDefinition(id)`
- `useConsentDefinitionImpact(id)`

Public link hook is optional because its enabled/retry/refetch semantics are tightly coupled to local token/submitted state. If kept inline, still use `consentKeys.publicLink(queryId)`.

## Cross-feature dependencies

### Auth

Consent publishing depends on:
- `authApiClient`;
- OTP components/helpers.

Keep the explicit dependency.

Do not move auth code.

### Profile / Health

Current:
`profile/health/HealthTab.tsx` imports consent API.

After move:
update import to `features/consents/api/consent-api`.

Do not migrate profile/health in this slice.

This is a documented cross-feature/domain dependency and is allowed temporarily.

## Existing layering debt

`ConsentTextsWorkspace` currently imports `app/layout/AdminPage`.

Do not redesign this here.

Record it alongside CatalogueWorkspace/RequestsWorkspace as the same recurring feature-to-app inversion. A later cross-cutting slice should fix this pattern consistently.

## Generic infrastructure

Consents may continue importing current:
- `components/ui`;
- `components/public`;
- `lib/format`;
- `lib/focus`;
- `lib/status-map`.

Do not migrate generic UI/lib in FE-ARCH-04.

## No behavior changes

Do not change:
- consent definitions;
- required/optional types;
- versioning;
- OTP requirements;
- public token semantics;
- replay semantics;
- revocation rules;
- customer consent capture;
- French copy.

No server/shared-contract/database changes.

## Required repository proof

After migration verify:

1. `packages/client/src/consents/` does not exist.
2. No source import points to old Consents paths.
3. Admin router imports page wrapper only.
4. Public router imports page wrapper only.
5. HealthTab import points to `features/consents`.
6. Query keys are centralized.
7. Query key values are unchanged.
8. No raw `axios.create()` remains in Consents.
9. No direct CSRF helper plumbing remains.
10. No unrelated feature was moved.

## Local checks

Run/report:

```bash
npm run format
npm run lint:dashes
npm run typecheck
npm run build
git diff --check
```

Run relevant existing client tests if present.

No migration expected.

## Fred browser validation

Fred validates:

1. `/admin/consentements` loads.
2. Existing definitions list/history render.
3. Open/read a published definition.
4. Open/edit a draft.
5. Create/save a draft if practical.
6. Publish flow still triggers fresh OTP when required.
7. Close/reopen page and verify persisted state.
8. Generate/use a synthetic public consent link.
9. `/consent#<token>` loads.
10. Required/optional decisions render correctly.
11. No option is preselected.
12. Submit decisions successfully.
13. Replay/used-link behavior remains correct.
14. Health/profile consent-dependent UI still loads.
15. Direct reload of admin/public pages works.
16. No console/module-resolution errors.

Only Fred validation moves FE-ARCH-04 to Terminé.

## Documentation/state

Before Fred validation:
- report IMPLEMENTED / awaiting validation;
- do not add validated changelog entry.

After Fred validation:
- update architecture status;
- update changelog;
- close Notion task;
- choose next bounded slice (likely Questionnaires).

## Out of scope

Do NOT:
- migrate Questionnaires;
- migrate Auth;
- migrate Profile/Health;
- migrate generic shared UI;
- redesign consent UX;
- change business rules;
- start Sprint 9.

## Expected report

Return:
1. base commit;
2. files moved/renamed;
3. files created;
4. router/page changes;
5. HTTP migration;
6. query-key/hook migration;
7. imports updated outside Consents;
8. old-path removal proof;
9. remaining layering debt;
10. checks/results;
11. behavior deviations;
12. Fred browser checklist.

Stop after FE-ARCH-04 implementation.

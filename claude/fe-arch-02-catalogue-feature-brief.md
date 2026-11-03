# FE-ARCH-02 - Catalogue feature migration

Role: bounded frontend architecture migration implementer.

Base: current `main` after Sprint 8 closure.

## Context

Sprint 8 UAT is closed. The approved architecture initiative now resumes before Sprint 9.

Reference architecture:
- `docs/frontend-architecture.md`
- FE-ARCH-01a..01e already validated.

Current target layers:

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

Current gap:

- `pages/` exists;
- `shared/api/http-client.ts` exists;
- `features/` does not yet exist;
- catalogue still lives at top-level `src/catalogue/`;
- catalogue API still creates its own Axios/CSRF transport;
- public catalogue route imports a domain component directly instead of a page wrapper.

This slice establishes the first real `features/` migration using the already-validated catalogue reference domain.

## Goal

Migrate the complete catalogue frontend capability into:

```text
packages/client/src/features/catalogue/
├── api/
├── components/
├── lib/
└── queries/
```

and make both public/admin route surfaces compose it through `pages/`.

No business behavior changes.

## Locked scope

Move:

```text
packages/client/src/catalogue/api/*
packages/client/src/catalogue/components/*
packages/client/src/catalogue/lib/*
packages/client/src/catalogue/queries/*
```

to:

```text
packages/client/src/features/catalogue/api/*
packages/client/src/features/catalogue/components/*
packages/client/src/features/catalogue/lib/*
packages/client/src/features/catalogue/queries/*
```

After migration, remove the old top-level `src/catalogue/` directory only when there are zero remaining imports.

Do not migrate any other domain in this slice.

## Public page composition

Current debt:

`app/router/public-routes.tsx` imports `catalogue/components/PublicCataloguePage` directly.

Target:

```text
app/router/public-routes.tsx
→ pages/public/catalogue/PublicCataloguePage.tsx
→ features/catalogue/components/PublicCatalogueView.tsx
```

Required:

1. Move/rename the current feature implementation:
   - old: `catalogue/components/PublicCataloguePage.tsx`
   - new: `features/catalogue/components/PublicCatalogueView.tsx`
2. Export `PublicCatalogueView`.
3. Add:
   `pages/public/catalogue/PublicCataloguePage.tsx`
4. Page wrapper contains composition only:
   ```tsx
   import { PublicCatalogueView } from "../../../features/catalogue/components/PublicCatalogueView.js";

   export function PublicCataloguePage() {
     return <PublicCatalogueView />;
   }
   ```
5. Router imports/lazy-loads the page wrapper, never the feature view directly.

Do not change public catalogue copy, layout, filters, links, FAQ, price logic, or request URLs.

## Admin page composition

Keep:

`pages/admin/catalogue/CataloguePage.tsx`

Update only its import:

```text
../../../catalogue/components/CatalogueWorkspace
→ ../../../features/catalogue/components/CatalogueWorkspace
```

Do not move route/search-param composition into the page during this slice. The validated reference page remains intentionally thin.

## Cross-feature dependency

Current:

`requests/components/PublicRequestForm.tsx`
imports catalogue API + OfferCover.

After move, update it explicitly to:

```text
features/catalogue/api/catalogue-api
features/catalogue/components/OfferCover
```

This cross-feature dependency is accepted for this slice because the public request screen consumes catalogue read data and catalogue-owned visual representation.

Do NOT:
- move request code into catalogue;
- duplicate catalogue API calls;
- create a shared catalogue abstraction;
- add a barrel solely to hide the dependency.

## Catalogue shared HTTP migration

Current catalogue API duplicates:
- Axios instance creation;
- credentials;
- CSRF interceptor;
- base URL logic;
- transport error parsing.

FE-ARCH-01b established:

`shared/api/http-client.ts`

as canonical transport infrastructure.

Update:

`features/catalogue/api/catalogue-api.ts`

to use that shared infrastructure.

### Preserve public/admin transport semantics

Current behavior differs:

- public catalogue client: no credentials / no CSRF;
- admin catalogue client: credentials + CSRF.

Preserve that distinction.

Recommended defaults:

```ts
const publicHttp = createApiHttpClient({
  baseUrl,
  withCsrf: false,
  config: { withCredentials: false },
});

const adminHttp = createApiHttpClient({ baseUrl });
```

or equivalent using the existing shared factory.

Keep injectable `http` / `adminHttp` options used by tests.

Do not create raw `axios.create()` inside catalogue after this slice.

For API error parsing, use shared helpers such as `apiErrorData` / `apiErrorCode` where they preserve existing reason/error behavior.

Do not change:
- route URLs;
- payloads;
- typed errors;
- French messages;
- image upload headers;
- response contracts.

## Internal imports

After moving catalogue files:

- fix all relative imports to `app`, `shared`, old generic `components` and `lib` locations;
- do not migrate generic UI/lib folders in this slice;
- do not create aliases unless one already exists;
- preserve explicit `.js` import suffix convention.

Catalogue feature is allowed to import:
- `@kfit/shared`;
- `shared/api`;
- current generic UI/lib infrastructure until later shared migrations;
- app layout only if already required by existing CatalogueWorkspace behavior.

Note: `CatalogueWorkspace` currently imports `app/layout/AdminPage`. This is an existing layering inversion (feature -> app). Do NOT silently redesign it in this move. Record it as the next architecture debt if still present after migration.

## No behavior changes

Do not alter:
- catalogue business rules;
- publish/archive/reorder behavior;
- variants/components/rules editing;
- photos;
- deliverability;
- query keys;
- query semantics;
- public catalogue rendering;
- admin catalogue rendering;
- request form behavior.

No server/shared-contract/database changes.

## Stable query identities

Preserve exact catalogue query keys from FE-ARCH-01e.

Moving files must not change the arrays returned by:
- `catalogueKeys.adminOverview()`
- `catalogueKeys.publicServices()`
- `catalogueKeys.deliverability(...)`

No cache reset caused by architecture changes.

## Required repository checks

Search after move and prove:

```text
packages/client/src/catalogue/
```

has no remaining source files.

Search all imports for:
- `/catalogue/`
- `../catalogue`
- `../../catalogue`

and verify every catalogue domain import points to `features/catalogue` or the appropriate page wrapper.

Also verify:
- app router does not import catalogue feature directly;
- admin page imports feature;
- public page imports feature;
- request feature cross-import is explicit.

## Local checks

Codex may run its local checks, but Fred remains validation authority.

Run/report:

```bash
npm run format
npm run lint:dashes
npm run typecheck
npm run build
git diff --check
```

Run client/unit tests relevant to catalogue if present without broadening scope.

Do not run database migrations because none are expected.

## Fred browser validation

After implementation Fred validates:

1. `/` public catalogue loads.
2. Family filtering still works.
3. Offer photos render.
4. Variant selection still updates request URL.
5. CTA opens `/demande/:offre` correctly.
6. Public request page still loads selected offer/cover.
7. `/admin/offres` loads.
8. Published/draft/archived tabs work.
9. Offer details open.
10. Before-publication/deliverability loads.
11. Edit one safe catalogue field and save if practical.
12. Reload `/admin/offres` directly.
13. No console/module-resolution error.

Only after Fred confirms green may FE-ARCH-02 be marked validated.

## Documentation/state

After implementation, but before Fred validation:
- do not mark changelog validated;
- report FE-ARCH-02 as IMPLEMENTED / awaiting Fred validation.

After Fred validation:
- update `docs/frontend-architecture.md` migration status;
- update active project state;
- add validated changelog entry;
- select the next bounded architecture slice.

## Out of scope

Do NOT:
- migrate requests;
- migrate shared UI/components;
- migrate generic lib;
- migrate auth;
- migrate another domain;
- redesign CatalogueWorkspace;
- change AdminPage ownership;
- add aliases;
- add barrels unless genuinely needed;
- change business behavior;
- start Sprint 9.

## Expected report

Return:
1. base commit;
2. files moved;
3. files newly created;
4. imports updated outside catalogue;
5. shared HTTP changes;
6. proof old `src/catalogue` is empty/removed;
7. remaining layering debt discovered;
8. checks/results;
9. behavior deviations (must be none);
10. Fred browser checklist.

Stop after FE-ARCH-02 implementation.

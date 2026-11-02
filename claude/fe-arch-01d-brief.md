# FE-ARCH-01d - Introduce pages/ with one reference route

Role: frontend architecture refactor implementer.

Base: current main after FE-ARCH-01c validation.

## Goal

Introduce the route-level `pages/` layer using exactly one reference admin route:

`/admin/offres`

This slice must establish the page-vs-feature boundary without migrating the whole catalogue domain or any other route.

## Reference pattern

Current:

```text
app/router/admin-routes.tsx
  -> catalogue/components/CataloguePage.tsx
```

Target:

```text
app/router/admin-routes.tsx
  -> pages/admin/catalogue/CataloguePage.tsx
       -> catalogue/components/CatalogueWorkspace.tsx
```

The route page is composition-only.
The catalogue workspace retains the existing domain UI, queries, actions and business behavior.

## Locked decisions

1. Create:
   `packages/client/src/pages/admin/catalogue/CataloguePage.tsx`
2. Rename/move:
   `packages/client/src/catalogue/components/CataloguePage.tsx`
   to
   `packages/client/src/catalogue/components/CatalogueWorkspace.tsx`
3. Rename exported component:
   `CataloguePage` -> `CatalogueWorkspace`
4. New page component exports `CataloguePage` and renders `<CatalogueWorkspace />`.
5. Update admin router lazy import to point to the page layer.
6. Do not move any other catalogue files.
7. Do not create `features/catalogue/` yet.
8. Do not change catalogue query keys, API calls, state, UI wording, URL search params, dialogs, drag/drop, image behavior, or business rules.
9. Do not migrate the public catalogue route in this slice.
10. No new dependency.
11. No server/shared changes.

## Why this route

`/admin/offres` is a clean admin route:
- no special redirect;
- no role-specific wrapper beyond normal admin auth;
- mature real UI;
- clear domain owner;
- easy manual smoke test.

It therefore becomes the reference pattern for future page migrations.

## Page responsibility

`pages/admin/catalogue/CataloguePage.tsx` must stay intentionally small.

Expected shape:

```tsx
import { CatalogueWorkspace } from "../../../catalogue/components/CatalogueWorkspace.js";

export function CataloguePage() {
  return <CatalogueWorkspace />;
}
```

Do not move business/query logic into the page.

## Workspace responsibility

`CatalogueWorkspace.tsx` keeps all existing behavior currently in `CataloguePage.tsx`.

Allowed changes inside that file:
- filename;
- exported function name;
- comment wording only if needed to clarify workspace ownership;
- import paths only if mechanically required.

Forbidden:
- refactoring internal functions;
- extracting hooks;
- changing query keys;
- changing API calls;
- changing JSX;
- changing styles;
- changing business rules.

## Router

In `app/router/admin-routes.tsx`, the lazy import must become:

```text
../../pages/admin/catalogue/CataloguePage.js
```

The route remains exactly:

```text
/admin/offres
```

Lazy loading must remain.

## Static checks

Before commands, verify:
1. old `catalogue/components/CataloguePage.tsx` no longer exists;
2. `CatalogueWorkspace.tsx` contains the unchanged catalogue implementation;
3. page wrapper contains no query/API/business logic;
4. router imports the page layer;
5. no other route changed;
6. public catalogue remains untouched;
7. no unrelated formatting churn.

## Local checks

Run:

```bash
npm run format
npm run lint:dashes
npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
git diff --check
```

## Fred manual validation

Only:
1. open `/admin/offres`;
2. reload directly on `/admin/offres`;
3. switch Published / Drafts / Archived tabs;
4. open one offer;
5. close it;
6. verify one harmless existing interaction if practical (for example open a sheet, without changing business data);
7. mobile width: page still renders/navigates correctly.

No full UAT required for this architecture-only slice.

## Definition of done

Implemented when:
- `pages/admin/catalogue/CataloguePage.tsx` exists;
- domain-heavy implementation is named `CatalogueWorkspace`;
- admin router points to the page layer;
- static checks pass;
- no behavior change.

Validated only after Fred confirms the catalogue smoke test.

## Out of scope

Do NOT:
- migrate any second page;
- create `features/`;
- move shared UI;
- migrate queries/hooks;
- centralize catalogue API;
- refactor CatalogueWorkspace internals;
- touch public catalogue;
- touch server/shared business logic.

## Expected report

Return:
1. base commit;
2. files moved/created/changed;
3. before/after dependency path;
4. confirmation that workspace implementation body stayed behavior-equivalent;
5. exact checks/results;
6. deviations;
7. Fred smoke-test checklist.

Stop after FE-ARCH-01d.

# FE-ARCH-01e - Catalogue query keys and hooks reference pattern

Role: frontend architecture refactor implementer.

Base: current main after FE-ARCH-01d validation.

## Goal

Establish one reference TanStack Query pattern for K'FIT using the catalogue domain.

This slice must create stable catalogue query keys and reference query hooks, then replace only the existing catalogue query declarations/invalidation literals that correspond to those keys.

No business behavior change.

## Architecture target

```text
catalogue/api/catalogue-api.ts
        ↓
catalogue/queries/catalogue-queries.ts
        ↓
catalogue/components/*
        ↓
pages/admin/catalogue/CataloguePage.tsx
```

The API client owns transport.
The query module owns cache identity + fetch lifecycle.
Components own rendering/interactions.

## Files to create

```text
packages/client/src/catalogue/queries/catalogue-keys.ts
packages/client/src/catalogue/queries/catalogue-queries.ts
```

Do not create `features/catalogue/` yet.

## Current catalogue cache identities

These already exist and must keep equivalent cache identity:

```text
["catalogue"]
["catalogue", "admin-overview"]
["catalogue", "public-services"]
deliverabilityQueryKey(serviceId)  # inspect existing exact shape and preserve it
```

## Locked decisions

1. Create a stable key factory named `catalogueKeys`.
2. `catalogueKeys.all` must represent the catalogue root and remain compatible with current broad invalidation.
3. Add named keys for:
   - admin overview;
   - public services;
   - deliverability(serviceId).
4. Preserve the existing exact logical key shape for all current queries. This is a refactor, not a cache reset.
5. Create query hooks for:
   - `useCatalogueAdminOverview()`;
   - `useCataloguePublicServices()`;
   - `useCatalogueDeliverability(serviceId, options?)` or an equally small typed equivalent.
6. The deliverability hook must support the current disabled-until-id behavior used by the publish confirmation flow.
7. Replace direct `useQuery` definitions in:
   - `CatalogueWorkspace.tsx`;
   - `PublicCataloguePage.tsx`;
   - `DeliverabilityChecklist.tsx`.
8. Replace broad invalidation literals `["catalogue"]` in catalogue components with `catalogueKeys.all`.
9. Move `deliverabilityQueryKey` ownership out of the component file into the query-key module.
10. If compatibility is useful, a temporary re-export of `deliverabilityQueryKey` is allowed, but preferred end state is all catalogue callers importing from the query module.
11. Do not migrate catalogue mutations into mutation hooks in this slice.
12. Do not change API calls or API client transport.
13. Do not change staleTime/retry/refetch settings unless they already exist. Default behavior must remain the same.
14. Do not change query enablement behavior.
15. Do not change UI state, wording, routes, CSS, forms, dialogs, drag/drop or business rules.
16. Do not migrate queries from any other domain.
17. No dependency changes.
18. No server/shared changes.

## Expected key factory shape

Use a simple explicit factory, for example:

```ts
export const catalogueKeys = {
  all: ["catalogue"] as const,
  adminOverview: () => [...catalogueKeys.all, "admin-overview"] as const,
  publicServices: () => [...catalogueKeys.all, "public-services"] as const,
  deliverability: (serviceId: string) =>
    [...catalogueKeys.all, "deliverability", serviceId] as const,
};
```

BUT: inspect the current `deliverabilityQueryKey` shape first and preserve it exactly if it differs from this example.

The brief's example is not permission to change cache identity.

## Query hooks

The query module should remain thin.

Conceptually:

```ts
export function useCatalogueAdminOverview() {
  return useQuery({
    queryKey: catalogueKeys.adminOverview(),
    queryFn: () => catalogueApiClient.listAdminOverview(),
  });
}
```

The public hook follows the same pattern.

Deliverability must preserve current behavior in both:
- `DeliverabilityChecklist` (normal enabled query);
- `CatalogueWorkspace` publish confirmation (disabled until a valid publishing service id exists).

Prefer a small options parameter like `enabled?: boolean` over leaking full TanStack Query configuration unless the current use case requires more.

## Invalidation

Existing broad invalidation behavior must remain broad.

These current locations use `["catalogue"]` and should switch to `catalogueKeys.all`:

- `ServiceSheet.tsx` / `useCatalogueRefresh`;
- `content-action.tsx`;
- `ServicePhoto.tsx`;
- any other catalogue-local literal root invalidation found by search.

Do not narrow invalidation in this slice.

## Component responsibility after migration

### CatalogueWorkspace

Should no longer define:
- admin overview query key/fetch pair;
- deliverability query key/fetch pair.

It may still hold:
- local UI state;
- drag/drop;
- mutation orchestration;
- toast behavior;
- URL search params.

### PublicCataloguePage

Should no longer define its public-services query key/fetch pair.

### DeliverabilityChecklist

Should no longer own cache identity.

It remains responsible for rendering deliverability state.

## Static checklist

Before running commands, verify:

1. no catalogue component contains `queryKey: ["catalogue"...]`;
2. all root catalogue invalidation uses `catalogueKeys.all`;
3. no cache-key shape changed;
4. API calls are unchanged;
5. no mutation orchestration moved;
6. no query from another domain changed;
7. page/router files are untouched unless an import path mechanically requires it;
8. no unrelated formatting churn.

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

Because behavior should be identical, validate only catalogue surfaces:

Admin:
1. open `/admin/offres`;
2. switch Publiées / Brouillons / Archivées;
3. open an offer;
4. open the publication/readiness checklist if available;
5. close/reopen the sheet and verify data stays coherent;
6. perform one harmless action that triggers catalogue refresh if practical.

Public:
7. open `/`;
8. confirm published offers still load;
9. if a harmless visibility/content change was made in dev, confirm refresh consistency.

No full UAT required.

## Definition of done

Implemented when:
- stable `catalogueKeys` exists;
- query hooks exist;
- catalogue components use them;
- broad invalidation is expressed through `catalogueKeys.all`;
- cache identities and runtime behavior remain equivalent;
- static checks pass.

Validated only after Fred confirms the catalogue admin/public smoke test.

## Out of scope

Do NOT:
- create mutation hooks;
- move catalogue into `features/`;
- migrate another domain;
- change catalogue API transport;
- refactor catalogue business/UI logic;
- introduce optimistic updates;
- tune stale times;
- add query persistence;
- change routes/pages.

## Expected report

Return:
1. base commit;
2. files created/changed;
3. exact old -> new query key mapping;
4. exact hooks added;
5. invalidation sites migrated;
6. confirmation that query behavior/settings are unchanged;
7. exact checks/results;
8. deviations;
9. Fred smoke-test checklist.

Stop after FE-ARCH-01e.

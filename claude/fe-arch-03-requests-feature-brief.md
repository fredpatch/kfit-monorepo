# FE-ARCH-03 - Requests feature migration

Role: bounded frontend architecture migration implementer.

Base: current `main` after validated FE-ARCH-02 (`da91b4f`).

## Context

Sprint 8 UAT is closed. FE-ARCH-02 catalogue migration is validated.

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

Current Requests debt:

- requests capability still lives at top-level `src/requests/`;
- admin router imports `requests/components/RequestsPage` directly;
- public router imports `requests/components/PublicRequestForm` directly;
- public and admin request API clients each create their own Axios transport;
- request queries use ad-hoc arrays instead of a feature query-key factory;
- `app/layout/use-nav-badges.ts` imports request API directly.

This slice migrates Requests only.

## Goal

Move Requests into:

```text
packages/client/src/features/requests/
├── api/
├── components/
├── lib/
└── queries/
```

Add route-level wrappers:

```text
pages/admin/requests/RequestsPage.tsx
pages/public/request/PublicRequestPage.tsx
```

and preserve every existing request business rule and UI behavior.

## Locked scope

Move all files from:

```text
packages/client/src/requests/api/*
packages/client/src/requests/components/*
packages/client/src/requests/lib/*
```

to the matching `features/requests/` folders.

Create `features/requests/queries/` for stable request query keys/hooks.

Remove old `src/requests/` only after zero remaining imports.

Do not migrate another domain.

## Admin page composition

Current feature component:

`requests/components/RequestsPage.tsx`

Rename during move to:

`features/requests/components/RequestsWorkspace.tsx`

Export:

`RequestsWorkspace`

Add:

`pages/admin/requests/RequestsPage.tsx`

with composition only:

```tsx
import { RequestsWorkspace } from "../../../features/requests/components/RequestsWorkspace.js";

export function RequestsPage() {
  return <RequestsWorkspace />;
}
```

Update admin router to lazy-load the page wrapper.

Do not change URL/search-param behavior:
- `/admin/demandes`
- `vue`
- `demande`

Do not change queue filtering/search/status display.

## Public page composition

Current:
`requests/components/PublicRequestForm.tsx` exports `PublicRequestPage`.

Target:

- move implementation to:
  `features/requests/components/PublicRequestView.tsx`
- export `PublicRequestView`;
- add:
  `pages/public/request/PublicRequestPage.tsx`
- page wrapper composes only `PublicRequestView`;
- public router lazy-loads the page wrapper.

Keep route:
`/demande/:offre`

Do not change:
- intake fields;
- idempotency token;
- honeypot;
- formRenderedAt;
- validation;
- WhatsApp normalization assumptions;
- request status/error behavior;
- success copy;
- catalogue selection/cover behavior.

## Cross-feature dependency

Public request legitimately consumes catalogue data and catalogue-owned offer rendering.

Keep explicit imports from:

```text
features/catalogue/api/catalogue-api
features/catalogue/components/OfferCover
```

Do not duplicate catalogue code or move it into Requests.

## Shared HTTP migration

Both Requests clients must use:

`shared/api/http-client.ts`

### Public Requests client

Current public submission transport has no credentials/CSRF.

Preserve exactly:

```ts
createApiHttpClient({
  baseUrl,
  withCsrf: false,
  config: { withCredentials: false },
});
```

or equivalent.

### Admin Requests client

Use normal authenticated shared transport with credentials + CSRF.

Preserve injectable `http` options for tests.

After this slice:
- no `axios.create()` inside Requests;
- no direct CSRF helper plumbing inside Requests API clients.

Do not change routes, payloads, errors, response contracts, or API behavior.

## Stable request query keys

Create:

`features/requests/queries/request-keys.ts`

Preserve current cache identities exactly.

Recommended factory:

```ts
export const requestKeys = {
  all: ["requests"] as const,
  adminQueue: () => ["requests", "admin-queue"] as const,
  adminQueueAll: () => ["requests", "admin-queue", "all"] as const,
  adminQueueByStatus: (status: ServiceRequestStatus) =>
    ["requests", "admin-queue", status] as const,
  adminDetail: (requestId: string) =>
    ["requests", "admin-detail", requestId] as const,
};
```

Important:
- resulting arrays must match existing identities exactly;
- invalidating `adminQueue()` must continue to invalidate all queue variants.

Create focused query hooks where they reduce direct API/query plumbing without changing semantics:

- `useAdminRequestsQueue()`
- `useAdminRequestDetail(requestId)`

Preserve current refetch intervals.

Public catalogue query in `PublicRequestView` should reuse the existing catalogue feature hook if available and behavior-equivalent; do not invent a duplicate key.

## Mutation invalidation

Update `request-actions.tsx` to use `requestKeys` rather than handwritten request arrays.

Keep customer invalidation exactly as currently required.

No mutation behavior changes.

## App nav badge dependency

Current:
`app/layout/use-nav-badges.ts` imports `adminRequestsApiClient` and uses:
`["requests", "admin-queue", "submitted"]`.

After migration:

- importing feature API/query key from app is allowed because dependency direction is `app -> features`;
- update path to `features/requests`;
- use `requestKeys.adminQueueByStatus("submitted")`;
- preserve the exact resulting key and 60s refetch interval.

Do not redesign nav badges in this slice.

## Existing layering debt

`RequestsWorkspace` currently renders/imports `app/layout/AdminPage`.

This is the same feature-to-app inversion seen in CatalogueWorkspace.

Do NOT redesign it here unless the smallest mechanical extraction is trivial and applies identically to catalogue. Prefer recording this as a separate cross-cutting ARCH slice so both features are fixed consistently.

Also inspect RequestDetail for existing cross-feature imports (privacy, customers, subscriptions, etc.). Preserve them unless a simple import path update is required. Do not migrate those domains.

## Generic infrastructure

Requests may continue importing current:
- `components/ui`;
- `components/public`;
- `lib/utils`;
- `lib/status-map`;
- `lib/families`.

Do not migrate generic UI/lib in FE-ARCH-03.

## No behavior changes

Do not change:
- public request rules;
- anti-abuse controls;
- request state transitions;
- qualification;
- waitlist;
- conversion;
- customer linking;
- status labels;
- search/filter behavior;
- route URLs;
- French copy.

No server/shared-contract/database changes.

## Required repository proof

After migration verify:

1. `packages/client/src/requests/` does not exist.
2. No source import points to old Requests paths.
3. Admin router imports only page wrapper.
4. Public router imports only page wrapper.
5. App nav badge import points to `features/requests`.
6. Request query keys are centralized.
7. Existing request key arrays are unchanged in value.
8. No raw `axios.create()` remains in Requests.
9. No direct request CSRF plumbing remains.
10. No other feature was moved.

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

No database commands/migrations expected.

## Fred browser validation

Fred validates:

1. `/` loads.
2. Open an offer and navigate to `/demande/:offre`.
3. Selected variant from catalogue is preserved.
4. Public request form loads correctly.
5. Required-field validation unchanged.
6. Submit one synthetic request successfully.
7. Duplicate/retry behavior remains as expected if practical.
8. `/admin/demandes` loads.
9. Queue tabs/views work.
10. Search works.
11. Open a request detail.
12. Contact/status/qualification actions still render and work as appropriate.
13. Conversion flow remains accessible.
14. Sidebar request badge remains correct.
15. Direct reload of `/admin/demandes` works.
16. No console/module-resolution errors.

Only Fred validation moves FE-ARCH-03 to Terminé.

## Documentation/state

Before Fred validation:
- report IMPLEMENTED / awaiting validation;
- do not add validated changelog entry.

After Fred validation:
- update architecture status;
- update changelog;
- close Notion task;
- choose next bounded slice.

## Out of scope

Do NOT:
- migrate catalogue again;
- migrate customers/privacy/subscriptions;
- migrate generic shared UI;
- redesign request screens;
- change business logic;
- start Sprint 9.

## Expected report

Return:
1. base commit;
2. files moved/renamed;
3. files created;
4. router/page changes;
5. HTTP migration;
6. query-key/hook migration;
7. imports updated outside Requests;
8. old-path removal proof;
9. remaining layering debt;
10. checks/results;
11. behavior deviations;
12. Fred browser checklist.

Stop after FE-ARCH-03 implementation.

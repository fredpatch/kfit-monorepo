# FE-ARCH-01c - Router extraction from App.tsx

Role: frontend architecture refactor implementer.

Do NOT re-plan the architecture. The target architecture is already approved in `docs/frontend-architecture.md`.

Base: current `main` after FE-ARCH-01b validation.

## Goal

Extract application route composition from `packages/client/src/app/App.tsx` into `packages/client/src/app/router/` while preserving all current URLs, lazy-loading boundaries, guards, redirects and runtime behavior.

This slice is architecture-only.

## Current problem

`App.tsx` currently owns:
- BrowserRouter;
- all public route declarations;
- all admin route declarations;
- all lazy page imports;
- admin auth composition;
- superadmin route guard;
- DEV-only UI gallery route;
- legacy redirects;
- global fallback redirect.

That makes `App.tsx` the registry for every feature.

## Target structure for this slice

Create:

```text
packages/client/src/app/router/
├── AppRouter.tsx
├── public-routes.tsx
├── admin-routes.tsx
└── legacy-routes.tsx
```

Keep existing for now:

```text
packages/client/src/app/routes/client-profile.tsx
packages/client/src/app/routes/subscription-routes.tsx
```

Those files are route-level/page debt, but moving them belongs to FE-ARCH-01d, not this slice.

## Locked decisions

1. `App.tsx` becomes thin application wiring.
2. `AppRouter.tsx` owns `BrowserRouter` + top-level `Routes`.
3. `public-routes.tsx` owns current public route elements and their lazy imports.
4. `admin-routes.tsx` owns:
   - `/admin`;
   - `AuthProvider`;
   - `AuthGate`;
   - `AdminLayout`;
   - admin lazy imports;
   - admin child routes;
   - superadmin-only route wrapper;
   - admin not-found fallback.
5. `legacy-routes.tsx` owns current compatibility redirects only.
6. DEV-only `/__ui` remains available only when `import.meta.env.DEV`.
7. Preserve current lazy loading. Do not eagerly import feature screens that are lazy today.
8. Preserve current `Suspense` behavior:
   - public lazy routes still render with the same null fallback unless a behavior-preserving equivalent is used;
   - admin child lazy routes still rely on `AdminLayout`'s existing `Suspense` fallback.
9. Preserve every current route path exactly.
10. Preserve every current redirect target exactly.
11. Preserve the existing comment/invariant that admin UI URLs must not use API-proxied prefixes.
12. Do not move feature components in this slice.
13. Do not move `AdminLayout`, `AuthGate`, `nav-config`, `client-profile.tsx` or `subscription-routes.tsx`.
14. Do not change API clients, query keys, business rules, UI wording or CSS.
15. No dependency changes.

## Required route inventory

Public routes to preserve:

```text
/                               -> PublicCataloguePage
/demande/:offre                 -> PublicRequestPage
/appointment                    -> PublicAppointmentPage
/document/:token                -> PublicDocumentPage
/devis/:token                   -> PublicQuotePage
/recu/:token                    -> PublicReceiptPage
/justificatif/:token            -> PublicPaymentProofPage
/consent                        -> PublicConsentPage
/questionnaire                  -> PublicQuestionnairePage
/__ui                           -> UiGallery (DEV only)
```

Admin routes to preserve:

```text
/admin                           -> TodayPage
/admin/suivis                    -> AdminPage + AdminFollowUpQueuePage
/admin/demandes                  -> RequestsPage
/admin/clients                   -> ClientsPage
/admin/clients/:id               -> ClientProfilePage
/admin/abonnements/:id           -> SubscriptionRoute
/admin/abonnements/:id/preparation -> SubscriptionPreparationRoute
/admin/offres                    -> CataloguePage
/admin/questionnaires            -> QuestionnairesPage
/admin/consentements             -> ConsentTextsPage
/admin/reglages                  -> NotificationSettingsPage
/admin/supervision               -> SupervisionRoute (superadmin only)
```

Legacy admin routes to preserve:

```text
/admin/follow-up-queue
  -> /admin/suivis

/admin/subscription/:id
  -> LegacySubscriptionRedirect section="lifecycle"

/admin/onboarding/:id
  -> LegacySubscriptionRedirect section="preparation"
```

Fallback behavior to preserve:

```text
/admin/* -> AdminNotFound
*        -> Navigate replace to="/"
```

## Suggested responsibilities

### App.tsx

Should end close to:

```tsx
export function App() {
  return <AppRouter />;
}
```

No feature imports.

### AppRouter.tsx

Own:
- BrowserRouter;
- top-level Routes;
- composition of public route group;
- admin route group;
- global fallback.

Do not import every feature screen here if route modules can own them.

### public-routes.tsx

Own:
- lazy imports for public screens;
- public route elements;
- DEV-only UiGallery route.

A small helper for `<Suspense fallback={null}>` is allowed if it reduces repetition and does not alter behavior.

### admin-routes.tsx

Own:
- lazy imports for admin screens;
- AdminRoot;
- SupervisionRoute;
- admin child route declarations;
- `AdminPage` wrapper for Suivis;
- `AdminNotFound`.

The server remains the authority for authorization. The superadmin UI guard stays as defense-in-depth.

### legacy-routes.tsx

Own only compatibility route declarations/elements.

Do not add new legacy routes.

## Import discipline

Follow target dependency direction:

```text
app/router
→ app/layout + app/guards/auth composition
→ existing feature modules
```

For this transitional slice, imports from current top-level feature folders are expected.

Do NOT prematurely create `features/` or `pages/` moves in this slice.

## Static review checklist

Before running commands, inspect the diff and verify:

1. `App.tsx` has no feature-screen imports.
2. Every route from the inventory exists exactly once.
3. No path spelling changes.
4. No redirect target changes.
5. No lazy screen became eager.
6. `/__ui` is still production-dead.
7. `SupervisionRoute` still checks `hasRole(user, "superadmin")`.
8. `AuthProvider -> AuthGate -> AdminLayout` nesting is unchanged.
9. Admin wildcard remains inside the `/admin` branch.
10. Global wildcard still redirects to `/`.

## Local checks

Run:

```bash
npm run format
npm run lint:dashes
npm run typecheck --workspace @kfit/client
npm run build --workspace @kfit/client
```

Do not run server/project commands beyond these client/static checks unless a failure requires diagnosis.

## Fred manual validation

After implementation, Fred will validate:

### Public
- `/`
- one `/demande/:offre`
- `/questionnaire`
- `/consent`
- one token-based public route if test data is available

### Admin
- `/admin`
- `/admin/clients`
- one `/admin/clients/:id`
- `/admin/demandes`
- `/admin/offres`
- `/admin/questionnaires`
- `/admin/reglages`

### Redirects
- `/admin/follow-up-queue`
- one legacy subscription URL if test data is available

### Role guard
- `/admin/supervision` still works for superadmin
- non-superadmin still gets admin not-found behavior

### Navigation
- desktop sidebar
- mobile bottom navigation
- reload on a nested admin URL

## Definition of done

FE-ARCH-01c is implemented when:

- router modules exist under `app/router/`;
- `App.tsx` is thin;
- route behavior is unchanged;
- all static checks are green;
- implementation report contains no unrelated change.

FE-ARCH-01c is validated only after Fred confirms the manual route smoke test.

## Out of scope

Do NOT:

- move route screens into `pages/`;
- move domains into `features/`;
- migrate query hooks;
- migrate more API clients;
- change `client-profile.tsx`;
- change subscription redirect logic;
- change auth flow;
- change nav structure;
- change route names;
- change UI;
- touch server/shared business logic.

## Expected implementation report

Return:

1. base commit;
2. files created;
3. files changed;
4. final route inventory;
5. lazy-loading preservation notes;
6. auth/role guard preservation notes;
7. legacy redirect preservation notes;
8. exact checks run and results;
9. any deviations;
10. exact Fred manual smoke-test checklist.

Stop after FE-ARCH-01c.

# K'FIT Frontend Architecture

> Status: target architecture approved by Fred on 2026-11-02.
> Migration strategy: progressive. Do not perform a big-bang move.

## Why this exists

The frontend was built incrementally across many AI-assisted slices. The code works, but locating the right file manually has become harder than it should be.

This architecture has two goals:

1. Fred must be able to find and change frontend code without asking an AI where it lives.
2. New work must have an obvious owner and destination.

The current domain-first code is the foundation. We are reorganizing it, not replacing it.

## Target layers

```text
packages/client/src/
├── app/
│   ├── providers/
│   ├── router/
│   ├── layout/
│   └── guards/
├── pages/
│   ├── admin/
│   └── public/
├── features/
├── shared/
│   ├── api/
│   ├── ui/
│   ├── charts/
│   ├── data-table/
│   ├── lib/
│   └── config/
└── dev/
```

There are four production layers only:

```text
app
pages
features
shared
```

## Layer ownership

### app

Application wiring only.

Owns:

- providers;
- router composition;
- authentication/role guards;
- application layouts;
- React Query client setup.

Must not own domain-specific business UI.

Examples:

```text
app/providers/AppProviders.tsx
app/router/AppRouter.tsx
app/router/admin-routes.tsx
app/router/public-routes.tsx
app/layout/AdminLayout.tsx
app/guards/
```

### pages

Route-level composition only.

A page represents one browser URL/screen and composes feature components.

A page may:

- read route params/search params;
- define the screen layout;
- compose feature blocks;
- coordinate high-level page navigation.

A page should not:

- contain Axios transport setup;
- define business rules;
- own reusable domain logic;
- duplicate query keys.

Example:

```text
pages/admin/dashboard/DashboardPage.tsx
pages/admin/catalogue/CataloguePage.tsx
pages/public/questionnaire/PublicQuestionnairePage.tsx
```

### features

K'FIT domain capabilities.

Examples:

```text
features/catalogue/
features/customers/
features/requests/
features/questionnaires/
features/notifications/
features/subscriptions/
features/finance/
```

A feature may contain:

```text
feature/
├── api/
├── components/
├── hooks/
├── queries/
├── lib/
└── index.ts
```

Only create folders that are actually needed.

Feature ownership rule:

> If code understands a questionnaire, customer, request, payment, subscription, offer, appointment, notification or another K'FIT domain concept, it belongs to a feature.

### shared

Reusable frontend infrastructure with no K'FIT feature ownership.

Examples:

```text
shared/api/http-client.ts
shared/ui/button.tsx
shared/charts/
shared/data-table/
shared/lib/format.ts
shared/lib/focus.ts
shared/config/
```

Shared code must not know what a customer, subscription, questionnaire or request means.

## Dependency direction

Preferred dependency direction:

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

Rules:

- shared must not import pages or features;
- features must not import pages;
- pages may compose multiple features;
- app wires pages/routes/providers;
- cross-feature imports should be rare and explicit;
- business contracts remain in `@kfit/shared`.

## Server state architecture

Reuse the validated "Frontend Query and Mutation Architecture" pattern:

```text
API client
→ query/mutation hooks
→ page or feature components
```

### API client responsibility

Feature API clients own:

- endpoint calls;
- request serialization;
- response contracts.

Shared HTTP infrastructure owns:

- Axios instance;
- credentials;
- CSRF transport;
- common headers;
- generic transport failure parsing.

Do not repeat Axios/CSRF plumbing in every feature.

### Query responsibility

Each feature owns stable query keys.

Example:

```text
dashboardKeys.all
dashboardKeys.today()
dashboardKeys.analytics(period)

customerKeys.all
customerKeys.list(filters)
customerKeys.detail(id)
```

Hooks own:

- cache identity;
- query lifecycle;
- mutation invalidation;
- stale-time decisions where feature-specific.

Components should not invent ad-hoc query keys.

## Route architecture

`App.tsx` must become stable application wiring rather than the registry for every screen.

Target:

```text
app/router/
├── AppRouter.tsx
├── admin-routes.tsx
├── public-routes.tsx
└── legacy-routes.tsx
```

Route wrappers live in `pages/`.

Feature components should not need to know the full application route tree.

## Public vs admin surfaces

Public and admin route components must be visibly separated.

Example:

```text
pages/admin/questionnaires/QuestionnairesPage.tsx
pages/public/questionnaire/PublicQuestionnairePage.tsx
```

They can reuse the same feature:

```text
features/questionnaires/
```

This avoids mixing public flows, admin editors and route composition in one flat feature folder.

## Manual code-finding guide

When you want to change something manually, start here.

### "I want to change a whole screen"

Look in:

```text
pages/admin/<screen>/
pages/public/<screen>/
```

Examples:

- Dashboard layout -> `pages/admin/dashboard/`
- Catalogue screen layout -> `pages/admin/catalogue/`
- Public questionnaire page -> `pages/public/questionnaire/`

### "I want to change how one domain feature behaves in the UI"

Look in:

```text
features/<domain>/
```

Examples:

- questionnaire editor -> `features/questionnaires/`
- request actions -> `features/requests/`
- notification panel -> `features/notifications/`
- catalogue offer editor -> `features/catalogue/`

### "I want to change an API call"

Look in:

```text
features/<domain>/api/
```

### "I want to change fetching/cache invalidation"

Look in:

```text
features/<domain>/queries/
features/<domain>/hooks/
```

### "I want to change a generic button/input/dialog"

Look in:

```text
shared/ui/
```

### "I want to change a generic chart/table"

Look in:

```text
shared/charts/
shared/data-table/
```

### "I want to change routing/navigation/auth guards"

Look in:

```text
app/router/
app/layout/
app/guards/
```

### "I want to change formatting/focus/generic helpers"

Look in:

```text
shared/lib/
```

If a helper contains K'FIT domain vocabulary, it probably belongs in a feature instead.

## Naming rules

Use clear ownership in filenames.

Preferred:

```text
CustomerProfilePage.tsx
CustomerHeader.tsx
useCustomerDetail.ts
customer-queries.ts
customers-api.ts
```

Avoid vague names such as:

```text
helpers.ts
common.ts
misc.ts
data.ts
utils2.ts
```

Generic `utils.ts` should stay very small.

## Barrel exports

Feature `index.ts` files are allowed only as intentional public APIs.

Do not export every internal file automatically.

A feature barrel should make ownership clearer, not hide where code lives.

## Migration strategy

Never move the whole frontend at once.

Migration order:

1. FE-ARCH-01a - architecture rules and code map.
2. FE-ARCH-01b - shared HTTP transport foundation.
3. FE-ARCH-01c - router extraction from `App.tsx`.
4. FE-ARCH-01d - introduce `pages/` and migrate one route as the reference pattern.
5. FE-ARCH-01e - introduce feature query-key/query-hook convention using one feature as reference.
6. Migrate remaining modules only when touched by UAT fixes or later work.
7. Remove old top-level feature locations only after their imports are fully migrated.

Each slice must be independently testable and leave the app working.

## Reference migration rule

Before migrating a module:

1. identify the current owner;
2. identify its target layer;
3. move only one coherent capability;
4. update imports;
5. do not change business behavior in the same patch;
6. run format/typecheck/build;
7. Fred performs browser validation;
8. only then migrate the next capability.

Refactor commits must not contain unrelated feature changes.

## Current tree mapping

Current top-level domain folders such as:

```text
appointments/
auth/
catalogue/
consents/
customers/
dashboard/
notifications/
questionnaires/
requests/
subscriptions/
```

map naturally to:

```text
features/<same-domain>/
```

Current:

```text
components/ui/
components/charts/
components/data-table/
components/public/
```

will progressively map to:

```text
shared/ui/
shared/charts/
shared/data-table/
shared/public/   # only if truly domain-neutral
```

Current `app/layout/` already belongs in the target `app/` layer.

Current `App.tsx` is the main routing debt to split later.

## What we deliberately do not add

Do not introduce architecture ceremony that K'FIT does not need.

No automatic addition of:

- Redux;
- Zustand global state;
- repository classes;
- frontend use-case classes;
- entity layers;
- server-style Service/Controller/Route mirrors;
- full Feature-Sliced Design layers.

TanStack Query remains the server-state owner.

Local React state remains the default for local UI state.

## Migration status

- FE-ARCH-01a: architecture rules and manual code map - approved by Fred.
- FE-ARCH-01b: shared HTTP transport foundation - validated by Fred.
  - canonical transport: `shared/api/http-client.ts`;
  - compatibility re-export: `auth/api/csrf.ts`;
  - reference read client migrated: dashboard;
  - reference authenticated mutation client migrated: notifications.
- FE-ARCH-01c: router extraction - validated by Fred.
- FE-ARCH-01d: first pages/ reference migration (/admin/offres) - validated by Fred.
- FE-ARCH-01e: catalogue query keys + query hooks reference pattern - validated by Fred.

Reference foundation is complete. Remaining domains migrate progressively; no big-bang migration.

- FE-ARCH-02: catalogue feature migration - validated by Fred.
  - catalogue now lives under `features/catalogue/`;
  - admin and public catalogue routes compose through `pages/`;
  - public catalogue implementation is `PublicCatalogueView`;
  - catalogue transport uses `shared/api/http-client.ts`;
  - old top-level `src/catalogue/` removed;
  - validated implementation commit: `da91b4f`;
  - known remaining debt: `CatalogueWorkspace` still imports `app/layout/AdminPage` and will be addressed separately.

## Definition of done for the architecture initiative

FE-ARCH-01 is complete when:

- every frontend file has an obvious layer/owner;
- route composition is no longer centralized in one large `App.tsx`;
- shared HTTP transport is centralized;
- major features have stable query keys/hooks;
- pages compose features instead of owning transport/business logic;
- Fred can locate a screen, API call, query hook and reusable UI primitive from this document without AI assistance;
- migrations were progressive and behavior-preserving.

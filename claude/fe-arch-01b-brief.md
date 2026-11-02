# FE-ARCH-01b - Shared HTTP transport foundation

Role: architecture refactor only. Do not re-plan K'FIT business behavior.

Base: main after FE-ARCH-01a.

## Goal

Create the canonical frontend HTTP transport boundary without moving feature UI files.

## Locked decisions

1. Shared transport lives under `packages/client/src/shared/api/`.
2. It owns Axios defaults, credentials and CSRF injection.
3. It owns generic extraction of API error payloads.
4. It may depend on `@kfit/shared`, but not on feature folders.
5. `auth/api/csrf.ts` remains temporarily as a compatibility re-export.
6. Migrate only two reference clients in this slice:
   - dashboard: read-heavy;
   - notifications: authenticated mutations + CSRF.
7. No endpoint, payload, error wording, cache key or business behavior change.
8. No route/UI move in FE-ARCH-01b.
9. Other API clients migrate later when touched.
10. No new dependency.

## Acceptance

- dashboard uses shared HTTP singleton;
- notifications uses shared HTTP singleton;
- notifications mutations still receive CSRF automatically;
- feature error mapping uses shared generic error extraction;
- existing auth/csrf imports elsewhere remain valid through compatibility re-export;
- typecheck + build green locally;
- dashboard and notification center/settings smoke check green.

## Out of scope

- auth API migration;
- catalogue/request/customer/etc. API migration;
- router extraction;
- pages/features directory moves;
- query-hook migration.

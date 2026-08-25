# Session Context

> Date: 2026-08-25 | Slice: Deferred auth — password reset/recovery

## Where we left off

Sprint 1 auth foundation is complete and locally validated. The post-closure deferred auth slice for password reset/recovery HTTP flow is now also complete and locally validated, including the real SMTP/Mailpit HTTP/email preflight. Sponsor/Konny scope validation is still pending, so Sprint 2 remains unopened.

## Pattern source

The reusable implementation patterns for this Sprint 1 continuation were clarified as Notion pages, not a local Markdown folder. Relevant Notion sources inspected for Sprint 1 include:

- K'FIT dashboard/project board
- K'FIT pattern reference
- Administrative Foundation
- Cookie JWT Authentication
- OTP activation/fresh-OTP patterns
- CSRF-related cookie-auth guidance
- Audit Event pattern

## Validated Sprint 1 work

The project owner locally validated the auth schema/primitives slice:

- `npm run typecheck`
- `npm run db:check`
- `npm run build --workspace @kfit/server`
- `node --test packages/server/dist/modules/auth/auth-foundation.test.js`
- `npm run db:migrate` including repeat/no-op behavior
- PostgreSQL `\d` inspection for auth/session/OTP/trusted-device/audit tables

## State of the codebase

- Auth schema adaptation is implemented and locally validated.
- Pure auth config/crypto/session policy primitives are implemented and locally validated.
- AuditService foundation is implemented and locally validated.
- Session/token service foundation is implemented and locally validated.
- OTP challenge service foundation is implemented and locally validated.
- Drizzle auth repository adapters are implemented and locally validated.
- Server auth controllers/routes/middleware foundation is implemented and locally validated.
- Auth module folder structure has been refactored and locally validated.
- Shared auth contracts have been implemented in `@kfit/shared` and locally validated.
- Express app/router binding has been implemented and locally validated.
- Client auth foundation for session restoration and login flows has been implemented and locally validated; the Vite app launches.
- JWT/cookie session resolution plus login/logout/refresh route behavior has been implemented and locally validated.
- Bootstrap/password hashing policy has been implemented and locally validated.
- Staging-style cookie/CSRF/session validation behind Nginx has been implemented and locally validated.
- Sprint 1 closure review is complete: auth foundation is closed.
- Deferred password reset/recovery HTTP flow is complete and locally validated:
  - shared/server builds
  - shared contracts
  - service/controller/Express tests
  - PostgreSQL hard-commit integration
  - `db:check`
  - real SMTP/Mailpit HTTP/email preflight via `npm run preflight:auth-recovery`
- Sprint 2 remains unopened while sponsor scope validation is pending.

## Active constraints

- Do not run local project commands from ChatGPT/Codex runtime.
- Only mark validation after the project owner provides successful local output.
- Sponsor scope validation remains open.
- Legal validation is required before production.
- Keep native PostgreSQL on host 5432 and K'FIT Docker PostgreSQL on host 5433 unless explicitly changed.

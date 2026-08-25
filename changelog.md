# K'FIT Changelog

> Only locally validated changes are recorded here.

## 2026-08-25 — Sprint 1 post-closure auth recovery

- Validated the deferred password reset/recovery HTTP flow end-to-end.
- Confirmed shared/server builds, shared contracts, service/controller/Express tests, PostgreSQL hard-commit integration and `db:check`.
- Confirmed real SMTP/Mailpit HTTP/email preflight via `npm run preflight:auth-recovery`.
- Confirmed neutral unknown-account response, OTP non-disclosure over HTTP, French recovery email with six-digit code, short-lived reset grant, one-shot reset replay rejection and delivery/completion audit events.

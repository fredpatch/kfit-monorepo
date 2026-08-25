# Current Task

> Slice: Deferred auth — password reset/recovery | Date: 2026-08-25 | Status: Server validated; Mailpit preflight pending

## Task

Validate the real SMTP/Mailpit recovery path on branch `sprint-1/auth-foundation`.

## Locally validated by Fred

- Shared/server typecheck and builds.
- Shared auth contracts.
- Password recovery service behavior.
- Auth controller and Express routing.
- PostgreSQL one-time reset hard commit.
- Atomic password update with session and trusted-device revocation.
- Drizzle schema consistency; no migration required.

## Current implementation

An automated `preflight:auth-recovery` command now:

1. Starts an ephemeral Express recovery app.
2. Sends a real recovery OTP through Nodemailer/SMTP.
3. Retrieves the message through the Mailpit API.
4. Verifies the OTP through the HTTP recovery endpoint.
5. Resets the password through the HTTP reset endpoint.
6. Rejects replay of the same reset grant.
7. Confirms neutral unknown-account behavior, OTP non-disclosure and audit events.

## Acceptance criteria

- [x] Shared/server typecheck and builds pass.
- [x] Shared auth contract tests pass.
- [x] Password recovery service tests pass.
- [x] Auth HTTP and Express tests pass.
- [x] PostgreSQL reset hard-commit integration passes.
- [x] Drizzle schema check passes; no migration is required.
- [x] Recovery request is neutral for unknown identities.
- [x] Reset grant can be redeemed once only.
- [x] Successful reset invalidates all sessions and trusted devices.
- [ ] Mailpit receives the real recovery OTP email.
- [ ] HTTP responses never expose the OTP.
- [ ] The emailed OTP completes verify/reset and replay rejection through HTTP.

## Constraints

- Do not mark the deferred auth task complete until Fred validates the Mailpit preflight.
- Do not open client recovery screens or Sprint 2 while this gate is pending.
- Sprint 2 remains blocked until sponsor/Konny confirms V1 Core / V1.1 scope.

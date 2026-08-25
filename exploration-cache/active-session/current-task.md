# Current Task

> Slice: Deferred auth — password reset/recovery | Date: 2026-08-25 | Status: Completed and locally validated

## Task

Implement and validate the password reset/recovery HTTP flow that was deferred from Sprint 1 closure.

## Completed implementation

The recovery slice provides:

- Neutral account-enumeration-safe recovery request responses.
- Real OTP email delivery through the auth mail delivery abstraction.
- Hash-only OTP verification.
- Short-lived signed reset grants.
- One-time reset grant redemption.
- Password policy enforcement.
- Atomic password update with session and trusted-device revocation.
- Delivery and completion audit events.
- Same-origin guard for browser recovery mutations.
- Process-local V1 rate limiting for abuse reduction.
- Automated Mailpit-backed HTTP/email preflight.

## Locally validated by Fred

- Shared/server typecheck and builds.
- Shared auth contracts.
- Password recovery service behavior.
- Auth controller and Express routing.
- PostgreSQL one-time reset hard commit.
- Atomic password update with session and trusted-device revocation.
- Drizzle schema consistency; no migration required.
- Real SMTP/Mailpit HTTP/email preflight.

## Final Mailpit preflight validation

Fred ran:

```bash
npm run preflight:auth-recovery
```

Confirmed green output:

```text
✓ unknown recovery request returns the neutral accepted response
✓ recovery request sends a real OTP email through SMTP to Mailpit
✓ HTTP responses never expose the OTP
✓ Mailpit message contains the expected French subject and six-digit code
✓ emailed OTP produces a short-lived reset grant through HTTP
✓ password reset succeeds once and replay is rejected
✓ recovery delivery and completion audit events are recorded
```

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
- [x] Mailpit receives the real recovery OTP email.
- [x] HTTP responses never expose the OTP.
- [x] The emailed OTP completes verify/reset and replay rejection through HTTP.

## Next boundary

Sprint 2 remains blocked until sponsor/Konny confirms V1 Core / V1.1 scope and consolidated business rules.

# Current Task

> Slice: Deferred auth — password reset/recovery | Date: 2026-08-25 | Status: Implemented, awaiting local validation

## Task

Validate the server-first password reset/recovery HTTP flow on branch `sprint-1/auth-foundation`.

## Implemented scope

- Neutral `POST /auth/recovery/request` response for known and unknown identities.
- Password-recovery OTP issuance through the validated OTP service.
- Nodemailer delivery adapter with French recovery message.
- `POST /auth/recovery/verify` returning a short-lived signed reset grant.
- `POST /auth/recovery/reset` enforcing password policy.
- One-time transactional grant redemption using the locked OTP challenge version.
- Atomic password update, all-session revocation and trusted-device revocation.
- Process-local request/verify/reset rate limiter for V1 (no Redis).
- Stable shared contracts and controller/Express route bindings.
- Service, controller and contract tests.

## Validation status

Implementation and static inspection only. Fred has not yet run the local validation commands, so this slice is not validated or complete.

## Acceptance criteria

- [ ] Shared/server typecheck and builds pass.
- [ ] Shared auth contract tests pass.
- [ ] Password recovery service tests pass.
- [ ] Auth HTTP and Express tests pass.
- [ ] Drizzle schema check passes; no migration is required.
- [ ] Recovery request is neutral for unknown identities.
- [ ] Valid Mailpit delivery contains the OTP and no OTP appears in HTTP responses.
- [ ] A reset grant can be redeemed once only.
- [ ] Successful reset invalidates all sessions and trusted devices.

## Constraints

- Do not start the client recovery screens before server behavior is locally validated.
- Do not start Sprint 2 while sponsor/Konny V1 Core/V1.1 validation remains pending.
- Do not mark this task validated until Fred returns green local output.

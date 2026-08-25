# Sprint 1 — Authentication Foundation Adaptation Contract

> Status: design baseline  
> Date: 2026-08-25  
> Sources: K'FIT Notion dashboard, Implementation Knowledge blueprints, current Drizzle schema  
> Implementation order: schema/domain → services → controllers/routes/middleware → shared contracts → client → tests

## 1. Scope

Sprint 1 covers the single V1 coach/admin identity:

- first-run bootstrap without default credentials;
- email/password login;
- access and refresh JWTs in secure HttpOnly cookies;
- server-backed session rotation and revocation;
- CSRF protection for cookie-authenticated mutations;
- OTP for recovery, unknown/suspicious devices and sensitive actions;
- configurable trusted-device duration;
- inactivity and absolute session limits;
- append-only security audit events.

Excluded from this slice: customer accounts, multi-coach administration, business modules, OAuth, Redis and MFA on every login.

## 2. Blueprint adaptation

| Reference | Reused guarantee | K'FIT adaptation |
| --- | --- | --- |
| Administrative Foundation | atomic one-time bootstrap, no default credentials, audit | one privileged coach/admin in V1; future-role-ready schema |
| Cookie JWT Authentication | short access lifetime, refresh rotation/revocation, stable errors, /me restoration | refresh tokens are bound to a DB session and token family |
| OTP Account Activation / First-Login OTP | cryptographic code, digest only, expiry, attempt limit, single use, resend invalidation | purposes include recovery, suspicious-device login and sensitive actions |
| Audit Event System | append-only actor/action/target/outcome/correlation envelope | authentication failures may have no authenticated actor |
| Domain Error Taxonomy | stable machine-readable error codes | French UI messages map from shared codes; API does not expose account existence |

## 3. Existing schema assessment

### Already aligned

- `users`: identity, password digest, status and future-role-ready role.
- `auth_sessions`: refresh digest, token family, expiry, revocation, last activity and request fingerprints.
- `trusted_devices`: digest-only device identifier, expiry and revocation.
- `otp_challenges`: purpose, digest, expiry, attempts and consumption.
- `audit_events`: append-only event envelope foundation.
- OTP pre-flight already proves secure generation, digesting, expiry, single use, lockout and resend replacement behavior.

### Required schema refinements before auth services

1. Normalize email uniqueness using a canonical lowercase value.
2. Add `auth_sessions.absolute_expires_at`; `expires_at` alone must not ambiguously represent both refresh and absolute lifetime.
3. Add refresh-token rotation lineage/reuse evidence:
   - current token digest remains unique;
   - rotation counter or last-rotated timestamp;
   - reuse detection revokes the whole token family.
4. Make `last_seen_at` non-null from issuance so inactivity checks are deterministic.
5. Add trusted-device uniqueness for active identity: user + fingerprint digest.
6. Track trusted-device `last_used_at` and optional human-readable label without storing raw fingerprint material.
7. Add OTP invalidation/supersession evidence so resend atomically invalidates every prior active challenge for the same user/purpose.
8. Add OTP verification context for fresh-OTP authorization:
   - verified/consumed timestamp;
   - bound user, session and purpose;
   - freshness is derived server-side and never asserted by the client.
9. Add audit correlation/request identifier and safe request context fields needed by the audit blueprint.
10. Represent bootstrap closure with a database-backed singleton/setting guarded by a transaction or lock.

Any migration must preserve the initial Sprint 0 migration and be generated as a new migration.

## 4. Authoritative invariants

### Identity and password

- Email is trimmed and canonicalized before lookup and uniqueness enforcement.
- Passwords are stored only as an approved adaptive password digest.
- Archived users cannot authenticate.
- Locked users receive the same public login response shape as other rejected credentials where enumeration risk exists.
- Password change/reset revokes all sessions and trusted devices for the user.
- The server never returns password, OTP, refresh-token or device-fingerprint digests.

### Bootstrap

- Bootstrap status is public but returns only `required: boolean`.
- Bootstrap creation is atomic and succeeds once.
- No privileged user may already exist when bootstrap commits.
- Concurrent bootstrap attempts yield one success and stable `BOOTSTRAP_ALREADY_COMPLETED` failures.
- Bootstrap creates the first privileged identity, seeds required auth settings, closes bootstrap and records audit evidence in the same transaction.

### Login and suspicious device

- Password verification precedes session issuance.
- A known, active and unexpired trusted device may complete login without OTP.
- An unknown, revoked, expired or risk-flagged device requires an OTP challenge.
- The pre-OTP response does not issue an authenticated session.
- Completing suspicious-device OTP creates the session; trusting the device is an explicit user choice.
- Login, rejection, OTP requirement, OTP success and lockout are audited without secrets.

### Sessions and refresh

- Access JWTs are short-lived and contain only the minimum identity/session claims.
- Refresh JWTs are longer-lived, opaque to the client and backed by `auth_sessions`.
- Cookies are HttpOnly; production cookies are Secure; SameSite and path are explicit.
- Refresh rotates the refresh token atomically.
- Reuse of a previously rotated refresh token revokes the entire token family.
- A session is invalid when revoked, beyond inactivity timeout, beyond refresh expiry or beyond absolute lifetime.
- Server time and DB state are authoritative.
- Logout revokes the current session and clears auth cookies even when the presented token is already invalid.
- Logout-all and password reset revoke every user session.
- `GET /auth/me` never silently refreshes; the transport layer calls the explicit refresh endpoint when defined client policy permits it.

### CSRF

- All state-changing cookie-authenticated endpoints require CSRF validation.
- Login/bootstrap/OTP endpoints use explicit origin checks plus endpoint rate limits; authenticated mutations additionally require the CSRF token.
- Use a double-submit token bound to the authenticated session or an equivalent server-verifiable design.
- CSRF secrets/tokens are never persisted in local storage.
- Refresh and logout are protected according to the final cookie/path design; the decision must be covered by integration tests behind Nginx.

### OTP

- OTPs use cryptographic randomness and only a keyed digest is stored.
- Purpose is closed and server-defined: `password_recovery`, `suspicious_device_login`, `sensitive_action`.
- Challenges expire, have bounded attempts and are single-use.
- Resend atomically invalidates prior active challenges for the same user and purpose.
- Request/resend responses do not reveal whether an email exists.
- Verification increments attempts atomically and is safe under concurrent requests.
- A sensitive-action OTP proof is bound to user + current session + allowed purpose.
- Freshness is short, configurable and checked at the protected command boundary.
- One proof cannot authorize a different session, user or purpose.

### Trusted devices

- Raw fingerprints are never stored.
- Trust has a configurable maximum duration.
- Expired or revoked trust never bypasses OTP.
- Trust is revocable individually and globally.
- A password reset/change revokes all trusted devices.
- Device signals reduce friction; they are not a sole identity factor.

### Audit

- Audit records are append-only.
- Event names are stable and namespaced, e.g. `auth.login.succeeded`.
- Record actor when known, target, outcome, timestamp, correlation ID and redacted metadata.
- Never record passwords, OTPs, JWTs, cookie values or raw fingerprints.
- Critical commits store audit evidence in the same transaction when possible.
- Expected security failures are auditable without turning audit persistence into an authentication bypass.

## 5. Stable error contract

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Authentication impossible.",
    "requestId": "uuid"
  }
}
```

Initial codes:

- `BOOTSTRAP_ALREADY_COMPLETED`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_ACCOUNT_UNAVAILABLE`
- `AUTH_SESSION_REQUIRED`
- `AUTH_SESSION_EXPIRED`
- `AUTH_REFRESH_INVALID`
- `AUTH_REFRESH_REUSED`
- `AUTH_CSRF_INVALID`
- `AUTH_OTP_REQUIRED`
- `AUTH_OTP_INVALID`
- `AUTH_OTP_EXPIRED`
- `AUTH_OTP_LOCKED`
- `AUTH_FRESH_OTP_REQUIRED`
- `AUTH_RATE_LIMITED`

Public recovery and resend endpoints return neutral success responses when the target identity is unknown.

## 6. API contract baseline

| Method | Path | Authentication | CSRF | Result |
| --- | --- | --- | --- | --- |
| GET | `/api/auth/bootstrap/status` | public | no | `{ required }` |
| POST | `/api/auth/bootstrap` | public + one-time gate | origin/rate guard | first identity created |
| POST | `/api/auth/login` | public | origin/rate guard | authenticated cookies or OTP challenge |
| POST | `/api/auth/login/otp/verify` | pending challenge | origin/rate guard | authenticated cookies |
| POST | `/api/auth/refresh` | refresh cookie | required by final cookie design | rotated cookies |
| POST | `/api/auth/logout` | current session when available | yes | revoke + clear cookies |
| POST | `/api/auth/logout-all` | authenticated | yes + fresh OTP | revoke all sessions |
| GET | `/api/auth/me` | access cookie | no | current user/session summary |
| POST | `/api/auth/recovery/request` | public | origin/rate guard | neutral accepted response |
| POST | `/api/auth/recovery/verify` | recovery challenge | origin/rate guard | short-lived reset authorization |
| POST | `/api/auth/recovery/reset` | reset authorization | origin/rate guard | password changed; sessions/devices revoked |
| POST | `/api/auth/sensitive-otp/request` | authenticated | yes | challenge issued |
| POST | `/api/auth/sensitive-otp/verify` | authenticated | yes | session-bound fresh proof |
| GET | `/api/auth/sessions` | authenticated | no | redacted active sessions |
| DELETE | `/api/auth/sessions/:sessionId` | authenticated | yes + fresh OTP for other session | revoke session |
| GET | `/api/auth/trusted-devices` | authenticated | no | redacted devices |
| DELETE | `/api/auth/trusted-devices/:deviceId` | authenticated | yes + fresh OTP | revoke device |

Exact DTOs will live in `packages/shared` and be validated with Zod at the server boundary.

## 7. Service boundaries

- `BootstrapService`: status and atomic initialization.
- `PasswordService`: digest policy and verification.
- `OtpService`: issue, resend, verify and fresh-proof evaluation.
- `SessionService`: issue, rotate, authenticate, revoke and inactivity/absolute checks.
- `TrustedDeviceService`: evaluate, create, list and revoke trust.
- `AuthService`: orchestrate login, recovery and logout commands.
- `AuditService`: redacted append-only event writes.
- `CsrfService`: issue and verify session-bound CSRF material.

Controllers translate HTTP input/output only; they do not own security rules or transactions.

## 8. Minimum test matrix before client work

- bootstrap succeeds once and is concurrency-safe;
- valid/invalid/locked/archived login;
- unknown device requires OTP and issues no session beforehand;
- trusted device bypasses OTP only while active;
- OTP expiry, single use, resend invalidation, attempt lockout and concurrent verification;
- access expiry with valid refresh rotation;
- refresh replay revokes token family;
- inactivity and absolute session expiration;
- logout, logout-all and password-reset revocation;
- CSRF rejection on every protected mutation;
- fresh OTP bound to correct user/session/purpose and expiry;
- audit redaction and transactional evidence;
- cookie behavior through staging-style Nginx.

## 9. Open implementation decisions

These must be finalized in typed configuration before code:

- access, refresh, inactivity and absolute lifetimes;
- trusted-device duration;
- OTP TTL, resend cooldown, attempt limit and fresh-proof window;
- password policy and hashing parameters;
- cookie names, paths and SameSite behavior;
- request-rate thresholds;
- risk signals that force suspicious-device OTP.

Defaults may be proposed in the implementation plan but remain explicit configuration, never hidden constants.

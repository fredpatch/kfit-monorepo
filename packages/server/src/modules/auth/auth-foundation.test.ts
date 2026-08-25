import assert from "node:assert/strict";
import test from "node:test";
import { loadAuthConfig } from "./auth.config.js";
import { digestOtp, generateOtp, verifyOtpDigest } from "./otp.crypto.js";
import { isFreshOtp, sessionInvalidReason } from "./session.policy.js";

const pepper = "a-secure-test-pepper-that-is-longer-than-32-characters";

test("OTP generation and digest verification never persist the raw code", () => {
  const code = generateOtp();
  const digest = digestOtp(code, pepper);
  assert.match(code, /^\d{6}$/);
  assert.notEqual(code, digest);
  assert.equal(verifyOtpDigest(code, digest, pepper), true);
  assert.equal(verifyOtpDigest("999999", digest, pepper), false);
});

test("session policy enforces inactivity and absolute expiry independently", () => {
  const now = new Date("2026-08-25T08:00:00Z");
  const base = {
    expiresAt: new Date("2026-08-26T08:00:00Z"),
    absoluteExpiresAt: new Date("2026-08-25T20:00:00Z"),
    lastSeenAt: new Date("2026-08-25T07:45:00Z"),
    revokedAt: null,
    compromisedAt: null,
  };
  assert.equal(sessionInvalidReason(base, now, 30 * 60_000), null);
  assert.equal(sessionInvalidReason({ ...base, lastSeenAt: new Date("2026-08-25T07:30:00Z") }, now, 30 * 60_000), "inactive");
  assert.equal(sessionInvalidReason({ ...base, absoluteExpiresAt: now }, now, 30 * 60_000), "absolute_expired");
});

test("fresh OTP cannot be future-dated or older than its configured window", () => {
  const now = new Date("2026-08-25T08:00:00Z");
  assert.equal(isFreshOtp(new Date("2026-08-25T07:55:00Z"), now, 10 * 60_000), true);
  assert.equal(isFreshOtp(new Date("2026-08-25T07:49:59Z"), now, 10 * 60_000), false);
  assert.equal(isFreshOtp(new Date("2026-08-25T08:00:01Z"), now, 10 * 60_000), false);
});

test("typed auth configuration rejects missing secrets and invalid lifetime ordering", () => {
  assert.throws(() => loadAuthConfig({}), /AUTH_OTP_PEPPER/);
  assert.throws(() => loadAuthConfig({ AUTH_OTP_PEPPER: pepper, AUTH_ACCESS_TOKEN_TTL_MS: "100", AUTH_REFRESH_TOKEN_TTL_MS: "50" }), /shorter/);
  assert.equal(loadAuthConfig({ AUTH_OTP_PEPPER: pepper }).otpMaxAttempts, 5);
});

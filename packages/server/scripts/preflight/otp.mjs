import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import assert from "node:assert/strict";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOtp(otp, secret) {
  return createHmac("sha256", secret).update(otp).digest("hex");
}

function safeEqualHex(left, right) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function issueChallenge(now = Date.now()) {
  const secret = randomBytes(32).toString("hex");
  const otp = generateOtp();
  return {
    otp,
    secret,
    stored: {
      otpHash: hashOtp(otp, secret),
      expiresAt: now + OTP_TTL_MS,
      attemptCount: 0,
      maxAttempts: MAX_ATTEMPTS,
      consumedAt: null,
      version: randomBytes(8).toString("hex"),
    },
  };
}

function verifyChallenge(challenge, candidate, now = Date.now()) {
  if (challenge.consumedAt) return { ok: false, reason: "consumed" };
  if (challenge.attemptCount >= challenge.maxAttempts) return { ok: false, reason: "locked" };
  if (now > challenge.expiresAt) return { ok: false, reason: "expired" };

  challenge.attemptCount += 1;
  const candidateHash = hashOtp(candidate, challenge.secret);
  const ok = safeEqualHex(candidateHash, challenge.otpHash);

  if (!ok) {
    return {
      ok: false,
      reason: challenge.attemptCount >= challenge.maxAttempts ? "locked" : "invalid",
    };
  }

  challenge.consumedAt = now;
  return { ok: true, reason: "verified" };
}

function storedView(issued) {
  return { ...issued.stored, secret: issued.secret };
}

console.log("K'FIT OTP pre-flight\n");

const first = issueChallenge();
assert.match(first.otp, /^\d{6}$/);
assert.notEqual(first.stored.otpHash, first.otp);
assert.equal(first.stored.otpHash.length, 64);
console.log("✓ cryptographically generated 6-digit OTP; only hash is persisted");

const validChallenge = storedView(first);
assert.deepEqual(verifyChallenge(validChallenge, first.otp), { ok: true, reason: "verified" });
assert.equal(verifyChallenge(validChallenge, first.otp).reason, "consumed");
console.log("✓ correct OTP verifies once and becomes single-use");

const expired = issueChallenge(1_000);
assert.equal(verifyChallenge(storedView(expired), expired.otp, 1_000 + OTP_TTL_MS + 1).reason, "expired");
console.log("✓ expired OTP is rejected");

const attempts = issueChallenge();
const attemptsChallenge = storedView(attempts);
for (let index = 0; index < MAX_ATTEMPTS - 1; index += 1) {
  assert.equal(verifyChallenge(attemptsChallenge, "999999").reason, "invalid");
}
assert.equal(verifyChallenge(attemptsChallenge, "999999").reason, "locked");
assert.equal(verifyChallenge(attemptsChallenge, attempts.otp).reason, "locked");
console.log(`✓ challenge locks after ${MAX_ATTEMPTS} failed attempts`);

const beforeResend = issueChallenge();
const afterResend = issueChallenge();
assert.notEqual(beforeResend.stored.version, afterResend.stored.version);
assert.notEqual(beforeResend.stored.otpHash, afterResend.stored.otpHash);
const activeAfterResend = storedView(afterResend);
assert.notEqual(hashOtp(beforeResend.otp, activeAfterResend.secret), activeAfterResend.otpHash);
assert.deepEqual(verifyChallenge(activeAfterResend, afterResend.otp), { ok: true, reason: "verified" });
console.log("✓ resend replaces the active challenge and invalidates the previous OTP");

console.log("\nOTP pre-flight PASSED");

import assert from "node:assert/strict";
import test from "node:test";
import { PasswordService } from "../services/password.service.js";
import {
  InMemoryRecoveryRateLimiter,
  PasswordRecoveryService,
  type PasswordRecoveryRepository,
} from "../services/password-recovery.service.js";
import type { AuthUserRecord } from "../services/auth-route.service.js";
import type { OtpChallengeRecord } from "../services/otp-challenge.service.js";

const now = new Date("2026-08-25T14:00:00.000Z");
const user: AuthUserRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "coach@kfit.local",
  passwordHash: "old-hash",
  status: "active",
  role: "coach",
};

function challenge(consumedAt: Date | null): OtpChallengeRecord {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    userId: user.id,
    sessionId: null,
    purpose: "password_recovery",
    codeHash: "hash-only",
    expiresAt: new Date("2026-08-25T14:05:00.000Z"),
    attemptCount: 0,
    maxAttempts: 5,
    consumedAt,
    supersededAt: null,
    deliveryChannel: "email",
    createdAt: now,
    updatedAt: consumedAt ?? now,
  };
}

function createHarness(existingUser: AuthUserRecord | null = user) {
  const sent: Array<{ to: string; code: string }> = [];
  const completed: Array<{ userId: string; challengeId: string; verifiedAt: string; passwordHash: string }> = [];
  const repository: PasswordRecoveryRepository = {
    async findByEmail() { return existingUser; },
    async completeReset(input) {
      completed.push(input);
      return completed.length === 1;
    },
  };
  const service = new PasswordRecoveryService(
    repository,
    {
      async issue() {
        return { challenge: challenge(null), code: "123456" };
      },
      async verify(code) {
        return code === "123456"
          ? { status: "verified", challenge: challenge(now) }
          : { status: "rejected", reason: "invalid", challenge: challenge(null) };
      },
    },
    new PasswordService(),
    {
      async sendPasswordRecoveryCode(input) {
        sent.push({ to: input.to, code: input.code });
      },
    },
    { async record() { return {}; } },
    new InMemoryRecoveryRateLimiter({ windowMs: 60_000, requestMax: 5, verifyMax: 5, resetMax: 5 }),
    {
      recoveryTokenSecret: "recovery-secret-that-is-at-least-32-characters",
      recoveryGrantTtlMs: 10 * 60_000,
    },
  );
  return { service, sent, completed };
}

test("recovery request is neutral for unknown identities and delivers only for an active user", async () => {
  const unknown = createHarness(null);
  assert.deepEqual(await unknown.service.request("missing@kfit.local", { now }), { status: "accepted" });
  assert.equal(unknown.sent.length, 0);

  const known = createHarness();
  assert.deepEqual(await known.service.request(" Coach@KFIT.Local ", { now }), { status: "accepted" });
  assert.deepEqual(known.sent, [{ to: "coach@kfit.local", code: "123456" }]);
});

test("verified OTP creates a short-lived grant and reset redeems it once", async () => {
  const { service, completed } = createHarness();
  const verified = await service.verify("coach@kfit.local", "123456", { now });
  assert.equal(verified.status, "verified");
  if (verified.status !== "verified") throw new Error("Expected recovery grant");

  assert.deepEqual(await service.reset(verified.resetToken, "CorrectHorse10", { now }), { status: "reset" });
  assert.equal(completed.length, 1);
  assert.equal(completed[0]?.userId, user.id);
  assert.notEqual(completed[0]?.passwordHash, "CorrectHorse10");

  assert.deepEqual(await service.reset(verified.resetToken, "CorrectHorse10", { now }), { status: "invalid_grant" });
});

test("recovery rejects invalid codes, weak passwords and expired grants", async () => {
  const { service } = createHarness();
  assert.equal((await service.verify("coach@kfit.local", "000000", { now })).status, "rejected");

  const verified = await service.verify("coach@kfit.local", "123456", { now });
  if (verified.status !== "verified") throw new Error("Expected recovery grant");
  assert.deepEqual(
    await service.reset(verified.resetToken, "short", { now }),
    { status: "invalid_password", reason: "too_short" },
  );
  assert.deepEqual(
    await service.reset(verified.resetToken, "CorrectHorse10", { now: new Date("2026-08-25T14:11:00.000Z") }),
    { status: "invalid_grant" },
  );
});

test("recovery rate limiter blocks repeated action attempts inside its window", async () => {
  const limiter = new InMemoryRecoveryRateLimiter({ windowMs: 60_000, requestMax: 1, verifyMax: 1, resetMax: 1 });
  const input = { action: "request" as const, identity: "coach@kfit.local", ipAddress: "192.0.2.1", now };
  assert.equal(limiter.consume(input), true);
  assert.equal(limiter.consume(input), false);
});

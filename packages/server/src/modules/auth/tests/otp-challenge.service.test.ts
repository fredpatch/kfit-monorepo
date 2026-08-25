import assert from "node:assert/strict";
import test from "node:test";
import type { RecordAuditEventInput } from "../services/audit.service.js";
import { digestOtp } from "../services/crypto/otp.crypto.js";
import {
  OtpChallengeService,
  type CreateOtpChallengeRecordInput,
  type OtpChallengeLookup,
  type OtpChallengeRecord,
  type OtpChallengeRepository,
} from "../services/otp-challenge.service.js";

const otpPepper = "a-secure-test-otp-pepper-that-is-longer-than-32-characters";
const now = new Date("2026-08-25T08:00:00Z");

function makeChallenge(input: Partial<OtpChallengeRecord> = {}): OtpChallengeRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: "11111111-1111-1111-1111-111111111111",
    sessionId: null,
    purpose: "password_recovery",
    codeHash: digestOtp("123456", otpPepper),
    expiresAt: new Date("2026-08-25T08:05:00Z"),
    attemptCount: 0,
    maxAttempts: 5,
    consumedAt: null,
    supersededAt: null,
    deliveryChannel: "email",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function makeAuditRecorder(events: RecordAuditEventInput[] = []) {
  return {
    events,
    async record(input: RecordAuditEventInput) {
      events.push(input);
    },
  };
}

test("OtpChallengeService issues hash-only challenges and supersedes previous active challenges", async () => {
  const supersedeInputs: Array<OtpChallengeLookup & { supersededAt: Date }> = [];
  const createInputs: CreateOtpChallengeRecordInput[] = [];
  const repository: OtpChallengeRepository = {
    async supersedeActive(input) {
      supersedeInputs.push(input);
      return 1;
    },
    async create(input) {
      createInputs.push(input);
      return makeChallenge({ ...input, attemptCount: 0, consumedAt: null, supersededAt: null });
    },
    async findLatest() {
      return null;
    },
    async incrementAttempt() {
      throw new Error("not used");
    },
    async consume() {
      throw new Error("not used");
    },
  };
  const audit = makeAuditRecorder();
  const service = new OtpChallengeService(repository, audit, {
    otpPepper,
    otpTtlMs: 5 * 60_000,
    otpMaxAttempts: 5,
  });

  const result = await service.issue({
    userId: "11111111-1111-1111-1111-111111111111",
    purpose: "password_recovery",
    now,
  });

  const created = createInputs[0];
  assert.ok(created);
  assert.match(result.code, /^\d{6}$/);
  assert.notEqual(created.codeHash, result.code);
  assert.equal(created.expiresAt.toISOString(), "2026-08-25T08:05:00.000Z");
  assert.equal(supersedeInputs[0]?.purpose, "password_recovery");
  assert.equal(audit.events[0]?.eventType, "auth.otp.issued");
});

test("OtpChallengeService consumes a valid OTP exactly once", async () => {
  const consumedInputs: Array<{ challengeId: string; consumedAt: Date }> = [];
  const repository: OtpChallengeRepository = {
    async supersedeActive() {
      return 0;
    },
    async create() {
      throw new Error("not used");
    },
    async findLatest() {
      return makeChallenge();
    },
    async incrementAttempt() {
      throw new Error("not used");
    },
    async consume(input) {
      consumedInputs.push(input);
      return makeChallenge({ consumedAt: input.consumedAt, updatedAt: input.updatedAt });
    },
  };
  const audit = makeAuditRecorder();
  const service = new OtpChallengeService(repository, audit, {
    otpPepper,
    otpTtlMs: 5 * 60_000,
    otpMaxAttempts: 5,
  });

  const result = await service.verify("123456", { userId: "11111111-1111-1111-1111-111111111111", purpose: "password_recovery", now });

  assert.equal(result.status, "verified");
  assert.equal(consumedInputs[0]?.challengeId, "00000000-0000-0000-0000-000000000001");
  assert.equal(audit.events[0]?.eventType, "auth.otp.verified");
});

test("OtpChallengeService increments attempts and locks on repeated wrong OTPs", async () => {
  const incrementInputs: Array<{ challengeId: string; attemptCount: number }> = [];
  const repository: OtpChallengeRepository = {
    async supersedeActive() {
      return 0;
    },
    async create() {
      throw new Error("not used");
    },
    async findLatest() {
      return makeChallenge({ attemptCount: 4, maxAttempts: 5 });
    },
    async incrementAttempt(input) {
      incrementInputs.push(input);
      return makeChallenge({ attemptCount: input.attemptCount, maxAttempts: 5 });
    },
    async consume() {
      throw new Error("consume should not be called");
    },
  };
  const audit = makeAuditRecorder();
  const service = new OtpChallengeService(repository, audit, {
    otpPepper,
    otpTtlMs: 5 * 60_000,
    otpMaxAttempts: 5,
  });

  const result = await service.verify("999999", { userId: "11111111-1111-1111-1111-111111111111", purpose: "password_recovery", now });

  assert.deepEqual({ status: result.status, reason: result.status === "rejected" ? result.reason : null }, { status: "rejected", reason: "locked" });
  assert.equal(incrementInputs[0]?.attemptCount, 5);
  assert.equal(audit.events[0]?.result, "blocked");
});

test("OtpChallengeService rejects expired consumed superseded and already locked challenges", async () => {
  const cases: Array<{ challenge: OtpChallengeRecord; reason: string }> = [
    { challenge: makeChallenge({ expiresAt: now }), reason: "expired" },
    { challenge: makeChallenge({ consumedAt: now }), reason: "consumed" },
    { challenge: makeChallenge({ supersededAt: now }), reason: "superseded" },
    { challenge: makeChallenge({ attemptCount: 5, maxAttempts: 5 }), reason: "locked" },
  ];

  for (const item of cases) {
    const repository: OtpChallengeRepository = {
      async supersedeActive() {
        return 0;
      },
      async create() {
        throw new Error("not used");
      },
      async findLatest() {
        return item.challenge;
      },
      async incrementAttempt() {
        throw new Error("increment should not be called");
      },
      async consume() {
        throw new Error("consume should not be called");
      },
    };
    const service = new OtpChallengeService(repository, makeAuditRecorder(), {
      otpPepper,
      otpTtlMs: 5 * 60_000,
      otpMaxAttempts: 5,
    });

    const result = await service.verify("123456", { userId: item.challenge.userId, purpose: item.challenge.purpose, now });
    assert.deepEqual({ status: result.status, reason: result.status === "rejected" ? result.reason : null }, { status: "rejected", reason: item.reason });
  }
});

test("OtpChallengeService keeps sensitive-action OTPs bound to the session lookup", async () => {
  const lookups: OtpChallengeLookup[] = [];
  const repository: OtpChallengeRepository = {
    async supersedeActive() {
      return 0;
    },
    async create() {
      throw new Error("not used");
    },
    async findLatest(input) {
      lookups.push(input);
      return makeChallenge({
        purpose: "sensitive_action",
        sessionId: "22222222-2222-2222-2222-222222222222",
      });
    },
    async incrementAttempt() {
      throw new Error("not used");
    },
    async consume(input) {
      return makeChallenge({
        purpose: "sensitive_action",
        sessionId: "22222222-2222-2222-2222-222222222222",
        consumedAt: input.consumedAt,
      });
    },
  };
  const audit = makeAuditRecorder();
  const service = new OtpChallengeService(repository, audit, {
    otpPepper,
    otpTtlMs: 5 * 60_000,
    otpMaxAttempts: 5,
  });

  const result = await service.verify("123456", {
    userId: "11111111-1111-1111-1111-111111111111",
    sessionId: "22222222-2222-2222-2222-222222222222",
    purpose: "sensitive_action",
    now,
  });

  assert.equal(result.status, "verified");
  assert.equal(lookups[0]?.sessionId, "22222222-2222-2222-2222-222222222222");
  assert.deepEqual(audit.events[0]?.metadata, { purpose: "sensitive_action", sessionBound: true });
});

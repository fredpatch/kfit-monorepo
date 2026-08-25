import assert from "node:assert/strict";
import test from "node:test";
import { type RecordAuditEventInput } from "../services/audit.service.js";
import {
  digestRefreshToken,
  SessionService,
  type AuthSessionRecord,
  type CreateSessionRecordInput,
  type SessionRepository,
  verifyRefreshTokenDigest,
} from "../services/session.service.js";

const pepper = "a-secure-test-refresh-pepper-that-is-longer-than-32-characters";
const auditHashPepper = "a-secure-test-audit-pepper-that-is-longer-than-32-characters";
const baseNow = new Date("2026-08-25T08:00:00Z");

function makeSession(input: Partial<AuthSessionRecord> = {}): AuthSessionRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: "11111111-1111-1111-1111-111111111111",
    tokenFamilyId: "22222222-2222-2222-2222-222222222222",
    refreshTokenHash: digestRefreshToken("current-refresh-token", pepper),
    rotationCounter: 0,
    trustedDeviceId: null,
    issuedAt: baseNow,
    expiresAt: new Date("2026-08-26T08:00:00Z"),
    absoluteExpiresAt: new Date("2026-08-25T20:00:00Z"),
    lastSeenAt: new Date("2026-08-25T07:55:00Z"),
    revokedAt: null,
    compromisedAt: null,
    ipHash: null,
    userAgentHash: null,
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

test("refresh token digest verification never stores the raw refresh token", () => {
  const token = "raw-refresh-token";
  const digest = digestRefreshToken(token, pepper);

  assert.notEqual(digest, token);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(verifyRefreshTokenDigest(token, digest, pepper), true);
  assert.equal(verifyRefreshTokenDigest("wrong-token", digest, pepper), false);
});

test("SessionService creates sessions with hash-only refresh tokens and expiry clocks", async () => {
  const createdInputs: CreateSessionRecordInput[] = [];
  const repository: SessionRepository = {
    async create(input) {
      createdInputs.push(input);
      return makeSession({ ...input, id: "00000000-0000-0000-0000-000000000001", revokedAt: null, compromisedAt: null });
    },
    async findByRefreshTokenHash() {
      return null;
    },
    async rotateRefreshToken() {
      throw new Error("not used");
    },
    async markTokenFamilyCompromised() {
      return 0;
    },
    async revokeSession() {
      return null;
    },
  };
  const audit = makeAuditRecorder();
  const service = new SessionService(repository, audit, {
    refreshTokenPepper: pepper,
    auditHashPepper,
    refreshTokenTtlMs: 60_000,
    absoluteSessionTtlMs: 120_000,
    inactivityTimeoutMs: 30_000,
  });

  const result = await service.createSession({
    userId: "11111111-1111-1111-1111-111111111111",
    trustedDeviceId: "33333333-3333-3333-3333-333333333333",
    ipAddress: "192.0.2.10",
    userAgent: "Mozilla/5.0",
    requestId: "44444444-4444-4444-4444-444444444444",
    now: baseNow,
  });

  const created = createdInputs[0];
  assert.ok(created);
  assert.notEqual(created.refreshTokenHash, result.refreshToken);
  assert.equal(created.rotationCounter, 0);
  assert.equal(created.expiresAt.toISOString(), "2026-08-25T08:01:00.000Z");
  assert.equal(created.absoluteExpiresAt.toISOString(), "2026-08-25T08:02:00.000Z");
  assert.notEqual(created.ipHash, "192.0.2.10");
  assert.equal(audit.events[0]?.eventType, "auth.session.created");
});

test("SessionService rotates a valid refresh token and increments the rotation counter", async () => {
  const session = makeSession();
  const rotatedInputs: Array<{ refreshTokenHash: string; rotationCounter: number }> = [];
  const repository: SessionRepository = {
    async create() {
      throw new Error("not used");
    },
    async findByRefreshTokenHash(refreshTokenHash) {
      return refreshTokenHash === session.refreshTokenHash ? session : null;
    },
    async rotateRefreshToken(input) {
      rotatedInputs.push(input);
      return makeSession({
        refreshTokenHash: input.refreshTokenHash,
        rotationCounter: input.rotationCounter,
        lastSeenAt: input.lastSeenAt,
        expiresAt: input.expiresAt,
      });
    },
    async markTokenFamilyCompromised() {
      return 0;
    },
    async revokeSession() {
      return null;
    },
  };
  const audit = makeAuditRecorder();
  const service = new SessionService(repository, audit, {
    refreshTokenPepper: pepper,
    auditHashPepper,
    refreshTokenTtlMs: 60_000,
    absoluteSessionTtlMs: 120_000,
    inactivityTimeoutMs: 10 * 60_000,
  });

  const result = await service.rotateRefreshToken("current-refresh-token", { now: baseNow });

  assert.equal(result.status, "rotated");
  const rotatedInput = rotatedInputs[0];
  assert.ok(rotatedInput);
  assert.equal(rotatedInput.rotationCounter, 1);
  assert.notEqual(rotatedInput.refreshTokenHash, session.refreshTokenHash);
  assert.equal(audit.events[0]?.eventType, "auth.session.rotated");
});

test("SessionService blocks invalid sessions before rotation", async () => {
  const repository: SessionRepository = {
    async create() {
      throw new Error("not used");
    },
    async findByRefreshTokenHash() {
      return makeSession({ lastSeenAt: new Date("2026-08-25T07:00:00Z") });
    },
    async rotateRefreshToken() {
      throw new Error("rotation should be blocked");
    },
    async markTokenFamilyCompromised() {
      return 0;
    },
    async revokeSession() {
      return null;
    },
  };
  const audit = makeAuditRecorder();
  const service = new SessionService(repository, audit, {
    refreshTokenPepper: pepper,
    auditHashPepper,
    refreshTokenTtlMs: 60_000,
    absoluteSessionTtlMs: 120_000,
    inactivityTimeoutMs: 30_000,
  });

  const result = await service.rotateRefreshToken("current-refresh-token", { now: baseNow });

  assert.deepEqual(result, { status: "invalid", reason: "inactive" });
  assert.equal(audit.events[0]?.eventType, "auth.session.refresh_blocked");
  assert.deepEqual(audit.events[0]?.metadata, { reason: "inactive" });
});

test("SessionService can mark a token family compromised for reuse detection", async () => {
  const repository: SessionRepository = {
    async create() {
      throw new Error("not used");
    },
    async findByRefreshTokenHash() {
      return null;
    },
    async rotateRefreshToken() {
      throw new Error("not used");
    },
    async markTokenFamilyCompromised(input) {
      assert.equal(input.reason, "refresh_reuse_detected");
      return 2;
    },
    async revokeSession() {
      return null;
    },
  };
  const audit = makeAuditRecorder();
  const service = new SessionService(repository, audit, {
    refreshTokenPepper: pepper,
    auditHashPepper,
    refreshTokenTtlMs: 60_000,
    absoluteSessionTtlMs: 120_000,
    inactivityTimeoutMs: 30_000,
  });

  const result = await service.markTokenFamilyCompromised({
    tokenFamilyId: "22222222-2222-2222-2222-222222222222",
    reason: "refresh_reuse_detected",
    now: baseNow,
  });

  assert.equal(result.affectedSessions, 2);
  assert.equal(audit.events[0]?.eventType, "auth.session.token_family_compromised");
});


test("SessionService revokes a session and records logout audit evidence", async () => {
  const repository: SessionRepository = {
    async create() {
      throw new Error("not used");
    },
    async findByRefreshTokenHash() {
      return null;
    },
    async rotateRefreshToken() {
      throw new Error("not used");
    },
    async markTokenFamilyCompromised() {
      return 0;
    },
    async revokeSession(input) {
      assert.equal(input.sessionId, "00000000-0000-0000-0000-000000000001");
      return makeSession({ revokedAt: input.revokedAt });
    },
  };
  const audit = makeAuditRecorder();
  const service = new SessionService(repository, audit, {
    refreshTokenPepper: pepper,
    auditHashPepper,
    refreshTokenTtlMs: 60_000,
    absoluteSessionTtlMs: 120_000,
    inactivityTimeoutMs: 30_000,
  });

  const revoked = await service.revokeSession({
    sessionId: "00000000-0000-0000-0000-000000000001",
    now: baseNow,
  });

  assert.equal(revoked?.revokedAt?.toISOString(), baseNow.toISOString());
  assert.equal(audit.events[0]?.eventType, "auth.session.revoked");
});

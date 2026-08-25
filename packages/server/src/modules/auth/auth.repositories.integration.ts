import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../db/client.js";
import { auditEvents, authSessions, otpChallenges, users } from "../../db/schema/auth.js";
import { AuditService } from "./audit.service.js";
import { OtpChallengeService } from "./otp-challenge.service.js";
import { SessionService } from "./session.service.js";
import { DrizzleOtpChallengeRepository, DrizzleSessionRepository } from "./auth.repositories.js";

const pepper = "a-secure-integration-pepper-that-is-longer-than-32-characters";
const now = new Date("2026-08-25T08:00:00Z");
const userId = randomUUID();
const requestId = randomUUID();

after(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.requestId, requestId));
  await db.delete(otpChallenges).where(eq(otpChallenges.userId, userId));
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

test("Drizzle auth repositories persist session, OTP and audit lifecycle data", async () => {
  await db.insert(users).values({
    id: userId,
    email: `auth-repository-${userId}@kfit.local`,
    passwordHash: "test-password-hash",
    status: "active",
    role: "coach",
  });

  const audit = new AuditService(db, { auditHashPepper: pepper });
  const sessionService = new SessionService(new DrizzleSessionRepository(db), audit, {
    refreshTokenPepper: pepper,
    auditHashPepper: pepper,
    refreshTokenTtlMs: 60_000,
    absoluteSessionTtlMs: 10 * 60_000,
    inactivityTimeoutMs: 5 * 60_000,
  });

  const created = await sessionService.createSession({
    userId,
    requestId,
    ipAddress: "192.0.2.10",
    userAgent: "KFIT integration",
    now,
  });

  assert.notEqual(created.session.refreshTokenHash, created.refreshToken);
  assert.equal(created.session.rotationCounter, 0);

  const rotated = await sessionService.rotateRefreshToken(created.refreshToken, {
    requestId,
    ipAddress: "192.0.2.10",
    userAgent: "KFIT integration",
    now: new Date("2026-08-25T08:00:30Z"),
  });

  assert.equal(rotated.status, "rotated");
  assert.equal(rotated.status === "rotated" ? rotated.session.rotationCounter : null, 1);

  const otpService = new OtpChallengeService(new DrizzleOtpChallengeRepository(db), audit, {
    otpPepper: pepper,
    otpTtlMs: 5 * 60_000,
    otpMaxAttempts: 5,
  });

  const issued = await otpService.issue({
    userId,
    sessionId: created.session.id,
    purpose: "sensitive_action",
    requestId,
    now,
  });

  assert.notEqual(issued.challenge.codeHash, issued.code);
  const verified = await otpService.verify(issued.code, {
    userId,
    sessionId: created.session.id,
    purpose: "sensitive_action",
    requestId,
    now: new Date("2026-08-25T08:02:00Z"),
  });

  assert.equal(verified.status, "verified");

  const [auditEvent] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.requestId, requestId))
    .limit(1);

  assert.ok(auditEvent);
  assert.notEqual(auditEvent.ipHash, "192.0.2.10");
});

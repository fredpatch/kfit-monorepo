import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { authSessions, otpChallenges, trustedDevices, users } from "../../../db/schema/auth.js";
import { DrizzlePasswordRecoveryRepository } from "../repositories/auth.repositories.js";

const userId = randomUUID();
const sessionId = randomUUID();
const deviceId = randomUUID();
const challengeId = randomUUID();
const verifiedAt = new Date("2026-08-25T14:00:00.000Z");
const completedAt = new Date("2026-08-25T14:02:00.000Z");

after(async () => {
  await db.delete(otpChallenges).where(eq(otpChallenges.userId, userId));
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

test("password recovery hard commit updates password and revokes sessions/devices once", async () => {
  await db.insert(users).values({
    id: userId,
    email: `password-recovery-${userId}@kfit.local`,
    passwordHash: "old-password-hash",
    status: "active",
    role: "coach",
  });
  await db.insert(trustedDevices).values({
    id: deviceId,
    userId,
    deviceFingerprintHash: `fingerprint-${userId}`,
    trustedUntil: new Date("2026-09-25T14:00:00.000Z"),
    lastUsedAt: verifiedAt,
  });
  await db.insert(authSessions).values({
    id: sessionId,
    userId,
    tokenFamilyId: randomUUID(),
    refreshTokenHash: `refresh-${randomUUID()}`,
    trustedDeviceId: deviceId,
    issuedAt: verifiedAt,
    expiresAt: new Date("2026-08-26T14:00:00.000Z"),
    absoluteExpiresAt: new Date("2026-08-26T14:00:00.000Z"),
    lastSeenAt: verifiedAt,
  });
  await db.insert(otpChallenges).values({
    id: challengeId,
    userId,
    sessionId: null,
    purpose: "password_recovery",
    codeHash: "hash-only",
    expiresAt: new Date("2026-08-25T14:05:00.000Z"),
    attemptCount: 0,
    maxAttempts: 5,
    consumedAt: verifiedAt,
    supersededAt: null,
    deliveryChannel: "email",
    createdAt: verifiedAt,
    updatedAt: verifiedAt,
  });

  const repository = new DrizzlePasswordRecoveryRepository(db);
  assert.equal(await repository.completeReset({
    userId,
    challengeId,
    verifiedAt: verifiedAt.toISOString(),
    passwordHash: "new-password-hash",
    completedAt,
  }), true);

  const [changedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [revokedSession] = await db.select().from(authSessions).where(eq(authSessions.id, sessionId)).limit(1);
  const [revokedDevice] = await db.select().from(trustedDevices).where(eq(trustedDevices.id, deviceId)).limit(1);
  const [redeemedChallenge] = await db.select().from(otpChallenges).where(eq(otpChallenges.id, challengeId)).limit(1);

  assert.equal(changedUser?.passwordHash, "new-password-hash");
  assert.equal(revokedSession?.revokedAt?.toISOString(), completedAt.toISOString());
  assert.equal(revokedDevice?.revokedAt?.toISOString(), completedAt.toISOString());
  assert.equal(redeemedChallenge?.updatedAt.toISOString(), completedAt.toISOString());

  assert.equal(await repository.completeReset({
    userId,
    challengeId,
    verifiedAt: verifiedAt.toISOString(),
    passwordHash: "replayed-password-hash",
    completedAt: new Date("2026-08-25T14:03:00.000Z"),
  }), false);
});

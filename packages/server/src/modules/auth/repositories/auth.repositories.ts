import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { db as appDb } from "../../../db/client.js";
import { authSessions, otpChallenges } from "../../../db/schema/auth.js";
import type {
  AuthSessionRecord,
  CreateSessionRecordInput,
  SessionRepository,
} from "../services/session.service.js";
import type {
  CreateOtpChallengeRecordInput,
  OtpChallengeLookup,
  OtpChallengeRecord,
  OtpChallengeRepository,
} from "../services/otp-challenge.service.js";

type AuthDb = typeof appDb;

function requireRow<T>(row: T | undefined, message: string): T {
  if (!row) throw new Error(message);
  return row;
}

function nullableUuidCondition(column: AnyPgColumn, value: string | null | undefined): SQL<unknown> {
  return value ? eq(column, value) : isNull(column);
}

function mapSession(row: typeof authSessions.$inferSelect): AuthSessionRecord {
  return row;
}

function mapOtpChallenge(row: typeof otpChallenges.$inferSelect): OtpChallengeRecord {
  return {
    ...row,
    purpose: row.purpose as OtpChallengeRecord["purpose"],
    deliveryChannel: row.deliveryChannel as OtpChallengeRecord["deliveryChannel"],
  };
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly database: AuthDb) {}

  async create(input: CreateSessionRecordInput): Promise<AuthSessionRecord> {
    const [session] = await this.database
      .insert(authSessions)
      .values(input)
      .returning();

    return mapSession(requireRow(session, "Session insert did not return a row"));
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSessionRecord | null> {
    const [session] = await this.database
      .select()
      .from(authSessions)
      .where(eq(authSessions.refreshTokenHash, refreshTokenHash))
      .limit(1);

    return session ? mapSession(session) : null;
  }

  async rotateRefreshToken(input: {
    sessionId: string;
    refreshTokenHash: string;
    rotationCounter: number;
    lastSeenAt: Date;
    expiresAt: Date;
  }): Promise<AuthSessionRecord> {
    const [session] = await this.database
      .update(authSessions)
      .set({
        refreshTokenHash: input.refreshTokenHash,
        rotationCounter: input.rotationCounter,
        lastSeenAt: input.lastSeenAt,
        expiresAt: input.expiresAt,
      })
      .where(eq(authSessions.id, input.sessionId))
      .returning();

    return mapSession(requireRow(session, "Session rotation did not return a row"));
  }

  async markTokenFamilyCompromised(input: {
    tokenFamilyId: string;
    compromisedAt: Date;
    reason: string;
  }): Promise<number> {
    const rows = await this.database
      .update(authSessions)
      .set({ compromisedAt: input.compromisedAt })
      .where(and(eq(authSessions.tokenFamilyId, input.tokenFamilyId), isNull(authSessions.compromisedAt)))
      .returning({ id: authSessions.id });

    return rows.length;
  }
}

export class DrizzleOtpChallengeRepository implements OtpChallengeRepository {
  constructor(private readonly database: AuthDb) {}

  async supersedeActive(input: OtpChallengeLookup & { supersededAt: Date }): Promise<number> {
    const rows = await this.database
      .update(otpChallenges)
      .set({ supersededAt: input.supersededAt, updatedAt: input.supersededAt })
      .where(and(
        eq(otpChallenges.purpose, input.purpose),
        nullableUuidCondition(otpChallenges.userId, input.userId),
        nullableUuidCondition(otpChallenges.sessionId, input.sessionId),
        isNull(otpChallenges.consumedAt),
        isNull(otpChallenges.supersededAt),
      ))
      .returning({ id: otpChallenges.id });

    return rows.length;
  }

  async create(input: CreateOtpChallengeRecordInput): Promise<OtpChallengeRecord> {
    const [challenge] = await this.database
      .insert(otpChallenges)
      .values(input)
      .returning();

    return mapOtpChallenge(requireRow(challenge, "OTP challenge insert did not return a row"));
  }

  async findLatest(input: OtpChallengeLookup): Promise<OtpChallengeRecord | null> {
    const [challenge] = await this.database
      .select()
      .from(otpChallenges)
      .where(and(
        eq(otpChallenges.purpose, input.purpose),
        nullableUuidCondition(otpChallenges.userId, input.userId),
        nullableUuidCondition(otpChallenges.sessionId, input.sessionId),
      ))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    return challenge ? mapOtpChallenge(challenge) : null;
  }

  async incrementAttempt(input: { challengeId: string; attemptCount: number; updatedAt: Date }): Promise<OtpChallengeRecord> {
    const [challenge] = await this.database
      .update(otpChallenges)
      .set({ attemptCount: input.attemptCount, updatedAt: input.updatedAt })
      .where(eq(otpChallenges.id, input.challengeId))
      .returning();

    return mapOtpChallenge(requireRow(challenge, "OTP attempt update did not return a row"));
  }

  async consume(input: { challengeId: string; consumedAt: Date; updatedAt: Date }): Promise<OtpChallengeRecord> {
    const [challenge] = await this.database
      .update(otpChallenges)
      .set({ consumedAt: input.consumedAt, updatedAt: input.updatedAt })
      .where(eq(otpChallenges.id, input.challengeId))
      .returning();

    return mapOtpChallenge(requireRow(challenge, "OTP consume update did not return a row"));
  }
}

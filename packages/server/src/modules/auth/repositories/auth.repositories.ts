import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { db as appDb } from "../../../db/client.js";
import { authSessions, otpChallenges, users } from "../../../db/schema/auth.js";
import type {
  AuthSessionRecord,
  CreateSessionRecordInput,
  SessionRepository,
} from "../services/session.service.js";
import type { SessionLookupRepository } from "../services/access-token-session.resolver.js";
import type { AuthUserRecord, AuthUserRepository } from "../services/auth-route.service.js";
import type { BootstrapRepository } from "../services/bootstrap.service.js";
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

export class DrizzleSessionRepository implements SessionRepository, SessionLookupRepository {
  constructor(private readonly database: AuthDb) {}

  async create(input: CreateSessionRecordInput): Promise<AuthSessionRecord> {
    const [session] = await this.database
      .insert(authSessions)
      .values(input)
      .returning();

    return mapSession(requireRow(session, "Session insert did not return a row"));
  }

  async findById(sessionId: string): Promise<AuthSessionRecord | null> {
    const [session] = await this.database
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, sessionId))
      .limit(1);

    return session ? mapSession(session) : null;
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

  async revokeSession(input: { sessionId: string; revokedAt: Date }): Promise<AuthSessionRecord | null> {
    const [session] = await this.database
      .update(authSessions)
      .set({ revokedAt: input.revokedAt })
      .where(eq(authSessions.id, input.sessionId))
      .returning();

    return session ? mapSession(session) : null;
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


function mapAuthUser(row: typeof users.$inferSelect): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    status: row.status as AuthUserRecord["status"],
    role: row.role as AuthUserRecord["role"],
  };
}

export class DrizzleAuthUserRepository implements AuthUserRepository {
  constructor(private readonly database: AuthDb) {}

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ? mapAuthUser(user) : null;
  }

  async findById(userId: string): Promise<AuthUserRecord | null> {
    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user ? mapAuthUser(user) : null;
  }
}


export class DrizzleBootstrapRepository implements BootstrapRepository {
  constructor(private readonly database: AuthDb) {}

  async countUsers(): Promise<number> {
    const rows = await this.database.select({ id: users.id }).from(users).limit(1);
    return rows.length;
  }

  async createFirstUser(input: { email: string; passwordHash: string; role: "admin" | "coach" }): Promise<AuthUserRecord> {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(540118001)`);

      const existingUsers = await tx.select({ id: users.id }).from(users).limit(1);
      if (existingUsers.length > 0) {
        throw new Error("BOOTSTRAP_ALREADY_COMPLETED");
      }

      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role,
          status: "active",
        })
        .returning();

      return mapAuthUser(requireRow(user, "Bootstrap user insert did not return a row"));
    });
  }
}

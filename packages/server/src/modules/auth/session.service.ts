import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { hashAuditContext, type RecordAuditEventInput } from "./audit.service.js";
import { sessionInvalidReason, type SessionClock, type SessionInvalidReason } from "./session.policy.js";

export type AuthSessionRecord = SessionClock & {
  id: string;
  userId: string;
  tokenFamilyId: string;
  refreshTokenHash: string;
  rotationCounter: number;
  trustedDeviceId: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
};

export type CreateSessionRecordInput = {
  userId: string;
  tokenFamilyId: string;
  refreshTokenHash: string;
  rotationCounter: number;
  trustedDeviceId: string | null;
  issuedAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  lastSeenAt: Date;
  ipHash: string | null;
  userAgentHash: string | null;
};

export type SessionRepository = {
  create(input: CreateSessionRecordInput): Promise<AuthSessionRecord>;
  findByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSessionRecord | null>;
  rotateRefreshToken(input: {
    sessionId: string;
    refreshTokenHash: string;
    rotationCounter: number;
    lastSeenAt: Date;
    expiresAt: Date;
  }): Promise<AuthSessionRecord>;
  markTokenFamilyCompromised(input: {
    tokenFamilyId: string;
    compromisedAt: Date;
    reason: string;
  }): Promise<number>;
};

export type SessionAuditRecorder = {
  record(input: RecordAuditEventInput): Promise<unknown>;
};

export type SessionServiceOptions = {
  refreshTokenPepper: string;
  auditHashPepper: string;
  refreshTokenTtlMs: number;
  absoluteSessionTtlMs: number;
  inactivityTimeoutMs: number;
};

export type CreateSessionInput = {
  userId: string;
  trustedDeviceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  now?: Date;
};

export type RotateRefreshTokenResult =
  | { status: "rotated"; session: AuthSessionRecord; refreshToken: string }
  | { status: "invalid"; reason: "not_found" | SessionInvalidReason };

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestRefreshToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export function verifyRefreshTokenDigest(candidate: string, expectedDigest: string, pepper: string): boolean {
  const actual = Buffer.from(digestRefreshToken(candidate, pepper), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function addMs(date: Date, durationMs: number): Date {
  return new Date(date.getTime() + durationMs);
}

export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly audit: SessionAuditRecorder,
    private readonly options: SessionServiceOptions,
  ) {}

  async createSession(input: CreateSessionInput) {
    const now = input.now ?? new Date();
    const refreshToken = generateRefreshToken();
    const tokenFamilyId = randomUUID();
    const session = await this.repository.create({
      userId: input.userId,
      tokenFamilyId,
      refreshTokenHash: digestRefreshToken(refreshToken, this.options.refreshTokenPepper),
      rotationCounter: 0,
      trustedDeviceId: input.trustedDeviceId ?? null,
      issuedAt: now,
      expiresAt: addMs(now, this.options.refreshTokenTtlMs),
      absoluteExpiresAt: addMs(now, this.options.absoluteSessionTtlMs),
      lastSeenAt: now,
      ipHash: hashAuditContext(input.ipAddress, this.options.auditHashPepper),
      userAgentHash: hashAuditContext(input.userAgent, this.options.auditHashPepper),
    });

    await this.audit.record({
      actorType: "user",
      actorUserId: input.userId,
      eventType: "auth.session.created",
      entityType: "auth_session",
      entityId: session.id,
      result: "success",
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { trustedDevice: Boolean(input.trustedDeviceId) },
    });

    return { session, refreshToken };
  }

  async rotateRefreshToken(refreshToken: string, input: { requestId?: string | null; ipAddress?: string | null; userAgent?: string | null; now?: Date } = {}): Promise<RotateRefreshTokenResult> {
    const now = input.now ?? new Date();
    const refreshTokenHash = digestRefreshToken(refreshToken, this.options.refreshTokenPepper);
    const session = await this.repository.findByRefreshTokenHash(refreshTokenHash);

    if (!session) {
      return { status: "invalid", reason: "not_found" };
    }

    const invalidReason = sessionInvalidReason(session, now, this.options.inactivityTimeoutMs);
    if (invalidReason) {
      await this.audit.record({
        actorType: "user",
        actorUserId: session.userId,
        eventType: "auth.session.refresh_blocked",
        entityType: "auth_session",
        entityId: session.id,
        result: "blocked",
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: { reason: invalidReason },
      });
      return { status: "invalid", reason: invalidReason };
    }

    const nextRefreshToken = generateRefreshToken();
    const rotated = await this.repository.rotateRefreshToken({
      sessionId: session.id,
      refreshTokenHash: digestRefreshToken(nextRefreshToken, this.options.refreshTokenPepper),
      rotationCounter: session.rotationCounter + 1,
      lastSeenAt: now,
      expiresAt: addMs(now, this.options.refreshTokenTtlMs),
    });

    await this.audit.record({
      actorType: "user",
      actorUserId: session.userId,
      eventType: "auth.session.rotated",
      entityType: "auth_session",
      entityId: session.id,
      result: "success",
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { rotationCounter: rotated.rotationCounter },
    });

    return { status: "rotated", session: rotated, refreshToken: nextRefreshToken };
  }

  async markTokenFamilyCompromised(input: {
    tokenFamilyId: string;
    reason: string;
    actorUserId?: string | null;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    now?: Date;
  }) {
    const compromisedAt = input.now ?? new Date();
    const affectedSessions = await this.repository.markTokenFamilyCompromised({
      tokenFamilyId: input.tokenFamilyId,
      compromisedAt,
      reason: input.reason,
    });

    await this.audit.record({
      actorType: input.actorUserId ? "user" : "system",
      actorUserId: input.actorUserId ?? null,
      eventType: "auth.session.token_family_compromised",
      entityType: "auth_session",
      result: "blocked",
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { tokenFamilyId: input.tokenFamilyId, reason: input.reason, affectedSessions },
    });

    return { affectedSessions, compromisedAt };
  }
}

import type { OtpPurpose } from "../../db/enums.js";
import type { RecordAuditEventInput } from "./audit.service.js";
import { digestOtp, generateOtp, verifyOtpDigest } from "./otp.crypto.js";

export type OtpDeliveryChannel = "email";

export type OtpChallengeRecord = {
  id: string;
  userId: string | null;
  sessionId: string | null;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  attemptCount: number;
  maxAttempts: number;
  consumedAt: Date | null;
  supersededAt: Date | null;
  deliveryChannel: OtpDeliveryChannel;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateOtpChallengeRecordInput = {
  userId: string | null;
  sessionId: string | null;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  maxAttempts: number;
  deliveryChannel: OtpDeliveryChannel;
};

export type OtpChallengeLookup = {
  userId?: string | null;
  sessionId?: string | null;
  purpose: OtpPurpose;
};

export type OtpChallengeRepository = {
  supersedeActive(input: OtpChallengeLookup & { supersededAt: Date }): Promise<number>;
  create(input: CreateOtpChallengeRecordInput): Promise<OtpChallengeRecord>;
  findLatest(input: OtpChallengeLookup): Promise<OtpChallengeRecord | null>;
  incrementAttempt(input: { challengeId: string; attemptCount: number; updatedAt: Date }): Promise<OtpChallengeRecord>;
  consume(input: { challengeId: string; consumedAt: Date; updatedAt: Date }): Promise<OtpChallengeRecord>;
};

export type OtpAuditRecorder = {
  record(input: RecordAuditEventInput): Promise<unknown>;
};

export type OtpServiceOptions = {
  otpPepper: string;
  otpTtlMs: number;
  otpMaxAttempts: number;
};

export type IssueOtpInput = OtpChallengeLookup & {
  deliveryChannel?: OtpDeliveryChannel;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
};

export type OtpRejectReason = "not_found" | "expired" | "consumed" | "superseded" | "locked" | "invalid";

export type VerifyOtpResult =
  | { status: "verified"; challenge: OtpChallengeRecord }
  | { status: "rejected"; reason: OtpRejectReason; challenge?: OtpChallengeRecord };

function addMs(date: Date, durationMs: number): Date {
  return new Date(date.getTime() + durationMs);
}

function challengeEntityId(challenge: OtpChallengeRecord | null): string | null {
  return challenge?.id ?? null;
}

export class OtpChallengeService {
  constructor(
    private readonly repository: OtpChallengeRepository,
    private readonly audit: OtpAuditRecorder,
    private readonly options: OtpServiceOptions,
  ) {}

  async issue(input: IssueOtpInput) {
    const now = input.now ?? new Date();
    const code = generateOtp();

    const supersededCount = await this.repository.supersedeActive({
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      purpose: input.purpose,
      supersededAt: now,
    });

    const challenge = await this.repository.create({
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      purpose: input.purpose,
      codeHash: digestOtp(code, this.options.otpPepper),
      expiresAt: addMs(now, this.options.otpTtlMs),
      maxAttempts: this.options.otpMaxAttempts,
      deliveryChannel: input.deliveryChannel ?? "email",
    });

    await this.audit.record({
      actorType: input.userId ? "user" : "anonymous",
      actorUserId: input.userId ?? null,
      eventType: "auth.otp.issued",
      entityType: "otp_challenge",
      entityId: challenge.id,
      result: "success",
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { purpose: input.purpose, sessionBound: Boolean(input.sessionId), supersededCount },
    });

    return { challenge, code };
  }

  async verify(code: string, input: OtpChallengeLookup & { requestId?: string | null; ipAddress?: string | null; userAgent?: string | null; now?: Date }): Promise<VerifyOtpResult> {
    const now = input.now ?? new Date();
    const challenge = await this.repository.findLatest({
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      purpose: input.purpose,
    });

    const rejected = async (reason: OtpRejectReason, result: "failure" | "blocked", challengeForAudit: OtpChallengeRecord | null = challenge): Promise<VerifyOtpResult> => {
      await this.audit.record({
        actorType: input.userId ? "user" : "anonymous",
        actorUserId: input.userId ?? null,
        eventType: "auth.otp.verify_rejected",
        entityType: "otp_challenge",
        entityId: challengeEntityId(challengeForAudit),
        result,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: { purpose: input.purpose, reason, sessionBound: Boolean(input.sessionId) },
      });
      return challengeForAudit ? { status: "rejected", reason, challenge: challengeForAudit } : { status: "rejected", reason };
    };

    if (!challenge) return rejected("not_found", "failure", null);
    if (challenge.consumedAt) return rejected("consumed", "blocked");
    if (challenge.supersededAt) return rejected("superseded", "blocked");
    if (challenge.attemptCount >= challenge.maxAttempts) return rejected("locked", "blocked");
    if (now >= challenge.expiresAt) return rejected("expired", "blocked");

    if (!verifyOtpDigest(code, challenge.codeHash, this.options.otpPepper)) {
      const nextAttemptCount = challenge.attemptCount + 1;
      const updated = await this.repository.incrementAttempt({
        challengeId: challenge.id,
        attemptCount: nextAttemptCount,
        updatedAt: now,
      });
      return rejected(nextAttemptCount >= challenge.maxAttempts ? "locked" : "invalid", nextAttemptCount >= challenge.maxAttempts ? "blocked" : "failure", updated);
    }

    const consumed = await this.repository.consume({
      challengeId: challenge.id,
      consumedAt: now,
      updatedAt: now,
    });

    await this.audit.record({
      actorType: input.userId ? "user" : "anonymous",
      actorUserId: input.userId ?? null,
      eventType: "auth.otp.verified",
      entityType: "otp_challenge",
      entityId: consumed.id,
      result: "success",
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { purpose: input.purpose, sessionBound: Boolean(input.sessionId) },
    });

    return { status: "verified", challenge: consumed };
  }
}

import type { AuthUserRecord } from "./auth-route.service.js";
import type { RecordAuditEventInput } from "./audit.service.js";
import type { AuthMailDelivery } from "./auth-mail.delivery.js";
import type { OtpChallengeService, OtpRejectReason } from "./otp-challenge.service.js";
import type { PasswordService, PasswordStrengthResult } from "./password.service.js";
import { signPasswordRecoveryGrant, verifyPasswordRecoveryGrant } from "./crypto/recovery-token.crypto.js";

export type PasswordRecoveryAudit = {
  record(input: RecordAuditEventInput): Promise<unknown>;
};

export type PasswordRecoveryRepository = {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  completeReset(input: {
    userId: string;
    challengeId: string;
    verifiedAt: string;
    passwordHash: string;
    completedAt: Date;
  }): Promise<boolean>;
};

export type RecoveryRateLimitAction = "request" | "verify" | "reset";

export type RecoveryRateLimiter = {
  consume(input: {
    action: RecoveryRateLimitAction;
    identity: string;
    ipAddress?: string | null;
    now: Date;
  }): boolean;
};

type RateBucket = { count: number; resetsAt: number };

export class InMemoryRecoveryRateLimiter implements RecoveryRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(private readonly options: {
    windowMs: number;
    requestMax: number;
    verifyMax: number;
    resetMax: number;
  }) {}

  consume(input: {
    action: RecoveryRateLimitAction;
    identity: string;
    ipAddress?: string | null;
    now: Date;
  }): boolean {
    const limit = input.action === "request"
      ? this.options.requestMax
      : input.action === "verify"
        ? this.options.verifyMax
        : this.options.resetMax;
    const key = `${input.action}:${input.ipAddress ?? "unknown"}:${input.identity}`;
    const nowMs = input.now.getTime();
    const current = this.buckets.get(key);

    if (!current || current.resetsAt <= nowMs) {
      this.buckets.set(key, { count: 1, resetsAt: nowMs + this.options.windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }
}

export type PasswordRecoveryServiceOptions = {
  recoveryTokenSecret: string;
  recoveryGrantTtlMs: number;
};

export type RecoveryContext = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
};

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class PasswordRecoveryService {
  constructor(
    private readonly repository: PasswordRecoveryRepository,
    private readonly otp: Pick<OtpChallengeService, "issue" | "verify">,
    private readonly passwords: Pick<PasswordService, "validate" | "hash">,
    private readonly mail: AuthMailDelivery,
    private readonly audit: PasswordRecoveryAudit,
    private readonly rateLimiter: RecoveryRateLimiter,
    private readonly options: PasswordRecoveryServiceOptions,
  ) {}

  private allowed(action: RecoveryRateLimitAction, identity: string, context: RecoveryContext, now: Date): boolean {
    return this.rateLimiter.consume({
      action,
      identity,
      ipAddress: context.ipAddress ?? null,
      now,
    });
  }

  private async auditEvent(input: {
    eventType: string;
    result: "success" | "failure" | "blocked";
    userId?: string | null;
    challengeId?: string | null;
    reason?: string;
    context: RecoveryContext;
  }): Promise<void> {
    await this.audit.record({
      actorType: input.userId ? "user" : "anonymous",
      actorUserId: input.userId ?? null,
      eventType: input.eventType,
      entityType: input.challengeId ? "otp_challenge" : "user",
      entityId: input.challengeId ?? input.userId ?? null,
      result: input.result,
      requestId: input.context.requestId ?? null,
      ipAddress: input.context.ipAddress ?? null,
      userAgent: input.context.userAgent ?? null,
      metadata: {
        purpose: "password_recovery",
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
  }

  async request(emailInput: string, context: RecoveryContext = {}): Promise<{ status: "accepted" | "rate_limited" }> {
    const now = context.now ?? new Date();
    const email = canonicalEmail(emailInput);
    if (!this.allowed("request", email, context, now)) {
      await this.auditEvent({ eventType: "auth.password_recovery.rate_limited", result: "blocked", reason: "request", context });
      return { status: "rate_limited" };
    }

    const user = await this.repository.findByEmail(email);
    if (!user || user.status !== "active") {
      await this.auditEvent({ eventType: "auth.password_recovery.requested", result: "success", reason: "neutral_unknown_or_unavailable", context });
      return { status: "accepted" };
    }

    const issued = await this.otp.issue({
      userId: user.id,
      sessionId: null,
      purpose: "password_recovery",
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      now,
    });

    try {
      await this.mail.sendPasswordRecoveryCode({
        to: user.email,
        code: issued.code,
        expiresAt: issued.challenge.expiresAt,
      });
      await this.auditEvent({
        eventType: "auth.password_recovery.delivered",
        result: "success",
        userId: user.id,
        challengeId: issued.challenge.id,
        context,
      });
    } catch {
      await this.auditEvent({
        eventType: "auth.password_recovery.delivery_failed",
        result: "failure",
        userId: user.id,
        challengeId: issued.challenge.id,
        reason: "mail_delivery_failed",
        context,
      });
    }

    return { status: "accepted" };
  }

  async verify(emailInput: string, code: string, context: RecoveryContext = {}): Promise<
    | { status: "verified"; resetToken: string; expiresAt: Date }
    | { status: "rejected"; reason: OtpRejectReason | "account_unavailable" }
    | { status: "rate_limited" }
  > {
    const now = context.now ?? new Date();
    const email = canonicalEmail(emailInput);
    if (!this.allowed("verify", email, context, now)) {
      await this.auditEvent({ eventType: "auth.password_recovery.rate_limited", result: "blocked", reason: "verify", context });
      return { status: "rate_limited" };
    }

    const user = await this.repository.findByEmail(email);
    if (!user || user.status !== "active") {
      await this.auditEvent({ eventType: "auth.password_recovery.verify_rejected", result: "failure", reason: "account_unavailable", context });
      return { status: "rejected", reason: "account_unavailable" };
    }

    const verified = await this.otp.verify(code, {
      userId: user.id,
      sessionId: null,
      purpose: "password_recovery",
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      now,
    });
    if (verified.status !== "verified" || !verified.challenge.consumedAt) {
      return { status: "rejected", reason: verified.status === "rejected" ? verified.reason : "invalid" };
    }

    const grant = signPasswordRecoveryGrant({
      userId: user.id,
      challengeId: verified.challenge.id,
      verifiedAt: verified.challenge.consumedAt,
      secret: this.options.recoveryTokenSecret,
      ttlMs: this.options.recoveryGrantTtlMs,
      now,
    });
    await this.auditEvent({
      eventType: "auth.password_recovery.grant_issued",
      result: "success",
      userId: user.id,
      challengeId: verified.challenge.id,
      context,
    });
    return { status: "verified", resetToken: grant.token, expiresAt: grant.expiresAt };
  }

  async reset(resetToken: string, password: string, context: RecoveryContext = {}): Promise<
    | { status: "reset" }
    | { status: "invalid_grant" }
    | { status: "invalid_password"; reason: Exclude<PasswordStrengthResult, { ok: true }>["reason"] }
    | { status: "rate_limited" }
  > {
    const now = context.now ?? new Date();
    if (!this.allowed("reset", resetToken.slice(0, 24), context, now)) {
      await this.auditEvent({ eventType: "auth.password_recovery.rate_limited", result: "blocked", reason: "reset", context });
      return { status: "rate_limited" };
    }

    const strength = this.passwords.validate(password);
    if (!strength.ok) return { status: "invalid_password", reason: strength.reason };

    const claims = verifyPasswordRecoveryGrant(resetToken, this.options.recoveryTokenSecret, now);
    if (!claims) {
      await this.auditEvent({ eventType: "auth.password_recovery.reset_rejected", result: "failure", reason: "invalid_grant", context });
      return { status: "invalid_grant" };
    }

    const passwordHash = await this.passwords.hash(password);
    const completed = await this.repository.completeReset({
      userId: claims.sub,
      challengeId: claims.cid,
      verifiedAt: claims.verifiedAt,
      passwordHash,
      completedAt: now,
    });
    if (!completed) {
      await this.auditEvent({
        eventType: "auth.password_recovery.reset_rejected",
        result: "blocked",
        userId: claims.sub,
        challengeId: claims.cid,
        reason: "grant_redeemed_or_invalid",
        context,
      });
      return { status: "invalid_grant" };
    }

    await this.auditEvent({
      eventType: "auth.password_recovery.completed",
      result: "success",
      userId: claims.sub,
      challengeId: claims.cid,
      context,
    });
    return { status: "reset" };
  }
}

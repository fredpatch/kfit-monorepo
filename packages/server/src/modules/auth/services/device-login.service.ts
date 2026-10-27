import type { AuthMailDelivery } from "./auth-mail.delivery.js";
import type {
  AuthUserRecord,
  AuthUserRepository,
} from "./auth-route.service.js";
import type { RecordAuditEventInput } from "./audit.service.js";
import {
  digestDeviceToken,
  parseLoginChallenge,
  signLoginChallenge,
  verifyLoginChallengeBinding,
} from "./crypto/device-token.crypto.js";
import { deviceLabel } from "./device-label.js";
import {
  LOGIN_OTP_MAX_RESENDS,
  type LoginRateLimits,
} from "./login-rate-limits.js";
import type {
  OtpAuditRecorder,
  OtpChallengeRecord,
  OtpChallengeService,
  OtpRejectReason,
} from "./otp-challenge.service.js";

/** SEC-02 E3: the OTP purpose of a login from an untrusted device. */
export const LOGIN_OTP_PURPOSE = "suspicious_device_login";

export type TrustedDeviceRecord = {
  id: string;
  userId: string;
  deviceHash: string;
  label: string | null;
  trustedUntil: Date;
  lastUsedAt: Date;
};

export type TrustedDeviceRepository = {
  findActive(input: {
    userId: string;
    deviceHash: string;
    now: Date;
  }): Promise<TrustedDeviceRecord | null>;
  markUsed(input: { deviceId: string; usedAt: Date }): Promise<void>;
  trust(input: {
    userId: string;
    deviceHash: string;
    label: string;
    trustedUntil: Date;
    now: Date;
  }): Promise<TrustedDeviceRecord>;
  listActive(input: {
    userId: string;
    now: Date;
  }): Promise<TrustedDeviceRecord[]>;
  /** Without `deviceId`: every active device of the user. Returns the ids actually revoked. */
  revoke(input: {
    userId: string;
    deviceId?: string;
    revokedAt: Date;
  }): Promise<string[]>;
};

export type LoginChallengeRepository = {
  findById(challengeId: string): Promise<OtpChallengeRecord | null>;
};

export type DeviceLoginContext = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
};

export type DeviceLoginServiceOptions = {
  devicePepper: string;
  /** SEC-02 E4: TRUSTED_DEVICE_TTL_DAYS 30 - AUTH_TRUSTED_DEVICE_TTL_MS, default 30 days (auth.config.ts). */
  trustedDeviceTtlMs: number;
  otpTtlMs: number;
};

export type DeviceRevokeReason = "user" | "password_reset" | "logout_all";

export type LoginChallengeIssued = {
  status: "otp_required";
  challengeId: string;
  expiresAt: Date;
};

export type IssueLoginChallengeResult =
  | LoginChallengeIssued
  | { status: "rate_limited" }
  | { status: "delivery_failed" };

export type VerifyLoginChallengeResult =
  | { status: "verified"; userId: string; deviceHash: string }
  | { status: "rejected"; reason: OtpRejectReason };

export type ResendLoginChallengeResult =
  | IssueLoginChallengeResult
  | { status: "rejected"; reason: OtpRejectReason };

export type TrustedDeviceView = TrustedDeviceRecord & { current: boolean };

type ResolvedChallenge = {
  challenge: OtpChallengeRecord & { userId: string };
  resends: number;
  deviceHash: string;
};

/**
 * SEC-02a: the second factor of a login from an untrusted device (contract « Login and suspicious device »).
 * The device is the kfit_device cookie; only its keyed hash is stored. The OTP goes by e-mail only (V1, Fred).
 */
export class DeviceLoginService {
  constructor(
    private readonly devices: TrustedDeviceRepository,
    private readonly challenges: LoginChallengeRepository,
    private readonly otp: Pick<OtpChallengeService, "issue" | "verify">,
    private readonly users: Pick<AuthUserRepository, "findById">,
    private readonly mail: Pick<AuthMailDelivery, "sendLoginCode"> | null,
    private readonly audit: OtpAuditRecorder,
    private readonly limits: LoginRateLimits,
    private readonly options: DeviceLoginServiceOptions,
  ) {}

  deviceHash(deviceToken: string): string {
    return digestDeviceToken(deviceToken, this.options.devicePepper);
  }

  allowLoginAttempt(ipAddress: string | null | undefined, now: Date): boolean {
    return this.limits.loginAttempt(ipAddress ?? "", now.getTime());
  }

  allowVerifyAttempt(ipAddress: string | null | undefined, now: Date): boolean {
    return this.limits.verifyAttempt(ipAddress ?? "", now.getTime());
  }

  /** SEC-02 E5: an active, unexpired row of THIS user; last_used_at moves, trusted_until never does. */
  async useTrustedDevice(
    userId: string,
    deviceToken: string | null,
    context: DeviceLoginContext,
  ): Promise<TrustedDeviceRecord | null> {
    if (!deviceToken) return null;
    const now = context.now ?? new Date();
    const device = await this.devices.findActive({
      userId,
      deviceHash: this.deviceHash(deviceToken),
      now,
    });
    if (!device) return null;
    await this.devices.markUsed({ deviceId: device.id, usedAt: now });
    await this.record("auth.device.used", "success", userId, context, {
      entityType: "trusted_device",
      entityId: device.id,
      metadata: { deviceId: device.id },
    });
    return device;
  }

  async issueChallenge(
    user: AuthUserRecord,
    deviceToken: string,
    context: DeviceLoginContext,
    resends = 0,
  ): Promise<IssueLoginChallengeResult> {
    const now = context.now ?? new Date();
    if (resends === 0 && !this.limits.otpIssue(user.id, now.getTime()))
      return { status: "rate_limited" };
    if (!this.mail) {
      await this.record(
        "auth.otp.delivery_failed",
        "failure",
        user.id,
        context,
        {
          metadata: {
            purpose: LOGIN_OTP_PURPOSE,
            reason: "mail_not_configured",
          },
        },
      );
      return { status: "delivery_failed" };
    }

    const issued = await this.otp.issue({
      userId: user.id,
      sessionId: null,
      purpose: LOGIN_OTP_PURPOSE,
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      now,
    });
    try {
      await this.mail.sendLoginCode({
        to: user.email,
        code: issued.code,
        expiresAt: issued.challenge.expiresAt,
        validityMinutes: Math.round(this.options.otpTtlMs / 60_000),
      });
    } catch {
      await this.record(
        "auth.otp.delivery_failed",
        "failure",
        user.id,
        context,
        {
          entityType: "otp_challenge",
          entityId: issued.challenge.id,
          metadata: {
            purpose: LOGIN_OTP_PURPOSE,
            reason: "mail_delivery_failed",
          },
        },
      );
      return { status: "delivery_failed" };
    }

    await this.record(
      resends === 0 ? "auth.login.otp_required" : "auth.login.otp_resent",
      "success",
      user.id,
      context,
      {
        entityType: "otp_challenge",
        entityId: issued.challenge.id,
        metadata: { resends },
      },
    );
    return {
      status: "otp_required",
      challengeId: signLoginChallenge(
        {
          challengeId: issued.challenge.id,
          resends,
          userId: user.id,
          deviceHash: this.deviceHash(deviceToken),
        },
        this.options.devicePepper,
      ),
      expiresAt: issued.challenge.expiresAt,
    };
  }

  async verifyChallenge(
    publicChallengeId: string,
    code: string,
    deviceToken: string | null,
    context: DeviceLoginContext,
  ): Promise<VerifyLoginChallengeResult> {
    const resolved = await this.resolve(publicChallengeId, deviceToken);
    if (!resolved) {
      await this.record("auth.login.otp_failed", "failure", null, context, {
        metadata: { reason: "not_found" },
      });
      return { status: "rejected", reason: "not_found" };
    }

    const { challenge } = resolved;
    const result = await this.otp.verify(code, {
      userId: challenge.userId,
      sessionId: null,
      purpose: LOGIN_OTP_PURPOSE,
      challengeId: challenge.id,
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      ...(context.now ? { now: context.now } : {}),
    });

    if (result.status === "rejected") {
      const locked = result.reason === "locked";
      await this.record(
        locked ? "auth.login.otp_locked" : "auth.login.otp_failed",
        locked ? "blocked" : "failure",
        challenge.userId,
        context,
        {
          entityType: "otp_challenge",
          entityId: challenge.id,
          metadata: { reason: result.reason },
        },
      );
      return { status: "rejected", reason: result.reason };
    }

    await this.record(
      "auth.login.otp_succeeded",
      "success",
      challenge.userId,
      context,
      { entityType: "otp_challenge", entityId: challenge.id },
    );
    return {
      status: "verified",
      userId: challenge.userId,
      deviceHash: resolved.deviceHash,
    };
  }

  /** SEC-02 E3: a new code supersedes the previous one; LOGIN_OTP_MAX_RESENDS per challenge, LOGIN_RESENDS_PER_ACCOUNT per window. */
  async resendChallenge(
    publicChallengeId: string,
    deviceToken: string | null,
    context: DeviceLoginContext,
  ): Promise<ResendLoginChallengeResult> {
    const resolved = await this.resolve(publicChallengeId, deviceToken);
    if (!resolved || !deviceToken)
      return { status: "rejected", reason: "not_found" };

    const { challenge, resends } = resolved;
    if (challenge.consumedAt) return { status: "rejected", reason: "consumed" };
    if (challenge.supersededAt)
      return { status: "rejected", reason: "superseded" };
    if (challenge.attemptCount >= challenge.maxAttempts)
      return { status: "rejected", reason: "locked" };
    if (resends >= LOGIN_OTP_MAX_RESENDS) return { status: "rate_limited" };
    if (
      !this.limits.resend(
        challenge.userId,
        (context.now ?? new Date()).getTime(),
      )
    )
      return { status: "rate_limited" };

    const user = await this.users.findById(challenge.userId);
    if (!user || user.status !== "active")
      return { status: "rejected", reason: "not_found" };
    return this.issueChallenge(user, deviceToken, context, resends + 1);
  }

  /** SEC-02 E4: an explicit choice at verification; the label is derived, the full User-Agent is never stored. */
  async trust(
    userId: string,
    deviceHash: string,
    context: DeviceLoginContext,
  ): Promise<TrustedDeviceRecord> {
    const now = context.now ?? new Date();
    const device = await this.devices.trust({
      userId,
      deviceHash,
      label: deviceLabel(context.userAgent),
      trustedUntil: new Date(now.getTime() + this.options.trustedDeviceTtlMs),
      now,
    });
    await this.record("auth.device.trusted", "success", userId, context, {
      entityType: "trusted_device",
      entityId: device.id,
      metadata: { deviceId: device.id },
    });
    return device;
  }

  async list(
    userId: string,
    deviceToken: string | null,
    now: Date = new Date(),
  ): Promise<TrustedDeviceView[]> {
    const currentHash = deviceToken ? this.deviceHash(deviceToken) : null;
    const devices = await this.devices.listActive({ userId, now });
    return devices.map((device) => ({
      ...device,
      current: device.deviceHash === currentHash,
    }));
  }

  /** SEC-02 E6: revoking never ends the current session; the device just needs a code at its next login. */
  async revoke(
    userId: string,
    deviceId: string | null,
    reason: DeviceRevokeReason,
    context: DeviceLoginContext,
  ): Promise<string[]> {
    const revokedAt = context.now ?? new Date();
    const revoked = await this.devices.revoke({
      userId,
      revokedAt,
      ...(deviceId ? { deviceId } : {}),
    });
    for (const id of revoked) {
      await this.record("auth.device.revoked", "success", userId, context, {
        entityType: "trusted_device",
        entityId: id,
        metadata: { deviceId: id, reason },
      });
    }
    return revoked;
  }

  private async resolve(
    publicChallengeId: string,
    deviceToken: string | null,
  ): Promise<ResolvedChallenge | null> {
    const claims = parseLoginChallenge(publicChallengeId);
    if (!claims || !deviceToken) return null;
    const challenge = await this.challenges.findById(claims.challengeId);
    if (
      !challenge ||
      challenge.purpose !== LOGIN_OTP_PURPOSE ||
      !challenge.userId
    )
      return null;
    const deviceHash = this.deviceHash(deviceToken);
    if (
      !verifyLoginChallengeBinding(
        claims,
        { userId: challenge.userId, deviceHash },
        this.options.devicePepper,
      )
    )
      return null;
    return {
      challenge: { ...challenge, userId: challenge.userId },
      resends: claims.resends,
      deviceHash,
    };
  }

  private async record(
    eventType: string,
    result: RecordAuditEventInput["result"],
    userId: string | null,
    context: DeviceLoginContext,
    details: {
      entityType?: string;
      entityId?: string;
      metadata?: RecordAuditEventInput["metadata"];
    } = {},
  ): Promise<void> {
    await this.audit.record({
      actorType: userId ? "user" : "anonymous",
      actorUserId: userId,
      eventType,
      entityType: details.entityType ?? "user",
      entityId: details.entityId ?? userId,
      result,
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata: details.metadata ?? null,
    });
  }
}

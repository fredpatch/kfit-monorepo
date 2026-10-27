import type { AuthMailDelivery } from "./auth-mail.delivery.js";
import type { AuthUserRepository } from "./auth-route.service.js";
import type {
  OtpAuditRecorder,
  OtpChallengeRecord,
  OtpChallengeService,
} from "./otp-challenge.service.js";

export type SensitiveActionOtpContext = {
  userId: string;
  sessionId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SensitiveActionOtpResult =
  | { status: "sent"; challenge: OtpChallengeRecord }
  | { status: "delivery_failed" };

/** Issues the sensitive-action OTP and e-mails it to the session's user (UX-14c). The code never leaves this service otherwise. */
export class SensitiveActionOtpService {
  constructor(
    private readonly otp: Pick<OtpChallengeService, "issue">,
    private readonly users: Pick<AuthUserRepository, "findById">,
    private readonly mail: Pick<AuthMailDelivery, "sendSensitiveActionCode">,
    private readonly audit: OtpAuditRecorder,
  ) {}

  async request(
    context: SensitiveActionOtpContext,
  ): Promise<SensitiveActionOtpResult> {
    const user = await this.users.findById(context.userId);
    if (!user || user.status !== "active") {
      await this.auditEvent(
        "auth.otp.delivery_failed",
        "failure",
        context,
        null,
        "account_unavailable",
      );
      return { status: "delivery_failed" };
    }

    const issued = await this.otp.issue({
      userId: context.userId,
      sessionId: context.sessionId,
      purpose: "sensitive_action",
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    try {
      await this.mail.sendSensitiveActionCode({
        to: user.email,
        code: issued.code,
        expiresAt: issued.challenge.expiresAt,
      });
    } catch {
      await this.auditEvent(
        "auth.otp.delivery_failed",
        "failure",
        context,
        issued.challenge.id,
        "mail_delivery_failed",
      );
      return { status: "delivery_failed" };
    }

    await this.auditEvent(
      "auth.otp.delivered",
      "success",
      context,
      issued.challenge.id,
    );
    return { status: "sent", challenge: issued.challenge };
  }

  private async auditEvent(
    eventType: string,
    result: "success" | "failure",
    context: SensitiveActionOtpContext,
    challengeId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.audit.record({
      actorType: "user",
      actorUserId: context.userId,
      eventType,
      entityType: challengeId ? "otp_challenge" : "user",
      entityId: challengeId ?? context.userId,
      result,
      requestId: context.requestId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata: { purpose: "sensitive_action", ...(reason ? { reason } : {}) },
    });
  }
}

import type {
  OtpChallengeService,
  OtpRejectReason,
} from "../services/otp-challenge.service.js";
import { bootstrapTokenHeaderName } from "@kfit/shared";
import { authCookieNames } from "../middleware/auth.cookies.js";
import { parseDeviceToken } from "../services/crypto/device-token.crypto.js";
import type { DeviceLoginService } from "../services/device-login.service.js";
import type { AuthRouteService } from "../services/auth-route.service.js";
import type { BootstrapService } from "../services/bootstrap.service.js";
import type { PasswordRecoveryService } from "../services/password-recovery.service.js";
import type { SensitiveActionOtpService } from "../services/sensitive-action-otp.service.js";
import { requireAuthenticatedSession } from "../middleware/auth.middleware.js";
import type {
  AuthHttpRequestContext,
  HttpJsonResponse,
} from "../types/auth.http.types.js";

export type AuthControllerDeps = {
  otpChallengeService: Pick<OtpChallengeService, "issue" | "verify">;
  authRouteService?: Pick<
    AuthRouteService,
    "login" | "verifyLogin" | "resendLoginOtp" | "refresh" | "logout"
  >;
  trustedDeviceService?: Pick<DeviceLoginService, "list" | "revoke">;
  bootstrapService?: Pick<BootstrapService, "status" | "create">;
  passwordRecoveryService?: Pick<
    PasswordRecoveryService,
    "request" | "verify" | "reset"
  >;
  sensitiveActionOtpService?: Pick<SensitiveActionOtpService, "request">;
};

const otpRejectedStatus: Record<OtpRejectReason, number> = {
  not_found: 404,
  invalid: 400,
  expired: 410,
  consumed: 409,
  superseded: 409,
  locked: 423,
};

const otpRejected = (reason: OtpRejectReason): HttpJsonResponse => ({
  status: otpRejectedStatus[reason],
  body: { error: "AUTH_OTP_REJECTED", reason },
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** SEC-02 E3: the public challenge id is `<uuid>.<resends>.<mac>`, far below this bound. */
const CHALLENGE_ID_MAX_LENGTH = 200;
const isChallengeId = (value: unknown): value is string =>
  typeof value === "string" &&
  value !== "" &&
  value.length <= CHALLENGE_ID_MAX_LENGTH;

export class AuthController {
  constructor(private readonly deps: AuthControllerDeps) {}

  async bootstrapStatus(): Promise<HttpJsonResponse> {
    if (!this.deps.bootstrapService) {
      return {
        status: 501,
        body: { error: "AUTH_BOOTSTRAP_SERVICE_NOT_BOUND" },
      };
    }

    return { status: 200, body: await this.deps.bootstrapService.status() };
  }

  async bootstrap(
    context: AuthHttpRequestContext,
    body: { email?: unknown; password?: unknown },
  ): Promise<HttpJsonResponse> {
    if (!this.deps.bootstrapService) {
      return {
        status: 501,
        body: { error: "AUTH_BOOTSTRAP_SERVICE_NOT_BOUND" },
      };
    }

    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.email.trim() === "" ||
      body.password === ""
    ) {
      return { status: 400, body: { error: "AUTH_BOOTSTRAP_INVALID_FORMAT" } };
    }

    const result = await this.deps.bootstrapService.create({
      email: body.email,
      password: body.password,
      token: context.headers[bootstrapTokenHeaderName],
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    if (result.status === "already_completed") {
      return { status: 409, body: { error: "BOOTSTRAP_ALREADY_COMPLETED" } };
    }
    if (result.status === "rate_limited")
      return { status: 429, body: { error: "AUTH_RATE_LIMITED" } };
    if (result.status === "disabled")
      return { status: 403, body: { error: "BOOTSTRAP_DISABLED" } };
    if (result.status === "token_invalid")
      return { status: 403, body: { error: "BOOTSTRAP_TOKEN_INVALID" } };

    if (result.status === "invalid_password") {
      return {
        status: 400,
        body: { error: "AUTH_PASSWORD_POLICY_FAILED", reason: result.reason },
      };
    }

    return {
      status: 201,
      body: {
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          status: result.user.status,
        },
      },
    };
  }

  async login(
    context: AuthHttpRequestContext,
    body: { email?: unknown; password?: unknown },
  ): Promise<HttpJsonResponse> {
    if (!this.deps.authRouteService) {
      return { status: 501, body: { error: "AUTH_ROUTE_SERVICE_NOT_BOUND" } };
    }

    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.email.trim() === "" ||
      body.password === ""
    ) {
      return { status: 400, body: { error: "AUTH_LOGIN_INVALID_FORMAT" } };
    }

    const result = await this.deps.authRouteService.login({
      email: body.email,
      password: body.password,
      deviceCookie: context.cookies[authCookieNames.device],
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    switch (result.status) {
      case "authenticated":
        return { status: 200, body: result.body, cookies: result.cookies };
      case "otp_required":
        return {
          status: 202,
          body: {
            status: "otp_required",
            challengeId: result.challengeId,
            expiresAt: result.expiresAt.toISOString(),
          },
          cookies: result.cookies,
        };
      case "rate_limited":
        return { status: 429, body: { error: "AUTH_RATE_LIMITED" } };
      case "delivery_failed":
        return { status: 503, body: { error: "AUTH_OTP_DELIVERY_FAILED" } };
      case "rejected":
        return {
          status: result.reason === "account_unavailable" ? 403 : 401,
          body: {
            error:
              result.reason === "account_unavailable"
                ? "AUTH_ACCOUNT_UNAVAILABLE"
                : "AUTH_INVALID_CREDENTIALS",
          },
        };
    }
  }

  async verifyLogin(
    context: AuthHttpRequestContext,
    body: { challengeId?: unknown; code?: unknown; trustDevice?: unknown },
  ): Promise<HttpJsonResponse> {
    if (!this.deps.authRouteService) {
      return { status: 501, body: { error: "AUTH_ROUTE_SERVICE_NOT_BOUND" } };
    }
    if (
      !isChallengeId(body.challengeId) ||
      typeof body.trustDevice !== "boolean"
    ) {
      return { status: 400, body: { error: "AUTH_LOGIN_INVALID_FORMAT" } };
    }
    if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
      return { status: 400, body: { error: "AUTH_OTP_CODE_INVALID_FORMAT" } };
    }

    const result = await this.deps.authRouteService.verifyLogin({
      challengeId: body.challengeId,
      code: body.code,
      trustDevice: body.trustDevice,
      deviceCookie: context.cookies[authCookieNames.device],
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    switch (result.status) {
      case "authenticated":
        return { status: 200, body: result.body, cookies: result.cookies };
      case "otp_rejected":
        return otpRejected(result.reason);
      case "rate_limited":
        return { status: 429, body: { error: "AUTH_RATE_LIMITED" } };
      case "rejected":
        return { status: 403, body: { error: "AUTH_ACCOUNT_UNAVAILABLE" } };
    }
  }

  async resendLoginOtp(
    context: AuthHttpRequestContext,
    body: { challengeId?: unknown },
  ): Promise<HttpJsonResponse> {
    if (!this.deps.authRouteService) {
      return { status: 501, body: { error: "AUTH_ROUTE_SERVICE_NOT_BOUND" } };
    }
    if (!isChallengeId(body.challengeId)) {
      return { status: 400, body: { error: "AUTH_LOGIN_INVALID_FORMAT" } };
    }

    const result = await this.deps.authRouteService.resendLoginOtp({
      challengeId: body.challengeId,
      deviceCookie: context.cookies[authCookieNames.device],
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    switch (result.status) {
      case "otp_required":
        return {
          status: 202,
          body: {
            status: "otp_required",
            challengeId: result.challengeId,
            expiresAt: result.expiresAt.toISOString(),
          },
        };
      case "otp_rejected":
        return otpRejected(result.reason);
      case "rate_limited":
        return { status: 429, body: { error: "AUTH_RATE_LIMITED" } };
      case "delivery_failed":
        return { status: 503, body: { error: "AUTH_OTP_DELIVERY_FAILED" } };
    }
  }

  async listTrustedDevices(
    context: AuthHttpRequestContext,
  ): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!this.deps.trustedDeviceService)
      return { status: 501, body: { error: "AUTH_DEVICE_SERVICE_NOT_BOUND" } };

    const devices = await this.deps.trustedDeviceService.list(
      auth.session.userId,
      parseDeviceToken(context.cookies[authCookieNames.device]),
    );
    return {
      status: 200,
      body: {
        devices: devices.map((device) => ({
          id: device.id,
          label: device.label,
          lastUsedAt: device.lastUsedAt.toISOString(),
          trustedUntil: device.trustedUntil.toISOString(),
          current: device.current,
        })),
      },
    };
  }

  async revokeTrustedDevice(
    context: AuthHttpRequestContext,
  ): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!this.deps.trustedDeviceService)
      return { status: 501, body: { error: "AUTH_DEVICE_SERVICE_NOT_BOUND" } };

    const deviceId = context.params?.id;
    if (!deviceId || !UUID_PATTERN.test(deviceId))
      return { status: 404, body: { error: "AUTH_DEVICE_NOT_FOUND" } };
    const revoked = await this.deps.trustedDeviceService.revoke(
      auth.session.userId,
      deviceId,
      "user",
      {
        requestId: context.requestId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    );
    return revoked.length
      ? { status: 200, body: { revoked: true } }
      : { status: 404, body: { error: "AUTH_DEVICE_NOT_FOUND" } };
  }

  async revokeAllTrustedDevices(
    context: AuthHttpRequestContext,
  ): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;
    if (!this.deps.trustedDeviceService)
      return { status: 501, body: { error: "AUTH_DEVICE_SERVICE_NOT_BOUND" } };

    const revoked = await this.deps.trustedDeviceService.revoke(
      auth.session.userId,
      null,
      "user",
      {
        requestId: context.requestId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    );
    return { status: 200, body: { revokedCount: revoked.length } };
  }

  async refresh(context: AuthHttpRequestContext): Promise<HttpJsonResponse> {
    if (!this.deps.authRouteService) {
      return { status: 501, body: { error: "AUTH_ROUTE_SERVICE_NOT_BOUND" } };
    }

    const result = await this.deps.authRouteService.refresh(
      context.cookies[authCookieNames.refreshToken],
      {
        requestId: context.requestId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    );

    if (result.status !== "authenticated") {
      return { status: 401, body: { error: "AUTH_REFRESH_INVALID" } };
    }

    return { status: 200, body: result.body, cookies: result.cookies };
  }

  async logout(context: AuthHttpRequestContext): Promise<HttpJsonResponse> {
    if (!this.deps.authRouteService) {
      return { status: 501, body: { error: "AUTH_ROUTE_SERVICE_NOT_BOUND" } };
    }

    const result = await this.deps.authRouteService.logout({
      sessionId: context.session?.sessionId ?? null,
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    return { status: 200, body: { loggedOut: true }, cookies: result.cookies };
  }

  currentSession(context: AuthHttpRequestContext): HttpJsonResponse {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;

    return {
      status: 200,
      body: {
        user: {
          id: auth.session.userId,
          role: auth.session.role,
        },
        session: {
          id: auth.session.sessionId,
          freshOtp: Boolean(auth.session.freshOtpConsumedAt),
        },
      },
    };
  }

  async requestPasswordRecovery(
    context: AuthHttpRequestContext,
    body: { email?: unknown },
  ): Promise<HttpJsonResponse> {
    if (!this.deps.passwordRecoveryService) {
      return {
        status: 501,
        body: { error: "AUTH_RECOVERY_SERVICE_NOT_BOUND" },
      };
    }
    if (typeof body.email !== "string" || body.email.trim() === "") {
      return { status: 400, body: { error: "AUTH_RECOVERY_INVALID_FORMAT" } };
    }

    const result = await this.deps.passwordRecoveryService.request(body.email, {
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    if (result.status === "rate_limited") {
      return { status: 429, body: { error: "AUTH_RATE_LIMITED" } };
    }
    return { status: 202, body: { accepted: true } };
  }

  async verifyPasswordRecovery(
    context: AuthHttpRequestContext,
    body: { email?: unknown; code?: unknown },
  ): Promise<HttpJsonResponse> {
    if (!this.deps.passwordRecoveryService) {
      return {
        status: 501,
        body: { error: "AUTH_RECOVERY_SERVICE_NOT_BOUND" },
      };
    }
    if (
      typeof body.email !== "string" ||
      body.email.trim() === "" ||
      typeof body.code !== "string" ||
      !/^\d{6}$/.test(body.code)
    ) {
      return { status: 400, body: { error: "AUTH_RECOVERY_INVALID_FORMAT" } };
    }

    const result = await this.deps.passwordRecoveryService.verify(
      body.email,
      body.code,
      {
        requestId: context.requestId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    );
    if (result.status === "rate_limited") {
      return { status: 429, body: { error: "AUTH_RATE_LIMITED" } };
    }
    if (result.status !== "verified") {
      return { status: 400, body: { error: "AUTH_RECOVERY_CODE_INVALID" } };
    }
    return {
      status: 200,
      body: {
        resetToken: result.resetToken,
        expiresAt: result.expiresAt.toISOString(),
      },
    };
  }

  async resetPassword(
    context: AuthHttpRequestContext,
    body: { resetToken?: unknown; password?: unknown },
  ): Promise<HttpJsonResponse> {
    if (!this.deps.passwordRecoveryService) {
      return {
        status: 501,
        body: { error: "AUTH_RECOVERY_SERVICE_NOT_BOUND" },
      };
    }
    if (
      typeof body.resetToken !== "string" ||
      body.resetToken === "" ||
      typeof body.password !== "string" ||
      body.password === ""
    ) {
      return { status: 400, body: { error: "AUTH_RECOVERY_INVALID_FORMAT" } };
    }

    const result = await this.deps.passwordRecoveryService.reset(
      body.resetToken,
      body.password,
      {
        requestId: context.requestId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    );
    if (result.status === "rate_limited") {
      return { status: 429, body: { error: "AUTH_RATE_LIMITED" } };
    }
    if (result.status === "invalid_password") {
      return {
        status: 400,
        body: { error: "AUTH_PASSWORD_POLICY_FAILED", reason: result.reason },
      };
    }
    if (result.status === "invalid_grant") {
      return { status: 400, body: { error: "AUTH_RECOVERY_GRANT_INVALID" } };
    }
    return { status: 200, body: { reset: true } };
  }

  async requestSensitiveActionOtp(
    context: AuthHttpRequestContext,
  ): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;

    if (!this.deps.sensitiveActionOtpService) {
      return { status: 501, body: { error: "AUTH_OTP_DELIVERY_NOT_BOUND" } };
    }

    const result = await this.deps.sensitiveActionOtpService.request({
      userId: auth.session.userId,
      sessionId: auth.session.sessionId,
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    if (result.status === "delivery_failed") {
      return { status: 503, body: { error: "AUTH_OTP_DELIVERY_FAILED" } };
    }

    return {
      status: 202,
      body: {
        challengeId: result.challenge.id,
        deliveryChannel: result.challenge.deliveryChannel,
        expiresAt: result.challenge.expiresAt.toISOString(),
      },
    };
  }

  async verifySensitiveActionOtp(
    context: AuthHttpRequestContext,
    body: { code?: unknown },
  ): Promise<HttpJsonResponse> {
    const auth = requireAuthenticatedSession(context);
    if (!auth.ok) return auth.response;

    if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
      return { status: 400, body: { error: "AUTH_OTP_CODE_INVALID_FORMAT" } };
    }

    const result = await this.deps.otpChallengeService.verify(body.code, {
      userId: auth.session.userId,
      sessionId: auth.session.sessionId,
      purpose: "sensitive_action",
      requestId: context.requestId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });

    if (result.status === "verified") {
      return {
        status: 200,
        body: {
          verified: true,
          challengeId: result.challenge.id,
          consumedAt: result.challenge.consumedAt?.toISOString() ?? null,
        },
      };
    }

    return otpRejected(result.reason);
  }
}

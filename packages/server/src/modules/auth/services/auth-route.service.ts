import type { AuthCookieMode } from "../middleware/auth.cookies.js";
import { authCookieNames, authCookieOptions, csrfCookieOptions, DEVICE_COOKIE_MAX_AGE_SECONDS, generateCsrfToken } from "../middleware/auth.cookies.js";
import { generateDeviceToken, parseDeviceToken } from "./crypto/device-token.crypto.js";
import { signAccessToken } from "./crypto/jwt.crypto.js";
import type { RecordAuditEventInput } from "./audit.service.js";
import type { DeviceLoginService } from "./device-login.service.js";
import type { OtpRejectReason } from "./otp-challenge.service.js";
import type { AuthSessionRecord, SessionService } from "./session.service.js";
import type { AuthCookieOptions } from "../types/auth.http.types.js";

export type AuthUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  status: "active" | "locked" | "archived";
  role: "admin" | "coach";
};

export type AuthUserRepository = {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  findById(userId: string): Promise<AuthUserRecord | null>;
};

export type PasswordVerifier = (input: { password: string; passwordHash: string }) => Promise<boolean> | boolean;

export type AuthAuditRecorder = {
  record(input: RecordAuditEventInput): Promise<unknown>;
};

export type AuthSessionService = Pick<SessionService, "createSession" | "rotateRefreshToken" | "revokeSession">;

export type AuthRouteServiceOptions = {
  accessTokenSecret: string;
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  cookieMode: AuthCookieMode;
};

export type AuthRouteContext = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
};

export type AuthCookie = {
  name: string;
  value: string;
  options: AuthCookieOptions;
};

export type AuthenticatedPayload = {
  user: {
    id: string;
    role: "admin" | "coach";
  };
  session: {
    id: string;
    freshOtp: boolean;
  };
};

export type AuthSuccess = {
  status: "authenticated";
  body: AuthenticatedPayload;
  cookies: AuthCookie[];
};

export type LoginRejected = { status: "rejected"; reason: "invalid_credentials" | "account_unavailable" };

/** SEC-02 E1: no auth cookie; only the kfit_device cookie when the browser had none. */
export type LoginOtpRequired = { status: "otp_required"; challengeId: string; expiresAt: Date; cookies: AuthCookie[] };

export type LoginResult = AuthSuccess | LoginOtpRequired | LoginRejected | { status: "rate_limited" } | { status: "delivery_failed" };

export type VerifyLoginResult =
  | AuthSuccess
  | LoginRejected
  | { status: "otp_rejected"; reason: OtpRejectReason }
  | { status: "rate_limited" };

export type ResendLoginOtpResult =
  | Omit<LoginOtpRequired, "cookies">
  | { status: "otp_rejected"; reason: OtpRejectReason }
  | { status: "rate_limited" }
  | { status: "delivery_failed" };

export type LoginDeviceGate = Pick<
  DeviceLoginService,
  "allowLoginAttempt" | "allowVerifyAttempt" | "useTrustedDevice" | "issueChallenge" | "verifyChallenge" | "resendChallenge" | "trust"
>;

export type RefreshResult = AuthSuccess | { status: "invalid"; reason: "missing" | "invalid" };

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

function authSuccessBody(user: AuthUserRecord, session: AuthSessionRecord): AuthenticatedPayload {
  return {
    user: {
      id: user.id,
      role: user.role,
    },
    session: {
      id: session.id,
      freshOtp: false,
    },
  };
}

function withOptionalNow<T extends object>(input: T, now: Date | undefined): T & { now?: Date } {
  return now === undefined ? input : { ...input, now };
}

function deviceContext(input: AuthRouteContext): AuthRouteContext {
  return withOptionalNow({ requestId: input.requestId ?? null, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null }, input.now);
}

function authCookies(input: {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  options: AuthRouteServiceOptions;
}): AuthCookie[] {
  return [
    {
      name: authCookieNames.accessToken,
      value: input.accessToken,
      options: authCookieOptions(input.options.cookieMode, Math.floor(input.options.accessTokenTtlMs / 1000)),
    },
    {
      name: authCookieNames.refreshToken,
      value: input.refreshToken,
      options: authCookieOptions(input.options.cookieMode, Math.floor(input.options.refreshTokenTtlMs / 1000)),
    },
    {
      name: authCookieNames.csrfToken,
      value: input.csrfToken,
      options: csrfCookieOptions(input.options.cookieMode),
    },
  ];
}

export function clearAuthCookies(mode: AuthCookieMode): AuthCookie[] {
  return [
    { name: authCookieNames.accessToken, value: "", options: authCookieOptions(mode, 0) },
    { name: authCookieNames.refreshToken, value: "", options: authCookieOptions(mode, 0) },
    { name: authCookieNames.csrfToken, value: "", options: { ...csrfCookieOptions(mode), maxAgeSeconds: 0 } },
  ];
}

export class AuthRouteService {
  constructor(
    private readonly users: AuthUserRepository,
    private readonly sessions: AuthSessionService,
    private readonly passwordVerifier: PasswordVerifier,
    private readonly audit: AuthAuditRecorder,
    private readonly options: AuthRouteServiceOptions,
    private readonly devices: LoginDeviceGate,
  ) {}

  /**
   * Contract « Login and suspicious device »: password first. A known, active, unexpired trusted device of this user gets
   * a session (SEC-02 E5); any other device gets an e-mailed code and no session (E1). There is no bypass (E9).
   */
  async login(input: { email: string; password: string; deviceCookie?: string | undefined } & AuthRouteContext): Promise<LoginResult> {
    const context = deviceContext(input);
    if (!this.devices.allowLoginAttempt(input.ipAddress, input.now ?? new Date())) return { status: "rate_limited" };

    const email = canonicalEmail(input.email);
    const user = await this.users.findByEmail(email);
    const passwordMatches = user ? await this.passwordVerifier({ password: input.password, passwordHash: user.passwordHash }) : false;

    if (!user || !passwordMatches) {
      await this.audit.record({
        actorType: "anonymous",
        actorUserId: null,
        eventType: "auth.login.rejected",
        entityType: "user",
        result: "failure",
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: { reason: "invalid_credentials" },
      });
      return { status: "rejected", reason: "invalid_credentials" };
    }

    if (user.status !== "active") {
      await this.audit.record({
        actorType: "user",
        actorUserId: user.id,
        eventType: "auth.login.rejected",
        entityType: "user",
        entityId: user.id,
        result: "blocked",
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: { reason: "account_unavailable" },
      });
      return { status: "rejected", reason: "account_unavailable" };
    }

    const knownDevice = parseDeviceToken(input.deviceCookie);
    const trusted = await this.devices.useTrustedDevice(user.id, knownDevice, context);
    if (trusted) return this.startSession(user, trusted.id, "trusted_device", input);

    const deviceToken = knownDevice ?? generateDeviceToken();
    const challenge = await this.devices.issueChallenge(user, deviceToken, context);
    if (challenge.status !== "otp_required") return challenge;
    return {
      ...challenge,
      cookies: knownDevice ? [] : [{ name: authCookieNames.device, value: deviceToken, options: authCookieOptions(this.options.cookieMode, DEVICE_COOKIE_MAX_AGE_SECONDS) }],
    };
  }

  /** SEC-02 E4: the code from the e-mail, from the same device cookie; trusting the device is an explicit choice. */
  async verifyLogin(input: { challengeId: string; code: string; trustDevice: boolean; deviceCookie?: string | undefined } & AuthRouteContext): Promise<VerifyLoginResult> {
    const context = deviceContext(input);
    if (!this.devices.allowVerifyAttempt(input.ipAddress, input.now ?? new Date())) return { status: "rate_limited" };

    const verified = await this.devices.verifyChallenge(input.challengeId, input.code, parseDeviceToken(input.deviceCookie), context);
    if (verified.status === "rejected") return { status: "otp_rejected", reason: verified.reason };

    const user = await this.users.findById(verified.userId);
    if (!user || user.status !== "active") return { status: "rejected", reason: "account_unavailable" };

    const trustedDeviceId = input.trustDevice ? (await this.devices.trust(user.id, verified.deviceHash, context)).id : null;
    return this.startSession(user, trustedDeviceId, "otp", input);
  }

  async resendLoginOtp(input: { challengeId: string; deviceCookie?: string | undefined } & AuthRouteContext): Promise<ResendLoginOtpResult> {
    const resent = await this.devices.resendChallenge(input.challengeId, parseDeviceToken(input.deviceCookie), deviceContext(input));
    return resent.status === "rejected" ? { status: "otp_rejected", reason: resent.reason } : resent;
  }

  private async startSession(user: AuthUserRecord, trustedDeviceId: string | null, method: "trusted_device" | "otp", input: AuthRouteContext): Promise<AuthSuccess> {
    const created = await this.sessions.createSession(withOptionalNow({
      userId: user.id,
      trustedDeviceId,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    }, input.now));

    await this.audit.record({
      actorType: "user",
      actorUserId: user.id,
      eventType: "auth.login.succeeded",
      entityType: "auth_session",
      entityId: created.session.id,
      result: "success",
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { role: user.role, method },
    });

    const accessToken = signAccessToken(withOptionalNow({
      userId: user.id,
      sessionId: created.session.id,
      role: user.role,
      secret: this.options.accessTokenSecret,
      ttlMs: this.options.accessTokenTtlMs,
    }, input.now));

    return {
      status: "authenticated",
      body: authSuccessBody(user, created.session),
      cookies: authCookies({
        accessToken,
        refreshToken: created.refreshToken,
        csrfToken: generateCsrfToken(),
        options: this.options,
      }),
    };
  }

  async refresh(refreshToken: string | undefined, input: AuthRouteContext = {}): Promise<RefreshResult> {
    if (!refreshToken) return { status: "invalid", reason: "missing" };

    const rotated = await this.sessions.rotateRefreshToken(refreshToken, withOptionalNow({
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    }, input.now));

    if (rotated.status !== "rotated") {
      return { status: "invalid", reason: "invalid" };
    }

    const user = await this.users.findById(rotated.session.userId);
    if (!user || user.status !== "active") {
      return { status: "invalid", reason: "invalid" };
    }

    const accessToken = signAccessToken(withOptionalNow({
      userId: user.id,
      sessionId: rotated.session.id,
      role: user.role,
      secret: this.options.accessTokenSecret,
      ttlMs: this.options.accessTokenTtlMs,
    }, input.now));

    return {
      status: "authenticated",
      body: authSuccessBody(user, rotated.session),
      cookies: authCookies({
        accessToken,
        refreshToken: rotated.refreshToken,
        csrfToken: generateCsrfToken(),
        options: this.options,
      }),
    };
  }

  async logout(input: { sessionId?: string | null } & AuthRouteContext = {}): Promise<{ status: "logged_out"; cookies: AuthCookie[] }> {
    if (input.sessionId) {
      await this.sessions.revokeSession(withOptionalNow({
        sessionId: input.sessionId,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      }, input.now));
    }

    return {
      status: "logged_out",
      cookies: clearAuthCookies(this.options.cookieMode),
    };
  }
}

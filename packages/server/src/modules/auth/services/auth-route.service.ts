import type { AuthCookieMode } from "../middleware/auth.cookies.js";
import { authCookieNames, authCookieOptions, csrfCookieOptions, generateCsrfToken } from "../middleware/auth.cookies.js";
import { signAccessToken } from "./crypto/jwt.crypto.js";
import type { RecordAuditEventInput } from "./audit.service.js";
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

export type LoginResult = AuthSuccess | { status: "rejected"; reason: "invalid_credentials" | "account_unavailable" };

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
  ) {}

  async login(input: { email: string; password: string } & AuthRouteContext): Promise<LoginResult> {
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

    const created = await this.sessions.createSession({
      userId: user.id,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      now: input.now,
    });

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
      metadata: { role: user.role },
    });

    const accessToken = signAccessToken({
      userId: user.id,
      sessionId: created.session.id,
      role: user.role,
      secret: this.options.accessTokenSecret,
      ttlMs: this.options.accessTokenTtlMs,
      now: input.now,
    });

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

    const rotated = await this.sessions.rotateRefreshToken(refreshToken, {
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      now: input.now,
    });

    if (rotated.status !== "rotated") {
      return { status: "invalid", reason: "invalid" };
    }

    const user = await this.users.findById(rotated.session.userId);
    if (!user || user.status !== "active") {
      return { status: "invalid", reason: "invalid" };
    }

    const accessToken = signAccessToken({
      userId: user.id,
      sessionId: rotated.session.id,
      role: user.role,
      secret: this.options.accessTokenSecret,
      ttlMs: this.options.accessTokenTtlMs,
      now: input.now,
    });

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
      await this.sessions.revokeSession({
        sessionId: input.sessionId,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        now: input.now,
      });
    }

    return {
      status: "logged_out",
      cookies: clearAuthCookies(this.options.cookieMode),
    };
  }
}

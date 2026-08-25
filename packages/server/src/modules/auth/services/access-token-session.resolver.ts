import type { Request } from "express";
import { sessionInvalidReason } from "./policies/session.policy.js";
import type { AuthSessionRecord } from "./session.service.js";
import { verifyAccessToken } from "./crypto/jwt.crypto.js";
import { authCookieNames, parseCookieHeader } from "../middleware/auth.cookies.js";
import type { AuthenticatedSessionContext } from "../types/auth.http.types.js";

export type SessionLookupRepository = {
  findById(sessionId: string): Promise<AuthSessionRecord | null>;
};

export type AccessTokenSessionResolverOptions = {
  accessTokenSecret: string;
  inactivityTimeoutMs: number;
};

export class AccessTokenSessionResolver {
  constructor(
    private readonly sessions: SessionLookupRepository,
    private readonly options: AccessTokenSessionResolverOptions,
  ) {}

  async resolveFromRequest(request: Request, now = new Date()): Promise<AuthenticatedSessionContext | null> {
    const cookieHeader = Array.isArray(request.headers.cookie) ? request.headers.cookie[0] : request.headers.cookie;
    return this.resolveFromCookies(parseCookieHeader(cookieHeader), now);
  }

  async resolveFromCookies(cookies: Record<string, string | undefined>, now = new Date()): Promise<AuthenticatedSessionContext | null> {
    const claims = verifyAccessToken(cookies[authCookieNames.accessToken], this.options.accessTokenSecret, now);
    if (!claims) return null;

    const session = await this.sessions.findById(claims.sid);
    if (!session || session.userId !== claims.sub) return null;

    const invalidReason = sessionInvalidReason(session, now, this.options.inactivityTimeoutMs);
    if (invalidReason) return null;

    return {
      userId: claims.sub,
      sessionId: claims.sid,
      role: claims.role,
      freshOtpConsumedAt: null,
    };
  }
}

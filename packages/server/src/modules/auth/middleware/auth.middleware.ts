import { isFreshOtp } from "../services/policies/session.policy.js";
import { authCookieNames, verifyDoubleSubmitCsrf } from "./auth.cookies.js";
import type { AuthHttpRequestContext, HttpJsonResponse } from "../types/auth.http.types.js";

export type AuthGuardResult =
  | { ok: true; session: NonNullable<AuthHttpRequestContext["session"]> }
  | { ok: false; response: HttpJsonResponse<{ error: string }> };

export function requireAuthenticatedSession(context: AuthHttpRequestContext): AuthGuardResult {
  if (!context.session) {
    return { ok: false, response: { status: 401, body: { error: "AUTH_SESSION_REQUIRED" } } };
  }
  return { ok: true, session: context.session };
}

export function requireFreshOtp(context: AuthHttpRequestContext, now: Date, freshOtpWindowMs: number): AuthGuardResult {
  const auth = requireAuthenticatedSession(context);
  if (!auth.ok) return auth;
  if (!isFreshOtp(auth.session.freshOtpConsumedAt ?? null, now, freshOtpWindowMs)) {
    return { ok: false, response: { status: 403, body: { error: "AUTH_FRESH_OTP_REQUIRED" } } };
  }
  return auth;
}

export function requireCsrf(context: AuthHttpRequestContext): HttpJsonResponse<{ error: string }> | null {
  const tokenFromCookie = context.cookies[authCookieNames.csrfToken];
  const tokenFromHeader = context.headers["x-csrf-token"];
  if (verifyDoubleSubmitCsrf(tokenFromCookie, tokenFromHeader)) return null;
  return { status: 403, body: { error: "AUTH_CSRF_INVALID" } };
}

export function requireSameOrigin(context: AuthHttpRequestContext): HttpJsonResponse<{ error: string }> | null {
  const origin = context.headers.origin;
  if (!origin) return null;

  const expectedHost = context.headers["x-forwarded-host"] ?? context.headers.host;
  if (!expectedHost) return { status: 403, body: { error: "AUTH_ORIGIN_INVALID" } };

  try {
    return new URL(origin).host === expectedHost
      ? null
      : { status: 403, body: { error: "AUTH_ORIGIN_INVALID" } };
  } catch {
    return { status: 403, body: { error: "AUTH_ORIGIN_INVALID" } };
  }
}

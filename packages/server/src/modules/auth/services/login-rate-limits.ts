import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { RateLimitScope } from "../../../security/security-event-counters.js";

/** SEC-02 E3: every login limit counts over the same 15-minute window. */
export const LOGIN_RATE_WINDOW_MS = 15 * 60_000;
/** SEC-02 E3: POST /auth/login attempts per client address. */
export const LOGIN_ATTEMPTS_PER_IP = 10;
/** SEC-02 E3: OTP challenges (202) issued per account. */
export const LOGIN_OTP_ISSUES_PER_ACCOUNT = 5;
/** SEC-02 E3: POST /auth/login/verify attempts per client address. */
export const LOGIN_VERIFY_ATTEMPTS_PER_IP = 10;
/** SEC-02 E3: POST /auth/login/resend per account. */
export const LOGIN_RESENDS_PER_ACCOUNT = 3;
/** SEC-02 E3: resends allowed for one login challenge. */
export const LOGIN_OTP_MAX_RESENDS = 3;

export type LoginRateLimitScope = Extract<RateLimitScope, `auth_${string}`>;

export type LoginRateLimits = {
  loginAttempt(ip: string, now: number): boolean;
  otpIssue(userId: string, now: number): boolean;
  verifyAttempt(ip: string, now: number): boolean;
  resend(userId: string, now: number): boolean;
};

/** In memory, per API process (one process in V1, as for the other IpRateLimiter users). `onRefused` must not throw. */
export function createLoginRateLimits(onRefused: (scope: LoginRateLimitScope) => void = () => {}): LoginRateLimits {
  const limiter = (maxPerWindow: number, scope: LoginRateLimitScope) =>
    new IpRateLimiter({ windowMs: LOGIN_RATE_WINDOW_MS, maxPerWindow, onRefused: () => onRefused(scope) });
  const login = limiter(LOGIN_ATTEMPTS_PER_IP, "auth_login");
  const issue = limiter(LOGIN_OTP_ISSUES_PER_ACCOUNT, "auth_login");
  const verify = limiter(LOGIN_VERIFY_ATTEMPTS_PER_IP, "auth_verify");
  const resend = limiter(LOGIN_RESENDS_PER_ACCOUNT, "auth_resend");
  return {
    loginAttempt: (ip, now) => login.allow(ip, now),
    otpIssue: (userId, now) => issue.allow(userId, now),
    verifyAttempt: (ip, now) => verify.allow(ip, now),
    resend: (userId, now) => resend.allow(userId, now),
  };
}

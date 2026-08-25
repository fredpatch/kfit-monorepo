export type AuthConfig = {
  otpPepper: string;
  auditHashPepper: string;
  refreshTokenPepper: string;
  accessTokenSecret: string;
  otpTtlMs: number;
  otpMaxAttempts: number;
  freshOtpWindowMs: number;
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  inactivityTimeoutMs: number;
  absoluteSessionTtlMs: number;
  trustedDeviceTtlMs: number;
};

function positiveInteger(env: NodeJS.ProcessEnv, key: string, fallback: number) {
  const value = env[key];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const otpPepper = env.AUTH_OTP_PEPPER;
  if (!otpPepper || otpPepper.length < 32) {
    throw new Error("AUTH_OTP_PEPPER must contain at least 32 characters");
  }

  const config: AuthConfig = {
    otpPepper,
    auditHashPepper: env.AUTH_AUDIT_HASH_PEPPER || otpPepper,
    refreshTokenPepper: env.AUTH_REFRESH_TOKEN_PEPPER || otpPepper,
    accessTokenSecret: env.AUTH_ACCESS_TOKEN_SECRET || otpPepper,
    otpTtlMs: positiveInteger(env, "AUTH_OTP_TTL_MS", 5 * 60_000),
    otpMaxAttempts: positiveInteger(env, "AUTH_OTP_MAX_ATTEMPTS", 5),
    freshOtpWindowMs: positiveInteger(env, "AUTH_FRESH_OTP_WINDOW_MS", 10 * 60_000),
    accessTokenTtlMs: positiveInteger(env, "AUTH_ACCESS_TOKEN_TTL_MS", 15 * 60_000),
    refreshTokenTtlMs: positiveInteger(env, "AUTH_REFRESH_TOKEN_TTL_MS", 7 * 24 * 60 * 60_000),
    inactivityTimeoutMs: positiveInteger(env, "AUTH_INACTIVITY_TIMEOUT_MS", 30 * 60_000),
    absoluteSessionTtlMs: positiveInteger(env, "AUTH_ABSOLUTE_SESSION_TTL_MS", 12 * 60 * 60_000),
    trustedDeviceTtlMs: positiveInteger(env, "AUTH_TRUSTED_DEVICE_TTL_MS", 30 * 24 * 60 * 60_000),
  };

  if (config.accessTokenSecret.length < 32) {
    throw new Error("AUTH_ACCESS_TOKEN_SECRET must contain at least 32 characters");
  }
  if (config.accessTokenTtlMs >= config.refreshTokenTtlMs) {
    throw new Error("AUTH_ACCESS_TOKEN_TTL_MS must be shorter than AUTH_REFRESH_TOKEN_TTL_MS");
  }
  if (config.inactivityTimeoutMs >= config.absoluteSessionTtlMs) {
    throw new Error("AUTH_INACTIVITY_TIMEOUT_MS must be shorter than AUTH_ABSOLUTE_SESSION_TTL_MS");
  }
  return config;
}

export const authErrorCodes = [
  "BOOTSTRAP_ALREADY_COMPLETED",
  "AUTH_BOOTSTRAP_INVALID_FORMAT",
  "AUTH_PASSWORD_POLICY_FAILED",
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_ACCOUNT_UNAVAILABLE",
  "AUTH_LOGIN_INVALID_FORMAT",
  "AUTH_REFRESH_INVALID",
  "AUTH_SESSION_REQUIRED",
  "AUTH_CSRF_INVALID",
  "AUTH_FRESH_OTP_REQUIRED",
  "AUTH_OTP_CODE_INVALID_FORMAT",
  "AUTH_OTP_REJECTED",
  "AUTH_RECOVERY_INVALID_FORMAT",
  "AUTH_RECOVERY_CODE_INVALID",
  "AUTH_RECOVERY_GRANT_INVALID",
  "AUTH_RATE_LIMITED",
  "AUTH_ORIGIN_INVALID",
  "AUTH_OTP_DELIVERY_FAILED",
  "AUTH_DEVICE_NOT_FOUND",
  "BOOTSTRAP_DISABLED",
  "BOOTSTRAP_TOKEN_INVALID",
] as const;

export type AuthErrorCode = (typeof authErrorCodes)[number];

export const authOtpRejectReasons = [
  "not_found",
  "invalid",
  "expired",
  "consumed",
  "superseded",
  "locked",
] as const;

export type AuthOtpRejectReason = (typeof authOtpRejectReasons)[number];

export const authCookieNames = {
  accessToken: "kfit_access",
  refreshToken: "kfit_refresh",
  csrfToken: "kfit_csrf",
  device: "kfit_device",
} as const;

export const authCsrfHeaderName = "x-csrf-token";

/** BOOT-01 B1: production bootstrap proof, compared with KFIT_BOOTSTRAP_TOKEN; never stored by the client. */
export const bootstrapTokenHeaderName = "x-kfit-bootstrap-token";

/** SEC-02 E3: resends allowed for one login challenge (the 4th answers 429). */
export const loginOtpMaxResends = 3;

export const authApiRoutes = {
  bootstrapStatus: "/auth/bootstrap/status",
  bootstrap: "/auth/bootstrap",
  login: "/auth/login",
  verifyLogin: "/auth/login/verify",
  resendLoginOtp: "/auth/login/resend",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  currentSession: "/auth/session",
  requestSensitiveActionOtp: "/auth/otp/sensitive-action",
  verifySensitiveActionOtp: "/auth/otp/sensitive-action/verify",
  requestPasswordRecovery: "/auth/recovery/request",
  verifyPasswordRecovery: "/auth/recovery/verify",
  resetPassword: "/auth/recovery/reset",
  trustedDevices: "/auth/devices",
  trustedDevice: "/auth/devices/:id",
  revokeAllTrustedDevices: "/auth/devices/revoke-all",
} as const;

export type AuthApiRoute = (typeof authApiRoutes)[keyof typeof authApiRoutes];

export type AuthRole = "admin" | "coach";

export type AuthErrorResponse = {
  error: AuthErrorCode;
};

export type AuthOtpRejectedResponse = {
  error: "AUTH_OTP_REJECTED";
  reason: AuthOtpRejectReason;
};

export type BootstrapStatusResponse = {
  required: boolean;
  /** BOOT-01 B1: production asks for the bootstrap token header. */
  tokenRequired: boolean;
  /** BOOT-01 B1: false in production while KFIT_BOOTSTRAP_TOKEN is not set (POST answers 403 BOOTSTRAP_DISABLED). */
  enabled: boolean;
};

export type BootstrapRequest = {
  email: string;
  password: string;
};

export type BootstrapResponse = {
  user: {
    id: string;
    email: string;
    role: AuthRole;
    status: "active" | "locked" | "archived";
  };
};

export type PasswordPolicyErrorResponse = {
  error: "AUTH_PASSWORD_POLICY_FAILED";
  reason: "too_short" | "missing_letter" | "missing_number";
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthenticatedSessionResponse = {
  user: {
    id: string;
    role: AuthRole;
  };
  session: {
    id: string;
    freshOtp: boolean;
  };
};

/** SEC-02 E1: a valid password on an untrusted device answers 202 with no auth cookie; the code goes to the account e-mail. */
export type LoginOtpRequiredResponse = {
  status: "otp_required";
  challengeId: string;
  expiresAt: string;
};

/** SEC-02 E1: 200 keeps the session shape unchanged; 202 is told apart by its `status`. */
export type LoginResponse = AuthenticatedSessionResponse | LoginOtpRequiredResponse;

export function isLoginOtpRequired(response: LoginResponse): response is LoginOtpRequiredResponse {
  return "status" in response && response.status === "otp_required";
}

export type LoginVerifyRequest = {
  challengeId: string;
  code: string;
  trustDevice: boolean;
};

export type LoginVerifyResponse = AuthenticatedSessionResponse;

export type LoginResendRequest = {
  challengeId: string;
};

export type LoginResendResponse = LoginOtpRequiredResponse;

export type TrustedDeviceSummary = {
  id: string;
  label: string | null;
  lastUsedAt: string;
  trustedUntil: string;
  current: boolean;
};

export type TrustedDevicesResponse = {
  devices: TrustedDeviceSummary[];
};

export type RevokeTrustedDeviceResponse = {
  revoked: true;
};

export type RevokeAllTrustedDevicesResponse = {
  revokedCount: number;
};

export type RefreshResponse = AuthenticatedSessionResponse;

export type LogoutResponse = {
  loggedOut: true;
};

export type CurrentSessionResponse = AuthenticatedSessionResponse;

export type SensitiveActionOtpRequestResponse = {
  challengeId: string;
  deliveryChannel: "email";
  expiresAt: string;
};

export type SensitiveActionOtpVerifyRequest = {
  code: string;
};

export type SensitiveActionOtpVerifyResponse = {
  verified: true;
  challengeId: string;
  consumedAt: string | null;
};

export type PasswordRecoveryRequest = {
  email: string;
};

export type PasswordRecoveryRequestResponse = {
  accepted: true;
};

export type PasswordRecoveryVerifyRequest = {
  email: string;
  code: string;
};

export type PasswordRecoveryVerifyResponse = {
  resetToken: string;
  expiresAt: string;
};

export type PasswordRecoveryResetRequest = {
  resetToken: string;
  password: string;
};

export type PasswordRecoveryResetResponse = {
  reset: true;
};

export type AuthApiResponse =
  | BootstrapStatusResponse
  | BootstrapResponse
  | PasswordPolicyErrorResponse
  | LoginResponse
  | RefreshResponse
  | LogoutResponse
  | CurrentSessionResponse
  | SensitiveActionOtpRequestResponse
  | SensitiveActionOtpVerifyResponse
  | PasswordRecoveryRequestResponse
  | PasswordRecoveryVerifyResponse
  | PasswordRecoveryResetResponse
  | TrustedDevicesResponse
  | RevokeTrustedDeviceResponse
  | RevokeAllTrustedDevicesResponse
  | AuthErrorResponse
  | AuthOtpRejectedResponse;

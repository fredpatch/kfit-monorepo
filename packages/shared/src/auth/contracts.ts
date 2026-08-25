export const authErrorCodes = [
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_ACCOUNT_UNAVAILABLE",
  "AUTH_LOGIN_INVALID_FORMAT",
  "AUTH_REFRESH_INVALID",
  "AUTH_SESSION_REQUIRED",
  "AUTH_CSRF_INVALID",
  "AUTH_FRESH_OTP_REQUIRED",
  "AUTH_OTP_CODE_INVALID_FORMAT",
  "AUTH_OTP_REJECTED",
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

export const authApiRoutes = {
  currentSession: "/auth/session",
  requestSensitiveActionOtp: "/auth/otp/sensitive-action",
  verifySensitiveActionOtp: "/auth/otp/sensitive-action/verify",
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

export type CurrentSessionResponse = AuthenticatedSessionResponse;

export type LoginResponse = AuthenticatedSessionResponse;

export type RefreshResponse = AuthenticatedSessionResponse;

export type LogoutResponse = {
  loggedOut: true;
};

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

export type AuthApiResponse =
  | LoginResponse
  | RefreshResponse
  | LogoutResponse
  | CurrentSessionResponse
  | SensitiveActionOtpRequestResponse
  | SensitiveActionOtpVerifyResponse
  | AuthErrorResponse
  | AuthOtpRejectedResponse;

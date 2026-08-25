export const authErrorCodes = [
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

export type AuthRole = "admin" | "coach";

export type AuthErrorResponse = {
  error: AuthErrorCode;
};

export type AuthOtpRejectedResponse = {
  error: "AUTH_OTP_REJECTED";
  reason: AuthOtpRejectReason;
};

export type CurrentSessionResponse = {
  user: {
    id: string;
    role: AuthRole;
  };
  session: {
    id: string;
    freshOtp: boolean;
  };
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
  | CurrentSessionResponse
  | SensitiveActionOtpRequestResponse
  | SensitiveActionOtpVerifyResponse
  | AuthErrorResponse
  | AuthOtpRejectedResponse;

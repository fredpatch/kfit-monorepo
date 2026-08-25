import assert from "node:assert/strict";
import test from "node:test";
import {
  authApiRoutes,
  authCookieNames,
  authCsrfHeaderName,
  authErrorCodes,
  authOtpRejectReasons,
  type CurrentSessionResponse,
  type BootstrapRequest,
  type LoginRequest,
  type SensitiveActionOtpVerifyRequest,
} from "./contracts.js";

test("auth shared contracts expose stable API routes, cookies, CSRF header, error codes and OTP reason enums", () => {
  assert.deepEqual(authCookieNames, {
    accessToken: "kfit_access",
    refreshToken: "kfit_refresh",
    csrfToken: "kfit_csrf",
  });
  assert.equal(authCsrfHeaderName, "x-csrf-token");

  assert.deepEqual(authApiRoutes, {
    bootstrapStatus: "/auth/bootstrap/status",
    bootstrap: "/auth/bootstrap",
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    currentSession: "/auth/session",
    requestSensitiveActionOtp: "/auth/otp/sensitive-action",
    verifySensitiveActionOtp: "/auth/otp/sensitive-action/verify",
  });

  assert.deepEqual(authErrorCodes, [
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
  ]);

  assert.deepEqual(authOtpRejectReasons, [
    "not_found",
    "invalid",
    "expired",
    "consumed",
    "superseded",
    "locked",
  ]);
});

test("auth shared contracts type-check core request and response shapes", () => {
  const bootstrap: BootstrapRequest = { email: "coach@kfit.local", password: "CorrectHorse9" };
  const login: LoginRequest = { email: "coach@kfit.local", password: "secret" };
  const request: SensitiveActionOtpVerifyRequest = { code: "123456" };
  const response: CurrentSessionResponse = {
    user: { id: "11111111-1111-1111-1111-111111111111", role: "coach" },
    session: { id: "22222222-2222-2222-2222-222222222222", freshOtp: true },
  };

  assert.equal(bootstrap.password, "CorrectHorse9");
  assert.equal(login.email, "coach@kfit.local");
  assert.equal(request.code, "123456");
  assert.equal(response.user.role, "coach");
});

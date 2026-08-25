import assert from "node:assert/strict";
import test from "node:test";
import {
  authErrorCodes,
  authOtpRejectReasons,
  type CurrentSessionResponse,
  type SensitiveActionOtpVerifyRequest,
} from "./contracts.js";

test("auth shared contracts expose stable API error and OTP reason enums", () => {
  assert.deepEqual(authErrorCodes, [
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
  const request: SensitiveActionOtpVerifyRequest = { code: "123456" };
  const response: CurrentSessionResponse = {
    user: { id: "11111111-1111-1111-1111-111111111111", role: "coach" },
    session: { id: "22222222-2222-2222-2222-222222222222", freshOtp: true },
  };

  assert.equal(request.code, "123456");
  assert.equal(response.user.role, "coach");
});

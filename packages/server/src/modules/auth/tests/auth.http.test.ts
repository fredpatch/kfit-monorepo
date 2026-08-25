import assert from "node:assert/strict";
import test from "node:test";
import { AuthController } from "../controllers/auth.controller.js";
import { authCookieNames, generateCsrfToken, parseCookieHeader, verifyDoubleSubmitCsrf } from "../middleware/auth.cookies.js";
import { requireAuthenticatedSession, requireCsrf, requireFreshOtp } from "../middleware/auth.middleware.js";
import { authRoutes } from "../routes/auth.routes.js";
import type { AuthHttpRequestContext } from "../types/auth.http.types.js";
import type { OtpChallengeRecord, VerifyOtpResult } from "../services/otp-challenge.service.js";

const context: AuthHttpRequestContext = {
  requestId: "33333333-3333-3333-3333-333333333333",
  method: "POST",
  path: "/auth/otp/sensitive-action",
  cookies: {},
  headers: {},
  ipAddress: "192.0.2.10",
  userAgent: "KFIT test",
  session: {
    userId: "11111111-1111-1111-1111-111111111111",
    sessionId: "22222222-2222-2222-2222-222222222222",
    role: "coach",
    freshOtpConsumedAt: new Date("2026-08-25T08:00:00Z"),
  },
};

function makeChallenge(input: Partial<OtpChallengeRecord> = {}): OtpChallengeRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: context.session?.userId ?? null,
    sessionId: context.session?.sessionId ?? null,
    purpose: "sensitive_action",
    codeHash: "hash-only",
    expiresAt: new Date("2026-08-25T08:05:00Z"),
    attemptCount: 0,
    maxAttempts: 5,
    consumedAt: null,
    supersededAt: null,
    deliveryChannel: "email",
    createdAt: new Date("2026-08-25T08:00:00Z"),
    updatedAt: new Date("2026-08-25T08:00:00Z"),
    ...input,
  };
}

test("auth routes expose the server-side auth foundation endpoints", () => {
  assert.deepEqual(authRoutes.map((route) => route.path), [
    "/auth/bootstrap/status",
    "/auth/bootstrap",
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
    "/auth/session",
    "/auth/recovery/request",
    "/auth/recovery/verify",
    "/auth/recovery/reset",
    "/auth/otp/sensitive-action",
    "/auth/otp/sensitive-action/verify",
  ]);
  assert.equal(authRoutes.filter((route) => route.requiresCsrf).length, 4);
});

test("auth middleware enforces session, fresh OTP and double-submit CSRF", () => {
  assert.equal(requireAuthenticatedSession(context).ok, true);
  assert.equal(requireAuthenticatedSession({ ...context, session: null }).ok, false);

  assert.equal(requireFreshOtp(context, new Date("2026-08-25T08:05:00Z"), 10 * 60_000).ok, true);
  assert.equal(requireFreshOtp(context, new Date("2026-08-25T08:11:00Z"), 10 * 60_000).ok, false);

  const csrf = generateCsrfToken();
  assert.equal(verifyDoubleSubmitCsrf(csrf, csrf), true);
  assert.equal(requireCsrf({ ...context, cookies: { [authCookieNames.csrfToken]: csrf }, headers: { "x-csrf-token": csrf } }), null);
  assert.equal(requireCsrf(context)?.status, 403);
});

test("cookie parsing keeps named auth cookies available for adapters", () => {
  const csrf = "csrf-token";
  const cookies = parseCookieHeader(`${authCookieNames.csrfToken}=${encodeURIComponent(csrf)}; theme=dark`);
  assert.equal(cookies[authCookieNames.csrfToken], csrf);
  assert.equal(cookies.theme, "dark");
});

test("AuthController returns current session without exposing tokens", () => {
  const controller = new AuthController({
    otpChallengeService: {
      async issue() {
        throw new Error("not used");
      },
      async verify(): Promise<VerifyOtpResult> {
        throw new Error("not used");
      },
    },
  });

  const response = controller.currentSession(context);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    user: { id: context.session?.userId, role: "coach" },
    session: { id: context.session?.sessionId, freshOtp: true },
  });
});

test("AuthController requests and verifies sensitive-action OTPs through the service boundary", async () => {
  const calls: string[] = [];
  const controller = new AuthController({
    otpChallengeService: {
      async issue(input) {
        calls.push(`issue:${input.purpose}:${input.sessionId}`);
        return { challenge: makeChallenge(), code: "123456" };
      },
      async verify(code, input) {
        calls.push(`verify:${code}:${input.purpose}:${input.sessionId}`);
        return { status: "verified", challenge: makeChallenge({ consumedAt: new Date("2026-08-25T08:01:00Z") }) };
      },
    },
  });

  const issueResponse = await controller.requestSensitiveActionOtp(context);
  assert.equal(issueResponse.status, 202);
  assert.equal((issueResponse.body as { challengeId: string }).challengeId, "00000000-0000-0000-0000-000000000001");
  assert.equal(JSON.stringify(issueResponse.body).includes("123456"), false);

  const verifyResponse = await controller.verifySensitiveActionOtp(context, { code: "123456" });
  assert.equal(verifyResponse.status, 200);
  assert.deepEqual(calls, [
    "issue:sensitive_action:22222222-2222-2222-2222-222222222222",
    "verify:123456:sensitive_action:22222222-2222-2222-2222-222222222222",
  ]);
});

test("AuthController maps OTP rejection reasons to stable HTTP responses", async () => {
  const controller = new AuthController({
    otpChallengeService: {
      async issue() {
        throw new Error("not used");
      },
      async verify(): Promise<VerifyOtpResult> {
        return { status: "rejected", reason: "locked", challenge: makeChallenge({ attemptCount: 5 }) };
      },
    },
  });

  assert.equal((await controller.verifySensitiveActionOtp(context, { code: "abc" })).status, 400);
  const response = await controller.verifySensitiveActionOtp(context, { code: "123456" });
  assert.equal(response.status, 423);
  assert.deepEqual(response.body, { error: "AUTH_OTP_REJECTED", reason: "locked" });
});

test("AuthController maps password recovery responses without exposing account existence", async () => {
  const controller = new AuthController({
    passwordRecoveryService: {
      async request() { return { status: "accepted" }; },
      async verify() {
        return {
          status: "verified",
          resetToken: "signed-reset-token",
          expiresAt: new Date("2026-08-25T08:10:00Z"),
        };
      },
      async reset() { return { status: "reset" }; },
    },
    otpChallengeService: {
      async issue() { throw new Error("not used"); },
      async verify(): Promise<VerifyOtpResult> { throw new Error("not used"); },
    },
  });

  assert.deepEqual(await controller.requestPasswordRecovery(context, { email: "missing@kfit.local" }), {
    status: 202,
    body: { accepted: true },
  });
  assert.deepEqual(await controller.verifyPasswordRecovery(context, { email: "coach@kfit.local", code: "123456" }), {
    status: 200,
    body: { resetToken: "signed-reset-token", expiresAt: "2026-08-25T08:10:00.000Z" },
  });
  assert.deepEqual(await controller.resetPassword(context, { resetToken: "signed-reset-token", password: "CorrectHorse10" }), {
    status: 200,
    body: { reset: true },
  });
});


test("AuthController exposes bootstrap status and one-time creation boundary", async () => {
  const controller = new AuthController({
    bootstrapService: {
      async status() {
        return { required: true };
      },
      async create(input) {
        assert.equal(input.email, "coach@kfit.local");
        return {
          status: "created",
          user: {
            id: "11111111-1111-1111-1111-111111111111",
            email: "coach@kfit.local",
            role: "coach",
            status: "active",
          },
        };
      },
    },
    otpChallengeService: {
      async issue() {
        throw new Error("not used");
      },
      async verify(): Promise<VerifyOtpResult> {
        throw new Error("not used");
      },
    },
  });

  assert.deepEqual((await controller.bootstrapStatus()).body, { required: true });
  const response = await controller.bootstrap(context, { email: "coach@kfit.local", password: "CorrectHorse9" });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      email: "coach@kfit.local",
      role: "coach",
      status: "active",
    },
  });
});

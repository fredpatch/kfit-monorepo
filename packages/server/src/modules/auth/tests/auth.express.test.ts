import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { AuthController } from "../controllers/auth.controller.js";
import { clearAuthCookies } from "../services/auth-route.service.js";
import { authCookieNames } from "../middleware/auth.cookies.js";
import { createServerApp } from "../../../app.js";
import type { AuthenticatedSessionContext } from "../types/auth.http.types.js";
import type { OtpChallengeRecord, VerifyOtpResult } from "../services/otp-challenge.service.js";

const session: AuthenticatedSessionContext = {
  userId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
  role: "coach",
  freshOtpConsumedAt: new Date("2026-08-25T08:00:00Z"),
};

function makeChallenge(input: Partial<OtpChallengeRecord> = {}): OtpChallengeRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: session.userId,
    sessionId: session.sessionId,
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

async function withTestServer<T>(resolveSession: () => AuthenticatedSessionContext | null, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const controller = new AuthController({
    bootstrapService: {
      async status() {
        return { required: true };
      },
      async create() {
        return {
          status: "created",
          user: {
            id: session.userId,
            email: "coach@kfit.local",
            role: "coach",
            status: "active",
          },
        };
      },
    },
    authRouteService: {
      async login() {
        return {
          status: "authenticated",
          body: {
            user: { id: session.userId, role: "coach" },
            session: { id: session.sessionId, freshOtp: false },
          },
          cookies: [],
        };
      },
      async refresh() {
        return {
          status: "authenticated",
          body: {
            user: { id: session.userId, role: "coach" },
            session: { id: session.sessionId, freshOtp: false },
          },
          cookies: [],
        };
      },
      async logout() {
        return { status: "logged_out", cookies: clearAuthCookies("development") };
      },
    },
    otpChallengeService: {
      async issue() {
        return { challenge: makeChallenge(), code: "123456" };
      },
      async verify(): Promise<VerifyOtpResult> {
        return { status: "verified", challenge: makeChallenge({ consumedAt: new Date("2026-08-25T08:01:00Z") }) };
      },
    },
  });

  const app = createServerApp({
    authController: controller,
    resolveAuthSession: resolveSession,
  });

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("Test server did not expose a TCP address");
  }

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test("Express app exposes health and mounted auth session route", async () => {
  await withTestServer(() => session, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const currentSession = await fetch(`${baseUrl}/auth/session`, {
      headers: { "x-request-id": "33333333-3333-3333-3333-333333333333" },
    });
    assert.equal(currentSession.status, 200);
    assert.deepEqual(await currentSession.json(), {
      user: { id: session.userId, role: "coach" },
      session: { id: session.sessionId, freshOtp: true },
    });
  });
});

test("Express auth router enforces session and double-submit CSRF before mutating handlers", async () => {
  await withTestServer(() => null, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/session`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "AUTH_SESSION_REQUIRED" });
  });

  await withTestServer(() => session, async (baseUrl) => {
    const missingCsrf = await fetch(`${baseUrl}/auth/otp/sensitive-action`, { method: "POST" });
    assert.equal(missingCsrf.status, 403);
    assert.deepEqual(await missingCsrf.json(), { error: "AUTH_CSRF_INVALID" });

    const csrf = "csrf-token";
    const otp = await fetch(`${baseUrl}/auth/otp/sensitive-action`, {
      method: "POST",
      headers: {
        cookie: `${authCookieNames.csrfToken}=${csrf}`,
        "x-csrf-token": csrf,
      },
    });

    assert.equal(otp.status, 202);
    const body = await otp.json() as { challengeId: string; expiresAt: string };
    assert.equal(body.challengeId, "00000000-0000-0000-0000-000000000001");
    assert.equal(body.expiresAt, "2026-08-25T08:05:00.000Z");
  });
});

test("Express auth router forwards JSON bodies to OTP verification controller", async () => {
  await withTestServer(() => session, async (baseUrl) => {
    const csrf = "csrf-token";
    const response = await fetch(`${baseUrl}/auth/otp/sensitive-action/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${authCookieNames.csrfToken}=${csrf}`,
        "x-csrf-token": csrf,
      },
      body: JSON.stringify({ code: "123456" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      verified: true,
      challengeId: "00000000-0000-0000-0000-000000000001",
      consumedAt: "2026-08-25T08:01:00.000Z",
    });
  });
});


test("Express auth router exposes login, refresh and logout route behavior", async () => {
  await withTestServer(() => session, async (baseUrl) => {
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "coach@kfit.local", password: "correct-password" }),
    });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), {
      user: { id: session.userId, role: "coach" },
      session: { id: session.sessionId, freshOtp: false },
    });

    const csrf = "csrf-token";
    const refresh = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        cookie: `${authCookieNames.csrfToken}=${csrf}; ${authCookieNames.refreshToken}=refresh-token`,
        "x-csrf-token": csrf,
      },
    });
    assert.equal(refresh.status, 200);

    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        cookie: `${authCookieNames.csrfToken}=${csrf}`,
        "x-csrf-token": csrf,
      },
    });
    assert.equal(logout.status, 200);
    assert.deepEqual(await logout.json(), { loggedOut: true });
  });
});


test("Express auth router exposes bootstrap status and creation routes", async () => {
  await withTestServer(() => null, async (baseUrl) => {
    const status = await fetch(`${baseUrl}/auth/bootstrap/status`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { required: true });

    const created = await fetch(`${baseUrl}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "coach@kfit.local", password: "CorrectHorse9" }),
    });

    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      user: {
        id: session.userId,
        email: "coach@kfit.local",
        role: "coach",
        status: "active",
      },
    });
  });
});

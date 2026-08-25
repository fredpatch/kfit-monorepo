import assert from "node:assert/strict";
import test from "node:test";
import { authCookieNames } from "../middleware/auth.cookies.js";
import { AuthRouteService, type AuthUserRecord } from "../services/auth-route.service.js";
import { type RecordAuditEventInput } from "../services/audit.service.js";
import { digestRefreshToken, type AuthSessionRecord, type SessionService } from "../services/session.service.js";
import { verifyAccessToken } from "../services/crypto/jwt.crypto.js";

const now = new Date("2026-08-25T08:00:00Z");
const accessTokenSecret = "a-secure-access-token-secret-that-is-longer-than-32-characters";
const refreshPepper = "a-secure-refresh-pepper-that-is-longer-than-32-characters";

const user: AuthUserRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "coach@kfit.local",
  passwordHash: "hash:correct-password",
  status: "active",
  role: "coach",
};

function makeSession(input: Partial<AuthSessionRecord> = {}): AuthSessionRecord {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    userId: user.id,
    tokenFamilyId: "33333333-3333-3333-3333-333333333333",
    refreshTokenHash: digestRefreshToken("refresh-token", refreshPepper),
    rotationCounter: 0,
    trustedDeviceId: null,
    issuedAt: now,
    expiresAt: new Date("2026-08-26T08:00:00Z"),
    absoluteExpiresAt: new Date("2026-08-25T20:00:00Z"),
    lastSeenAt: now,
    revokedAt: null,
    compromisedAt: null,
    ipHash: null,
    userAgentHash: null,
    ...input,
  };
}

function makeService(input: { foundUser?: AuthUserRecord | null; passwordMatches?: boolean } = {}) {
  const auditEvents: RecordAuditEventInput[] = [];
  const sessions = {
    async createSession() {
      return { session: makeSession(), refreshToken: "refresh-token" };
    },
    async rotateRefreshToken() {
      return { status: "rotated" as const, session: makeSession({ rotationCounter: 1 }), refreshToken: "next-refresh-token" };
    },
    async revokeSession() {
      return makeSession({ revokedAt: now });
    },
  } satisfies Pick<SessionService, "createSession" | "rotateRefreshToken" | "revokeSession">;

  return {
    auditEvents,
    service: new AuthRouteService(
      {
        async findByEmail(email) {
          assert.equal(email, "coach@kfit.local");
          return input.foundUser === undefined ? user : input.foundUser;
        },
        async findById(userId) {
          assert.equal(userId, user.id);
          return input.foundUser === undefined ? user : input.foundUser;
        },
      },
      sessions,
      async () => input.passwordMatches ?? true,
      {
        async record(event) {
          auditEvents.push(event);
        },
      },
      {
        accessTokenSecret,
        accessTokenTtlMs: 15 * 60_000,
        refreshTokenTtlMs: 7 * 24 * 60 * 60_000,
        cookieMode: "development",
      },
    ),
  };
}

test("AuthRouteService login creates JWT, refresh and CSRF cookies without exposing secrets in body", async () => {
  const { service, auditEvents } = makeService();
  const result = await service.login({
    email: " COACH@KFIT.LOCAL ",
    password: "correct-password",
    requestId: "44444444-4444-4444-4444-444444444444",
    now,
  });

  assert.equal(result.status, "authenticated");
  assert.deepEqual(result.status === "authenticated" ? result.body : null, {
    user: { id: user.id, role: "coach" },
    session: { id: "22222222-2222-2222-2222-222222222222", freshOtp: false },
  });

  const cookies = result.status === "authenticated" ? result.cookies : [];
  const accessToken = cookies.find((cookie) => cookie.name === authCookieNames.accessToken)?.value;
  assert.ok(accessToken);
  assert.equal(verifyAccessToken(accessToken, accessTokenSecret, now)?.sid, "22222222-2222-2222-2222-222222222222");
  assert.ok(cookies.some((cookie) => cookie.name === authCookieNames.refreshToken && cookie.value === "refresh-token"));
  assert.ok(cookies.some((cookie) => cookie.name === authCookieNames.csrfToken && cookie.options.httpOnly === false));
  assert.equal(JSON.stringify(result).includes("correct-password"), false);
  assert.equal(auditEvents.some((event) => event.eventType === "auth.login.succeeded"), true);
});

test("AuthRouteService login rejects invalid credentials with stable non-enumerating result", async () => {
  const { service, auditEvents } = makeService({ passwordMatches: false });
  const result = await service.login({ email: "coach@kfit.local", password: "wrong", now });

  assert.deepEqual(result, { status: "rejected", reason: "invalid_credentials" });
  assert.equal(auditEvents[0]?.actorType, "anonymous");
  assert.equal((auditEvents[0]?.metadata as { reason?: string } | undefined)?.reason, "invalid_credentials");
});

test("AuthRouteService refresh rotates the refresh token and returns a new access token", async () => {
  const { service } = makeService();
  const result = await service.refresh("refresh-token", { now });

  assert.equal(result.status, "authenticated");
  const cookies = result.status === "authenticated" ? result.cookies : [];
  assert.ok(cookies.some((cookie) => cookie.name === authCookieNames.refreshToken && cookie.value === "next-refresh-token"));
  const accessToken = cookies.find((cookie) => cookie.name === authCookieNames.accessToken)?.value;
  assert.equal(verifyAccessToken(accessToken, accessTokenSecret, now)?.sub, user.id);
});

test("AuthRouteService logout revokes the session when known and clears auth cookies", async () => {
  const { service } = makeService();
  const result = await service.logout({ sessionId: "22222222-2222-2222-2222-222222222222", now });

  assert.equal(result.status, "logged_out");
  assert.equal(result.cookies.every((cookie) => cookie.value === "" && cookie.options.maxAgeSeconds === 0), true);
});

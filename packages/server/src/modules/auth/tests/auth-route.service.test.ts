import assert from "node:assert/strict";
import test from "node:test";
import { authCookieNames } from "../middleware/auth.cookies.js";
import {
  AuthRouteService,
  type AuthUserRecord,
  type LoginDeviceGate,
} from "../services/auth-route.service.js";
import { generateDeviceToken } from "../services/crypto/device-token.crypto.js";
import { type RecordAuditEventInput } from "../services/audit.service.js";
import {
  digestRefreshToken,
  type AuthSessionRecord,
  type SessionService,
} from "../services/session.service.js";
import { verifyAccessToken } from "../services/crypto/jwt.crypto.js";

const now = new Date("2026-08-25T08:00:00Z");
const accessTokenSecret =
  "a-secure-access-token-secret-that-is-longer-than-32-characters";
const refreshPepper =
  "a-secure-refresh-pepper-that-is-longer-than-32-characters";

const user: AuthUserRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "coach@kfit.local",
  passwordHash: "hash:correct-password",
  status: "active",
  role: "coach",
};

function makeSession(
  input: Partial<AuthSessionRecord> = {},
): AuthSessionRecord {
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

function makeDeviceGate(
  input: { trusted?: boolean; allowLogin?: boolean } = {},
) {
  const issuedFor: string[] = [];
  const gate: LoginDeviceGate = {
    allowLoginAttempt: () => input.allowLogin ?? true,
    allowVerifyAttempt: () => true,
    async useTrustedDevice(userId, deviceToken) {
      return (input.trusted ?? true) && deviceToken
        ? {
            id: "55555555-5555-5555-5555-555555555555",
            userId,
            deviceHash: "hash",
            label: null,
            trustedUntil: now,
            lastUsedAt: now,
          }
        : null;
    },
    async issueChallenge(_user, deviceToken) {
      issuedFor.push(deviceToken);
      return {
        status: "otp_required",
        challengeId: "opaque-challenge",
        expiresAt: new Date("2026-08-25T08:05:00Z"),
      };
    },
    async verifyChallenge() {
      return { status: "rejected", reason: "invalid" };
    },
    async resendChallenge() {
      return { status: "rate_limited" };
    },
    async trust() {
      throw new Error("not used");
    },
  };
  return { gate, issuedFor };
}

const knownDevice = generateDeviceToken();

function makeService(
  input: {
    foundUser?: AuthUserRecord | null;
    passwordMatches?: boolean;
    gate?: LoginDeviceGate;
  } = {},
) {
  const auditEvents: RecordAuditEventInput[] = [];
  const sessions = {
    async createSession() {
      return { session: makeSession(), refreshToken: "refresh-token" };
    },
    async rotateRefreshToken() {
      return {
        status: "rotated" as const,
        session: makeSession({ rotationCounter: 1 }),
        refreshToken: "next-refresh-token",
      };
    },
    async revokeSession() {
      return makeSession({ revokedAt: now });
    },
  } satisfies Pick<
    SessionService,
    "createSession" | "rotateRefreshToken" | "revokeSession"
  >;

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
      input.gate ?? makeDeviceGate().gate,
    ),
  };
}

test("AuthRouteService login creates JWT, refresh and CSRF cookies without exposing secrets in body", async () => {
  const { service, auditEvents } = makeService();
  const result = await service.login({
    email: " COACH@KFIT.LOCAL ",
    password: "correct-password",
    deviceCookie: knownDevice,
    requestId: "44444444-4444-4444-4444-444444444444",
    now,
  });

  assert.equal(result.status, "authenticated");
  assert.deepEqual(result.status === "authenticated" ? result.body : null, {
    user: { id: user.id, role: "coach" },
    session: { id: "22222222-2222-2222-2222-222222222222", freshOtp: false },
  });

  const cookies = result.status === "authenticated" ? result.cookies : [];
  const accessToken = cookies.find(
    (cookie) => cookie.name === authCookieNames.accessToken,
  )?.value;
  assert.ok(accessToken);
  assert.equal(
    verifyAccessToken(accessToken, accessTokenSecret, now)?.sid,
    "22222222-2222-2222-2222-222222222222",
  );
  assert.ok(
    cookies.some(
      (cookie) =>
        cookie.name === authCookieNames.refreshToken &&
        cookie.value === "refresh-token",
    ),
  );
  assert.ok(
    cookies.some(
      (cookie) =>
        cookie.name === authCookieNames.csrfToken &&
        cookie.options.httpOnly === false,
    ),
  );
  assert.equal(JSON.stringify(result).includes("correct-password"), false);
  assert.equal(
    auditEvents.some((event) => event.eventType === "auth.login.succeeded"),
    true,
  );
});

test("AuthRouteService login rejects invalid credentials with stable non-enumerating result", async () => {
  const { service, auditEvents } = makeService({ passwordMatches: false });
  const result = await service.login({
    email: "coach@kfit.local",
    password: "wrong",
    now,
  });

  assert.deepEqual(result, {
    status: "rejected",
    reason: "invalid_credentials",
  });
  assert.equal(auditEvents[0]?.actorType, "anonymous");
  assert.equal(
    (auditEvents[0]?.metadata as { reason?: string } | undefined)?.reason,
    "invalid_credentials",
  );
});

test("SEC-02 E1/E2: an untrusted device gets a challenge, the kfit_device cookie and no auth cookie", async () => {
  const { gate, issuedFor } = makeDeviceGate({ trusted: false });
  const { service } = makeService({ gate });

  const fresh = await service.login({
    email: "coach@kfit.local",
    password: "correct-password",
    deviceCookie: "malformed",
    now,
  });
  assert.equal(fresh.status, "otp_required");
  const cookies = fresh.status === "otp_required" ? fresh.cookies : [];
  assert.deepEqual(
    cookies.map((cookie) => cookie.name),
    [authCookieNames.device],
  );
  assert.equal(cookies[0]?.options.httpOnly, true);
  assert.equal(cookies[0]?.options.maxAgeSeconds, 400 * 24 * 60 * 60);
  assert.equal(
    issuedFor[0],
    cookies[0]?.value,
    "the challenge is bound to the cookie just issued",
  );

  const known = await service.login({
    email: "coach@kfit.local",
    password: "correct-password",
    deviceCookie: knownDevice,
    now,
  });
  assert.deepEqual(
    known.status === "otp_required" ? known.cookies : null,
    [],
    "a valid cookie is kept, not reissued",
  );
  assert.equal(issuedFor[1], knownDevice);
});

test("SEC-02 E3: the per-IP login limit refuses before the password is checked", async () => {
  const { gate, issuedFor } = makeDeviceGate({ allowLogin: false });
  const { service, auditEvents } = makeService({ gate, foundUser: null });
  assert.deepEqual(
    await service.login({
      email: "coach@kfit.local",
      password: "correct-password",
      now,
    }),
    { status: "rate_limited" },
  );
  assert.equal(auditEvents.length, 0);
  assert.equal(issuedFor.length, 0);
});

test("AuthRouteService refresh rotates the refresh token and returns a new access token", async () => {
  const { service } = makeService();
  const result = await service.refresh("refresh-token", { now });

  assert.equal(result.status, "authenticated");
  const cookies = result.status === "authenticated" ? result.cookies : [];
  assert.ok(
    cookies.some(
      (cookie) =>
        cookie.name === authCookieNames.refreshToken &&
        cookie.value === "next-refresh-token",
    ),
  );
  const accessToken = cookies.find(
    (cookie) => cookie.name === authCookieNames.accessToken,
  )?.value;
  assert.equal(
    verifyAccessToken(accessToken, accessTokenSecret, now)?.sub,
    user.id,
  );
});

test("AuthRouteService logout revokes the session when known and clears auth cookies", async () => {
  const { service } = makeService();
  const result = await service.logout({
    sessionId: "22222222-2222-2222-2222-222222222222",
    now,
  });

  assert.equal(result.status, "logged_out");
  assert.equal(
    result.cookies.every(
      (cookie) => cookie.value === "" && cookie.options.maxAgeSeconds === 0,
    ),
    true,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { signAccessToken } from "../services/crypto/jwt.crypto.js";
import { AccessTokenSessionResolver } from "../services/access-token-session.resolver.js";
import { authCookieNames } from "../middleware/auth.cookies.js";
import type { AuthSessionRecord } from "../services/session.service.js";

const secret = "a-secure-access-token-secret-that-is-longer-than-32-characters";
const now = new Date("2026-08-25T08:00:00Z");

function makeSession(input: Partial<AuthSessionRecord> = {}): AuthSessionRecord {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    userId: "11111111-1111-1111-1111-111111111111",
    tokenFamilyId: "33333333-3333-3333-3333-333333333333",
    refreshTokenHash: "hash-only",
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

test("AccessTokenSessionResolver resolves valid access JWT cookies through session state", async () => {
  const token = signAccessToken({
    userId: "11111111-1111-1111-1111-111111111111",
    sessionId: "22222222-2222-2222-2222-222222222222",
    role: "coach",
    secret,
    ttlMs: 15 * 60_000,
    now,
  });

  const resolver = new AccessTokenSessionResolver(
    {
      async findById() {
        return makeSession();
      },
    },
    { accessTokenSecret: secret, inactivityTimeoutMs: 30 * 60_000 },
  );

  const session = await resolver.resolveFromCookies({ [authCookieNames.accessToken]: token }, now);
  assert.deepEqual(session, {
    userId: "11111111-1111-1111-1111-111111111111",
    sessionId: "22222222-2222-2222-2222-222222222222",
    role: "coach",
    freshOtpConsumedAt: null,
  });
});

test("AccessTokenSessionResolver rejects expired tokens and invalid server-side sessions", async () => {
  const expiredToken = signAccessToken({
    userId: "11111111-1111-1111-1111-111111111111",
    sessionId: "22222222-2222-2222-2222-222222222222",
    role: "coach",
    secret,
    ttlMs: 1_000,
    now,
  });

  const resolver = new AccessTokenSessionResolver(
    {
      async findById() {
        return makeSession({ revokedAt: new Date("2026-08-25T08:00:01Z") });
      },
    },
    { accessTokenSecret: secret, inactivityTimeoutMs: 30 * 60_000 },
  );

  assert.equal(await resolver.resolveFromCookies({ [authCookieNames.accessToken]: expiredToken }, new Date("2026-08-25T08:00:02Z")), null);

  const validToken = signAccessToken({
    userId: "11111111-1111-1111-1111-111111111111",
    sessionId: "22222222-2222-2222-2222-222222222222",
    role: "coach",
    secret,
    ttlMs: 15 * 60_000,
    now,
  });
  assert.equal(await resolver.resolveFromCookies({ [authCookieNames.accessToken]: validToken }, now), null);
});

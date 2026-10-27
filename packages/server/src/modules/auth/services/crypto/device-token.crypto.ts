import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** SEC-02 E2: 32 random bytes, base64url (43 characters). Anything else in the cookie is treated as absent. */
export const DEVICE_TOKEN_BYTES = 32;
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateDeviceToken(): string {
  return randomBytes(DEVICE_TOKEN_BYTES).toString("base64url");
}

export function parseDeviceToken(value: string | undefined): string | null {
  return value && DEVICE_TOKEN_PATTERN.test(value) ? value : null;
}

/** SEC-02 E2: only this keyed hash is stored (trusted_devices.device_fingerprint_hash), never the cookie value. */
export function digestDeviceToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export type LoginChallengeClaims = { challengeId: string; resends: number };

function loginChallengeMac(input: LoginChallengeClaims & { userId: string; deviceHash: string }, pepper: string): string {
  return createHmac("sha256", pepper)
    .update(`sec02-login-challenge|${input.challengeId}|${input.userId}|${input.deviceHash}|${input.resends}`)
    .digest("base64url");
}

/**
 * SEC-02 E3: the public challengeId binds the OTP row to its user and to the device cookie that started the login,
 * and carries the resend count. It is `<otp row id>.<resends>.<mac>`; no column is needed.
 */
export function signLoginChallenge(input: LoginChallengeClaims & { userId: string; deviceHash: string }, pepper: string): string {
  return `${input.challengeId}.${input.resends}.${loginChallengeMac(input, pepper)}`;
}

/** Shape only: the caller loads the row, then checks the binding with verifyLoginChallengeBinding. */
export function parseLoginChallenge(value: string): (LoginChallengeClaims & { mac: string }) | null {
  const [challengeId, resends, mac, extra] = value.split(".");
  if (extra !== undefined || !challengeId || !UUID_PATTERN.test(challengeId) || !resends || !/^\d{1,2}$/.test(resends) || !mac) return null;
  return { challengeId: challengeId.toLowerCase(), resends: Number(resends), mac };
}

export function verifyLoginChallengeBinding(
  claims: LoginChallengeClaims & { mac: string },
  binding: { userId: string; deviceHash: string },
  pepper: string,
): boolean {
  const expected = Buffer.from(loginChallengeMac({ ...claims, ...binding }, pepper));
  const actual = Buffer.from(claims.mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

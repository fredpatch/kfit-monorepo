import { createHmac, timingSafeEqual } from "node:crypto";

export type PasswordRecoveryGrantClaims = {
  sub: string;
  cid: string;
  purpose: "password_recovery";
  verifiedAt: string;
  iat: number;
  exp: number;
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signPasswordRecoveryGrant(input: {
  userId: string;
  challengeId: string;
  verifiedAt: Date;
  secret: string;
  ttlMs: number;
  now?: Date;
}): { token: string; expiresAt: Date } {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + input.ttlMs);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: input.userId,
    cid: input.challengeId,
    purpose: "password_recovery",
    verifiedAt: input.verifiedAt.toISOString(),
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
  } satisfies PasswordRecoveryGrantClaims);
  const unsigned = `${header}.${payload}`;
  return { token: `${unsigned}.${signature(unsigned, input.secret)}`, expiresAt };
}

export function verifyPasswordRecoveryGrant(
  token: string | undefined,
  secret: string,
  now = new Date(),
): PasswordRecoveryGrantClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, presentedSignature] = parts;
  if (!header || !payload || !presentedSignature) return null;

  const parsedHeader = decode<{ alg?: string; typ?: string }>(header);
  if (parsedHeader?.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;
  if (!safeEqual(presentedSignature, signature(`${header}.${payload}`, secret))) return null;

  const claims = decode<PasswordRecoveryGrantClaims>(payload);
  if (
    !claims ||
    !claims.sub ||
    !claims.cid ||
    claims.purpose !== "password_recovery" ||
    !claims.verifiedAt ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp * 1000 <= now.getTime()
  ) return null;

  return claims;
}

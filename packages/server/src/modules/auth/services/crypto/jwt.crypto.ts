import { createHmac, timingSafeEqual } from "node:crypto";

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  role: "admin" | "coach";
  iat: number;
  exp: number;
};

export type SignAccessTokenInput = {
  userId: string;
  sessionId: string;
  role: "admin" | "coach";
  secret: string;
  ttlMs: number;
  now?: Date;
};

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signAccessToken(input: SignAccessTokenInput): string {
  const now = input.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const exp = Math.floor((now.getTime() + input.ttlMs) / 1000);
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    sub: input.userId,
    sid: input.sessionId,
    role: input.role,
    iat,
    exp,
  } satisfies AccessTokenClaims);
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned, input.secret)}`;
}

export function verifyAccessToken(token: string | undefined, secret: string, now = new Date()): AccessTokenClaims | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;

  const parsedHeader = decodeJson<{ alg?: string; typ?: string }>(header);
  if (parsedHeader?.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;

  const expected = sign(`${header}.${payload}`, secret);
  if (!safeEqual(signature, expected)) return null;

  const claims = decodeJson<AccessTokenClaims>(payload);
  if (!claims || !claims.sub || !claims.sid || (claims.role !== "admin" && claims.role !== "coach")) return null;
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return null;
  if (claims.exp * 1000 <= now.getTime()) return null;

  return claims;
}

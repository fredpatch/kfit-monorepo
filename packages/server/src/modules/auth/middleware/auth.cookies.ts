import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthCookieOptions } from "../types/auth.http.types.js";

export const authCookieNames = {
  accessToken: "kfit_access",
  refreshToken: "kfit_refresh",
  csrfToken: "kfit_csrf",
  device: "kfit_device",
} as const;

/** SEC-02 E2: the browser cap (400 days); the device cookie outlives sessions and logout. */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export type AuthCookieMode = "development" | "production";

export function authCookieOptions(
  mode: AuthCookieMode,
  maxAgeSeconds?: number,
): AuthCookieOptions {
  return {
    httpOnly: true,
    secure: mode === "production",
    sameSite: "lax",
    path: "/",
    ...(maxAgeSeconds === undefined ? {} : { maxAgeSeconds }),
  };
}

export function csrfCookieOptions(mode: AuthCookieMode): AuthCookieOptions {
  return {
    httpOnly: false,
    secure: mode === "production",
    sameSite: "lax",
    path: "/",
  };
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyDoubleSubmitCsrf(
  cookieToken: string | undefined,
  headerToken: string | undefined,
): boolean {
  if (!cookieToken || !headerToken) return false;
  const cookie = Buffer.from(cookieToken);
  const header = Buffer.from(headerToken);
  return cookie.length === header.length && timingSafeEqual(cookie, header);
}

export function parseCookieHeader(
  cookieHeader: string | undefined,
): Record<string, string | undefined> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) return [part, ""];
        return [
          part.slice(0, separator),
          decodeURIComponent(part.slice(separator + 1)),
        ];
      }),
  );
}

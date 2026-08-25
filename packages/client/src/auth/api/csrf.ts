import { authCookieNames, authCsrfHeaderName } from "@kfit/shared";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function readCookie(cookieName: string, cookieSource: string = globalThis.document?.cookie ?? ""): string | null {
  const prefix = `${cookieName}=`;
  const found = cookieSource
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

export function requiresCsrfHeader(method: string | undefined): boolean {
  return mutatingMethods.has((method ?? "GET").toUpperCase());
}

export function buildCsrfHeaders(method: string | undefined, cookieSource?: string): Record<string, string> {
  if (!requiresCsrfHeader(method)) return {};
  const token = readCookie(authCookieNames.csrfToken, cookieSource);
  return token ? { [authCsrfHeaderName]: token } : {};
}

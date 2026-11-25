/*
 * S9B: the internal HTML -> PDF renderer contract, shared by the renderer service (its own image, no DB, no storage) and
 * the API's HTTP client. This directory only imports node:*, puppeteer and itself, so the renderer image ships it alone.
 */

export const RENDERER_HEALTH_PATH = "/health";
export const RENDERER_RENDER_PATH = "/render";

/** The only page setup: A4, backgrounds printed, the template's @page size wins. */
export const RENDER_PROFILES = ["a4"] as const;
export type RenderProfile = (typeof RENDER_PROFILES)[number];

export type RenderRequest = { html: string; profile: RenderProfile };

/** HTML bytes accepted per request (a progress summary with years of rows stays far below). */
export const MAX_RENDER_HTML_BYTES = 2 * 1024 * 1024;
/** JSON envelope bound: the HTML once escaped, plus the profile. */
export const MAX_RENDER_BODY_BYTES = 3 * 1024 * 1024;
/** Chromium budget per page step (content load, pdf); the whole request is bounded by RENDER_REQUEST_TIMEOUT_MS. */
export const RENDER_STEP_TIMEOUT_MS = 15_000;
export const RENDER_REQUEST_TIMEOUT_MS = 40_000;
/** One browser per render; at most this many at once on the 2 GiB beta VPS. */
export const MAX_CONCURRENT_RENDERS = 2;

export const renderErrorCodes = [
  "RENDER_REQUEST_INVALID",
  "RENDER_REQUEST_TOO_LARGE",
  "RENDER_SCRIPT_REJECTED",
  "RENDER_BUSY",
  "RENDER_TIMEOUT",
  "RENDER_FAILED",
  "RENDER_NOT_FOUND",
] as const;
export type RenderErrorCode = (typeof renderErrorCodes)[number];

/** A render request exactly: { html, profile: "a4" }, no other key, no <script>; otherwise the refusal code. */
export function parseRenderRequest(
  value: unknown,
): RenderRequest | RenderErrorCode {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "RENDER_REQUEST_INVALID";
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "html,profile") return "RENDER_REQUEST_INVALID";
  const { html, profile } = value as Record<string, unknown>;
  if (
    typeof html !== "string" ||
    !html.trim() ||
    !(RENDER_PROFILES as readonly unknown[]).includes(profile)
  )
    return "RENDER_REQUEST_INVALID";
  if (Buffer.byteLength(html, "utf8") > MAX_RENDER_HTML_BYTES)
    return "RENDER_REQUEST_TOO_LARGE";
  // JavaScript is disabled in the page anyway; a script in a print template is a caller bug, refused outright.
  if (/<script[\s>/]/i.test(html)) return "RENDER_SCRIPT_REJECTED";
  return { html, profile: profile as RenderProfile };
}

import type { RequestHandler } from "express";

/**
 * SEC-01 D4 (CVE-2026-111497): Express 5 / body-parser 2.x decode Brotli, gzip and deflate request bodies by default.
 * No client of this API compresses its requests, so only an absent header or "identity" is accepted.
 */
export const ALLOWED_REQUEST_CONTENT_ENCODINGS = ["identity"] as const;
export const REQUEST_ENCODING_UNSUPPORTED = "REQUEST_ENCODING_UNSUPPORTED";

/**
 * Mounted in createServerApp before every body parser; refuses without reading the body. Response compression is unaffected.
 * `onRefused` counts the refusal (S7.4b B9); it must not throw.
 */
export function rejectEncodedRequestBodies(
  onRefused: () => void = () => undefined,
): RequestHandler {
  return (request, response, next) => {
    const encoding = request.headers["content-encoding"];
    if (encoding === undefined) return next();
    const value = encoding.trim().toLowerCase();
    if (
      (ALLOWED_REQUEST_CONTENT_ENCODINGS as readonly string[]).includes(value)
    )
      return next();
    onRefused();
    response
      .set("Connection", "close")
      .status(415)
      .json({ error: REQUEST_ENCODING_UNSUPPORTED });
  };
}

import type { NextFunction, Request, Response } from "express";

/**
 * SEC-01 D4 (CVE-2026-111497): Express 5 / body-parser 2.x decode Brotli, gzip and deflate request bodies by default.
 * No client of this API compresses its requests, so only an absent header or "identity" is accepted.
 */
export const ALLOWED_REQUEST_CONTENT_ENCODINGS = ["identity"] as const;
export const REQUEST_ENCODING_UNSUPPORTED = "REQUEST_ENCODING_UNSUPPORTED";

/** Mounted in createServerApp before every body parser; refuses without reading the body. Response compression is unaffected. */
export function rejectEncodedRequestBodies(request: Request, response: Response, next: NextFunction): void {
  const encoding = request.headers["content-encoding"];
  if (encoding === undefined) return next();
  const value = encoding.trim().toLowerCase();
  if ((ALLOWED_REQUEST_CONTENT_ENCODINGS as readonly string[]).includes(value)) return next();
  response.set("Connection", "close").status(415).json({ error: REQUEST_ENCODING_UNSUPPORTED });
}

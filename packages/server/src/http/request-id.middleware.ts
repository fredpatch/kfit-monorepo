import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * S7.4 D4: every request carries a canonical UUID in X-Request-Id (audit_events.request_id is a uuid column, so a free-form
 * header used to fail audited writes with 500). A repeated header reaches Node joined as "a, b" and is replaced too.
 */
export const REQUEST_ID_HEADER = "x-request-id";
export const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const received = request.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof received === "string" && CANONICAL_UUID_PATTERN.test(received)
      ? received
      : randomUUID();
  request.headers[REQUEST_ID_HEADER] = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
}

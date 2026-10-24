import type { Request, RequestHandler, Response } from "express";
import morgan from "morgan";
import { logger } from "./logger.js";

/** Public links carry their access token as the segment after `/public/<kind>/`, and query strings can carry personal data. Neither is logged. */
export function redactRequestPath(url: string): string {
  const path = url.split("?")[0] ?? "";
  return path.replace(/^(\/public\/[^/]+\/)[^/]+/, "$1:token");
}

morgan.token<Request, Response>("safe-url", (request) => redactRequestPath(request.originalUrl));

export function createHttpLogger(): RequestHandler {
  return morgan<Request, Response>(":method :safe-url :status :response-time ms - :res[content-length]", {
    stream: { write: (line) => logger.http(line.trim()) },
  });
}

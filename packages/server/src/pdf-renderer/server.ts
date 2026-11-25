import { createServer, type IncomingMessage, type Server } from "node:http";
import {
  MAX_CONCURRENT_RENDERS,
  MAX_RENDER_BODY_BYTES,
  parseRenderRequest,
  RENDERER_HEALTH_PATH,
  RENDER_REQUEST_TIMEOUT_MS,
  RENDERER_RENDER_PATH,
  type RenderErrorCode,
} from "./contract.js";
import type { HtmlToPdf } from "./html-to-pdf.js";

const STATUS: Record<RenderErrorCode, number> = {
  RENDER_REQUEST_INVALID: 400,
  RENDER_REQUEST_TOO_LARGE: 413,
  RENDER_SCRIPT_REJECTED: 422,
  RENDER_BUSY: 503,
  RENDER_TIMEOUT: 504,
  RENDER_FAILED: 500,
  RENDER_NOT_FOUND: 404,
};

class BodyTooLarge extends Error {}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > MAX_RENDER_BODY_BYTES) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_RENDER_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * S9B: internal renderer service. GET /health and POST /render ({ html, profile: "a4" } -> application/pdf), nothing
 * else: no URL fetching, no file paths, no browser flags, no DevTools. Errors are a stable code only, never the HTML,
 * the Chromium message or a stack.
 */
export function createRendererServer(
  convert: HtmlToPdf,
  options: { maxConcurrent?: number; requestTimeoutMs?: number } = {},
): Server {
  const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT_RENDERS;
  const requestTimeoutMs =
    options.requestTimeoutMs ?? RENDER_REQUEST_TIMEOUT_MS;
  let active = 0;

  return createServer(async (request, response) => {
    const fail = (code: RenderErrorCode) => {
      if (response.headersSent) return response.destroy();
      response.writeHead(STATUS[code], {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ error: code }));
    };
    const path = (request.url ?? "").split("?")[0];

    if (path === RENDERER_HEALTH_PATH && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      return response.end(JSON.stringify({ status: "ok" }));
    }
    if (path !== RENDERER_RENDER_PATH || request.method !== "POST")
      return fail("RENDER_NOT_FOUND");
    if (
      !String(request.headers["content-type"] ?? "").startsWith(
        "application/json",
      )
    )
      return fail("RENDER_REQUEST_INVALID");
    if (active >= maxConcurrent) return fail("RENDER_BUSY");

    // The slot is held until Chromium has really finished, even after a timeout answer, so a slow render never lets
    // more than maxConcurrent browsers run.
    active++;
    let work: Promise<Buffer> | undefined;
    try {
      let body: unknown;
      try {
        body = JSON.parse((await readBody(request)).toString("utf8"));
      } catch (error) {
        return fail(
          error instanceof BodyTooLarge
            ? "RENDER_REQUEST_TOO_LARGE"
            : "RENDER_REQUEST_INVALID",
        );
      }
      const parsed = parseRenderRequest(body);
      if (typeof parsed === "string") return fail(parsed);

      work = convert(parsed.html, parsed.profile);
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), requestTimeoutMs);
      });
      try {
        const pdf = await Promise.race([work, timeout]);
        if (pdf === "timeout") return fail("RENDER_TIMEOUT");
        response.writeHead(200, {
          "content-type": "application/pdf",
          "content-length": pdf.length,
          "cache-control": "no-store",
        });
        response.end(pdf);
      } catch {
        fail("RENDER_FAILED");
      } finally {
        clearTimeout(timer);
      }
    } finally {
      if (work)
        void work.then(
          () => active--,
          () => active--,
        );
      else active--;
    }
  });
}

import {
  RENDERER_HEALTH_PATH,
  RENDERER_RENDER_PATH,
  RENDER_REQUEST_TIMEOUT_MS,
  type RenderRequest,
} from "../pdf-renderer/contract.js";

/**
 * S9B: the API's only way to turn print HTML into PDF bytes. The API keeps every business step (data, snapshot,
 * template, storage, audit); this converts finished HTML and nothing else.
 */
export interface HtmlPdfRenderer {
  render(html: string): Promise<Buffer>;
}

export const PDF_RENDERER_URL_ENV = "PDF_RENDERER_URL";

export class PdfRendererError extends Error {
  constructor(readonly code: string) {
    super(`PDF renderer failed: ${code}`);
  }
}

/** One internal http(s) origin, no credentials, query or fragment; the canonical origin, or null. */
export function parsePdfRendererUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/") return null;
  return url.origin;
}

/** Calls the internal renderer service over HTTP (production). */
export class HttpHtmlPdfRenderer implements HtmlPdfRenderer {
  constructor(
    private readonly origin: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async render(html: string): Promise<Buffer> {
    const body: RenderRequest = { html, profile: "a4" };
    let response: Response;
    try {
      response = await this.fetchImpl(this.origin + RENDERER_RENDER_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        // A little above the renderer's own budget, so its RENDER_TIMEOUT answer arrives first.
        signal: AbortSignal.timeout(RENDER_REQUEST_TIMEOUT_MS + 5_000),
      });
    } catch {
      throw new PdfRendererError("RENDERER_UNREACHABLE");
    }
    if (response.status !== 200) {
      const error = await response
        .json()
        .then((value) => (value as { error?: unknown }).error)
        .catch(() => undefined);
      throw new PdfRendererError(
        typeof error === "string" && /^RENDER_[A-Z_]+$/.test(error)
          ? error
          : `HTTP_${response.status}`,
      );
    }
    const pdf = Buffer.from(await response.arrayBuffer());
    if (
      !response.headers.get("content-type")?.startsWith("application/pdf") ||
      pdf.subarray(0, 5).toString("latin1") !== "%PDF-"
    )
      throw new PdfRendererError("RENDER_RESPONSE_INVALID");
    return pdf;
  }

  /** Readiness: the renderer answers its health endpoint. */
  async ready(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(
        this.origin + RENDERER_HEALTH_PATH,
        { signal: AbortSignal.timeout(3_000) },
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

/**
 * Development and tests only: Chromium in this process, loaded lazily so the production composition never imports
 * Puppeteer. Production refuses to build without PDF_RENDERER_URL (pdfRendererFor).
 */
export class LocalChromiumHtmlPdfRenderer implements HtmlPdfRenderer {
  async render(html: string): Promise<Buffer> {
    const { chromiumHtmlToPdf } =
      await import("../pdf-renderer/html-to-pdf.js");
    return chromiumHtmlToPdf()(html, "a4");
  }
}

export class PdfRendererConfigError extends Error {
  readonly code = "PDF_RENDERER_INVALID";
  constructor() {
    super(
      `${PDF_RENDERER_URL_ENV} must be the internal http(s) origin of the PDF renderer`,
    );
  }
}

/** Production: the remote renderer, never a local fallback. Development: the remote one when configured, else local. */
export function pdfRendererFor(
  mode: "development" | "production",
  env: NodeJS.ProcessEnv,
): HtmlPdfRenderer {
  const origin = parsePdfRendererUrl(env[PDF_RENDERER_URL_ENV]);
  if (origin) return new HttpHtmlPdfRenderer(origin);
  if (mode === "production" || env[PDF_RENDERER_URL_ENV]?.trim())
    throw new PdfRendererConfigError();
  return new LocalChromiumHtmlPdfRenderer();
}

/** Receipt and quote PDFs carry their issuance time as metadata, not the render clock, so identical snapshots match. */
export function pinPdfTimestamps(pdf: Buffer, issuedAt: string): Buffer {
  const stamp = issuedAt.replace(/[-:T.Z]/g, "").slice(0, 14);
  return Buffer.from(
    pdf.toString("latin1").replace(/D:\d{14}\+00'00'/g, `D:${stamp}+00'00'`),
    "latin1",
  );
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { QuoteSnapshot, ReceiptSnapshot } from "@kfit/shared";
import {
  ProgressSummaryPdfRenderer,
  progressSummaryHtml,
} from "../modules/documents/services/progress-summary.renderer.js";
import { QuotePdfRenderer } from "../modules/quotes/services/quote-pdf.renderer.js";
import { quoteHtml } from "../modules/quotes/services/quote-snapshot.js";
import { ReceiptPdfRenderer } from "../modules/receipts/services/receipt-pdf.renderer.js";
import { receiptHtml } from "../modules/receipts/services/receipt-snapshot.js";
import {
  HttpHtmlPdfRenderer,
  LocalChromiumHtmlPdfRenderer,
  PdfRendererConfigError,
  PdfRendererError,
  pdfRendererFor,
} from "../pdf/html-pdf-renderer.js";
import { chromiumUnavailable } from "../testing/chromium.js";
import { MAX_RENDER_BODY_BYTES, parseRenderRequest } from "./contract.js";
import { chromiumHtmlToPdf, type HtmlToPdf } from "./html-to-pdf.js";
import { createRendererServer } from "./server.js";

/* S9B: the internal renderer contract, the API client and the three document paths through it. */

const FAKE_PDF = (stamp = "20990101000000") =>
  Buffer.from(`%PDF-1.7\n/CreationDate (D:${stamp}+00'00')\n%%EOF\n`, "latin1");

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
async function withRenderer(
  convert: HtmlToPdf,
  run: (origin: string) => Promise<void>,
  options?: Parameters<typeof createRendererServer>[1],
) {
  const server = createRendererServer(convert, options);
  try {
    await run(await listen(server));
  } finally {
    await close(server);
  }
}
const post = (origin: string, body: string, type = "application/json") =>
  fetch(`${origin}/render`, {
    method: "POST",
    headers: { "content-type": type },
    body,
  });

const receipt: ReceiptSnapshot = {
  templateVersion: "receipt-v1",
  receiptNumber: "REC-2026-0001",
  customerName: "Cliente Synthétique",
  subscriptionId: "00000000-0000-4000-8000-000000000001",
  subscriptionReference: "SUB-SYNTHETIC",
  paymentEventId: "00000000-0000-4000-8000-000000000002",
  amountXaf: 4000,
  currency: "XAF",
  paymentMethod: "cash",
  occurredAt: "2026-10-20T09:00:00.000Z",
  confirmedAt: "2026-10-20T10:00:00.000Z",
  issuedAt: "2026-10-21T08:30:00.000Z",
  allocations: [
    {
      installmentId: "00000000-0000-4000-8000-000000000003",
      paymentPlanId: "00000000-0000-4000-8000-000000000004",
      sequenceNumber: 1,
      dueDate: "2026-10-20",
      amountXaf: 4000,
    },
  ],
  agreedAmountXaf: 10000,
  confirmedPaidAfterPaymentXaf: 4000,
  balanceAfterPaymentXaf: 6000,
  balanceRule: "confirmed-position-v1",
};
const quote: QuoteSnapshot = {
  quoteNumber: "DEV-2026-0001",
  versionNumber: 1,
  customerName: "Cliente Synthétique",
  subscriptionReference: "SUB-SYNTHETIC",
  serviceLabel: "Service synthétique",
  variantLabel: null,
  amountXaf: 15000,
  currency: "XAF",
  durationValue: 12,
  durationUnit: "week",
  components: [],
  issuedAt: "2026-10-22T12:00:00.000Z",
  validUntil: "2026-11-22T12:00:00.000Z",
  terms: "Conditions commerciales synthétiques explicites.",
  templateVersion: "quote-v1",
};
const progress = {
  customer: { fullName: "Cliente Synthétique" },
  subscription: { reference: "SUB-SYNTHETIC" },
  service: { name: "Coaching" },
  measurements: [{ measuredAt: "2026-10-01", weightKg: 70, waistCm: 80 }],
  goals: [
    {
      label: "Poids",
      baselineValue: 72,
      targetValue: 68,
      unit: "kg",
      status: "active",
    },
  ],
  followUps: [],
};

test("S9B: a render request is exactly { html, profile: a4 }, bounded and script-free", () => {
  assert.deepEqual(parseRenderRequest({ html: "<p>x</p>", profile: "a4" }), {
    html: "<p>x</p>",
    profile: "a4",
  });
  for (const value of [
    null,
    [],
    "html",
    { html: "<p>x</p>" },
    { html: "", profile: "a4" },
    { html: "<p>x</p>", profile: "letter" },
    { html: "<p>x</p>", profile: "a4", url: "http://example.invalid" },
    { html: "<p>x</p>", profile: "a4", args: ["--no-sandbox"] },
    { url: "http://example.invalid", profile: "a4" },
    { path: "/srv/kfit/private/x.pdf", profile: "a4" },
  ])
    assert.equal(
      parseRenderRequest(value),
      "RENDER_REQUEST_INVALID",
      JSON.stringify(value),
    );
  for (const html of [
    "<script>alert(1)</script>",
    "<p>x</p><SCRIPT src=a>",
    "<script\n>",
  ])
    assert.equal(
      parseRenderRequest({ html, profile: "a4" }),
      "RENDER_SCRIPT_REJECTED",
    );
  assert.equal(
    parseRenderRequest({
      html: "x".repeat(2 * 1024 * 1024 + 1),
      profile: "a4",
    }),
    "RENDER_REQUEST_TOO_LARGE",
  );
});

test("S9B: the renderer service answers health, renders only POST /render JSON and returns stable codes, never details", async () => {
  const seen: string[] = [];
  await withRenderer(
    async (html) => {
      seen.push(html);
      if (html.includes("explode"))
        throw new Error("Chromium crashed at /secret/path");
      return FAKE_PDF();
    },
    async (origin) => {
      const health = await fetch(`${origin}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });

      const ok = await post(
        origin,
        JSON.stringify({ html: "<p>ok</p>", profile: "a4" }),
      );
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get("content-type"), "application/pdf");
      assert.deepEqual(Buffer.from(await ok.arrayBuffer()), FAKE_PDF());

      const expect = async (
        response: Response,
        status: number,
        error: string,
      ) => {
        assert.equal(response.status, status, error);
        assert.deepEqual(await response.json(), { error });
      };
      await expect(await fetch(`${origin}/render`), 404, "RENDER_NOT_FOUND");
      await expect(
        await fetch(`${origin}/json/version`),
        404,
        "RENDER_NOT_FOUND",
      );
      await expect(
        await post(origin, "html=x", "text/plain"),
        400,
        "RENDER_REQUEST_INVALID",
      );
      await expect(
        await post(origin, "{not json"),
        400,
        "RENDER_REQUEST_INVALID",
      );
      await expect(
        await post(
          origin,
          JSON.stringify({ url: "http://example.invalid", profile: "a4" }),
        ),
        400,
        "RENDER_REQUEST_INVALID",
      );
      await expect(
        await post(
          origin,
          JSON.stringify({ html: "<script>1</script>", profile: "a4" }),
        ),
        422,
        "RENDER_SCRIPT_REJECTED",
      );
      await expect(
        await post(
          origin,
          JSON.stringify({
            html: "x".repeat(MAX_RENDER_BODY_BYTES),
            profile: "a4",
          }),
        ),
        413,
        "RENDER_REQUEST_TOO_LARGE",
      );
      const failed = await post(
        origin,
        JSON.stringify({ html: "explode", profile: "a4" }),
      );
      assert.equal(failed.status, 500);
      const text = await failed.text();
      assert.equal(text, JSON.stringify({ error: "RENDER_FAILED" }));
      assert.deepEqual(seen, ["<p>ok</p>", "explode"]);
    },
  );
});

test("S9B: a timed-out render answers RENDER_TIMEOUT but keeps its slot until Chromium is really done", async () => {
  let finish!: () => void;
  const slow = new Promise<void>((resolve) => (finish = resolve));
  await withRenderer(
    async (html) => {
      if (html === "slow") await slow;
      return FAKE_PDF();
    },
    async (origin) => {
      const body = (html: string) => JSON.stringify({ html, profile: "a4" });
      const timedOut = await post(origin, body("slow"));
      assert.equal(timedOut.status, 504);
      assert.deepEqual(await timedOut.json(), { error: "RENDER_TIMEOUT" });
      const busy = await post(origin, body("fast"));
      assert.equal(busy.status, 503);
      assert.deepEqual(await busy.json(), { error: "RENDER_BUSY" });
      finish();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal((await post(origin, body("fast"))).status, 200);
    },
    { maxConcurrent: 1, requestTimeoutMs: 50 },
  );
});

test("S9B: receipt, quote and progress summary PDFs go API template -> HTTP renderer -> PDF, with issuance timestamps pinned", async () => {
  const seen: string[] = [];
  await withRenderer(
    async (html) => {
      seen.push(html);
      return FAKE_PDF();
    },
    async (origin) => {
      const htmlPdf = new HttpHtmlPdfRenderer(origin);
      const receiptPdf = await new ReceiptPdfRenderer(htmlPdf).render(receipt);
      assert.equal(seen.at(-1), receiptHtml(receipt));
      assert.ok(
        receiptPdf.toString("latin1").includes("D:20261021083000+00'00'"),
      );

      const quotePdf = await new QuotePdfRenderer(htmlPdf).render(quote);
      assert.equal(seen.at(-1), quoteHtml(quote));
      assert.ok(
        quotePdf.toString("latin1").includes("D:20261022120000+00'00'"),
      );

      const summary = new ProgressSummaryPdfRenderer(htmlPdf);
      assert.equal(summary.templateVersion, "v1");
      const progressPdf = await summary.render(progress);
      assert.equal(seen.at(-1), progressSummaryHtml(progress));
      assert.match(seen.at(-1)!, /Bilan de progression/);
      assert.deepEqual(progressPdf, FAKE_PDF());
    },
  );
});

test("S9B: the API client maps renderer failures to stable errors and refuses a non-PDF answer", async () => {
  await withRenderer(
    async () => Buffer.from("not a pdf"),
    async (origin) => {
      await assert.rejects(
        new HttpHtmlPdfRenderer(origin).render("<p>x</p>"),
        (error) =>
          error instanceof PdfRendererError &&
          error.code === "RENDER_RESPONSE_INVALID",
      );
      await assert.rejects(
        new HttpHtmlPdfRenderer(origin).render("<script>x</script>"),
        (error) =>
          error instanceof PdfRendererError &&
          error.code === "RENDER_SCRIPT_REJECTED",
      );
      assert.equal(await new HttpHtmlPdfRenderer(origin).ready(), true);
    },
  );
  const dead = createServer();
  const origin = await listen(dead);
  await close(dead);
  await assert.rejects(
    new HttpHtmlPdfRenderer(origin).render("<p>x</p>"),
    (error) =>
      error instanceof PdfRendererError &&
      error.code === "RENDERER_UNREACHABLE",
  );
  assert.equal(await new HttpHtmlPdfRenderer(origin).ready(), false);
});

test("S9B: production gets the HTTP renderer or refuses; only development may use local Chromium", () => {
  assert.ok(
    pdfRendererFor("production", {
      PDF_RENDERER_URL: "http://renderer:3100",
    }) instanceof HttpHtmlPdfRenderer,
  );
  for (const value of [
    undefined,
    "",
    "renderer:3100",
    "http://renderer:3100/render",
  ])
    assert.throws(
      () => pdfRendererFor("production", { PDF_RENDERER_URL: value }),
      PdfRendererConfigError,
      String(value),
    );
  assert.ok(
    pdfRendererFor("development", {}) instanceof LocalChromiumHtmlPdfRenderer,
  );
  assert.ok(
    pdfRendererFor("development", {
      PDF_RENDERER_URL: "http://127.0.0.1:3100",
    }) instanceof HttpHtmlPdfRenderer,
  );
  assert.throws(
    () => pdfRendererFor("development", { PDF_RENDERER_URL: "nope" }),
    PdfRendererConfigError,
  );
});

const srcDir = fileURLToPath(new URL("../../src/", import.meta.url));
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") &&
      !/\.(test|integration)\.ts$/.test(entry.name)
      ? [full]
      : [];
  });

test("S9B: the renderer module is self-contained and only it launches Chromium; the API reaches it lazily in development", () => {
  const rendererDir = path.join(srcDir, "pdf-renderer");
  for (const file of sourceFiles(rendererDir)) {
    const imports = [
      ...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g),
    ].map((m) => m[1]!);
    for (const target of imports)
      assert.ok(
        target.startsWith("node:") ||
          target === "puppeteer" ||
          target.startsWith("./"),
        `${path.basename(file)} imports ${target}`,
      );
  }
  const puppeteerUsers = sourceFiles(srcDir)
    .filter((file) => /from\s+"puppeteer"/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(srcDir, file).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(puppeteerUsers, [
    "pdf-renderer/html-to-pdf.ts",
    "testing/chromium.ts",
  ]);
  const staticHtmlToPdf = sourceFiles(srcDir).filter(
    (file) =>
      !file.startsWith(rendererDir) &&
      /from\s+"[./]*\/?pdf-renderer\/html-to-pdf\.js"/.test(
        readFileSync(file, "utf8"),
      ),
  );
  assert.deepEqual(
    staticHtmlToPdf,
    [],
    "html-to-pdf is only imported dynamically outside the renderer",
  );
  for (const file of sourceFiles(srcDir))
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /["'`]--no-sandbox/,
      path.basename(file),
    );
});

const canary = async () => {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(request.url ?? "");
    response.end("body{background:red}");
  });
  return { hits, origin: await listen(server), server };
};

test(
  "S9B: real Chromium behind the renderer service blocks every external resource and keeps receipt PDFs deterministic",
  { timeout: 60_000, skip: chromiumUnavailable() },
  async () => {
    const probe = await canary();
    const blocked: string[] = [];
    try {
      await withRenderer(
        chromiumHtmlToPdf({ onBlockedRequest: (url) => blocked.push(url) }),
        async (origin) => {
          const htmlPdf = new HttpHtmlPdfRenderer(origin);
          const pdf = await htmlPdf.render(
            `<!doctype html><html><head><link rel="stylesheet" href="${probe.origin}/style.css"></head><body><img src="${probe.origin}/pixel.png"><iframe src="${probe.origin}/frame"></iframe><p>K'FIT</p></body></html>`,
          );
          assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
          assert.deepEqual(probe.hits, [], "no request reached the network");
          assert.ok(
            blocked.some((url) => url.startsWith(probe.origin)),
            "the page did try, and was refused",
          );

          const renderer = new ReceiptPdfRenderer(htmlPdf);
          const a = await renderer.render(receipt),
            b = await renderer.render(structuredClone(receipt));
          assert.equal(
            createHash("sha256").update(a).digest("hex"),
            createHash("sha256").update(b).digest("hex"),
          );
          assert.equal(
            (await new QuotePdfRenderer(htmlPdf).render(quote))
              .subarray(0, 5)
              .toString("latin1"),
            "%PDF-",
          );
          assert.equal(
            (await new ProgressSummaryPdfRenderer(htmlPdf).render(progress))
              .subarray(0, 5)
              .toString("latin1"),
            "%PDF-",
          );
        },
      );
    } finally {
      await close(probe.server);
    }
  },
);

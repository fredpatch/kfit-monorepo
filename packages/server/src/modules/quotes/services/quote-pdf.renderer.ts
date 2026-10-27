import puppeteer from "puppeteer";
import type { QuoteSnapshot } from "@kfit/shared";
import { quoteHtml } from "./quote-snapshot.js";

export class PuppeteerQuoteRenderer {
  async render(snapshot: QuoteSnapshot): Promise<Buffer> {
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        void request.abort();
      });
      await page.setContent(quoteHtml(snapshot), {
        waitUntil: "load",
        timeout: 15000,
      });
      // Chromium metadata is pinned to issuance rather than the render clock.
      const pdf = Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          timeout: 15000,
        }),
      );
      const stamp = snapshot.issuedAt.replace(/[-:T.Z]/g, "").slice(0, 14);
      return Buffer.from(
        pdf
          .toString("latin1")
          .replace(/D:\d{14}\+00'00'/g, `D:${stamp}+00'00'`),
        "latin1",
      );
    } finally {
      await browser.close();
    }
  }
}

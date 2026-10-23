import puppeteer from "puppeteer";
import type { ReceiptSnapshot } from "@kfit/shared";
import { receiptHtml } from "./receipt-snapshot.js";
export class PuppeteerReceiptRenderer {
  async render(snapshot: ReceiptSnapshot): Promise<Buffer> {
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false); await page.setRequestInterception(true);
      page.on("request", request => { void request.abort(); });
      await page.setContent(receiptHtml(snapshot), { waitUntil: "load", timeout: 15000 });
      const pdf = Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, timeout: 15000 }));
      const stamp = snapshot.issuedAt.replace(/[-:T.Z]/g, "").slice(0, 14);
      return Buffer.from(pdf.toString("latin1").replace(/D:\d{14}\+00'00'/g, `D:${stamp}+00'00'`), "latin1");
    } finally { await browser.close(); }
  }
}

import type { QuoteSnapshot } from "@kfit/shared";
import {
  pinPdfTimestamps,
  type HtmlPdfRenderer,
} from "../../../pdf/html-pdf-renderer.js";
import { quoteHtml } from "./quote-snapshot.js";

/** S9B: the API builds the quote HTML from the frozen snapshot; only the HTML -> PDF step leaves the process. */
export class QuotePdfRenderer {
  constructor(private readonly htmlPdf: HtmlPdfRenderer) {}

  async render(snapshot: QuoteSnapshot): Promise<Buffer> {
    // Chromium metadata is pinned to issuance rather than the render clock.
    const pdf = await this.htmlPdf.render(quoteHtml(snapshot));
    return pinPdfTimestamps(pdf, snapshot.issuedAt);
  }
}

import type { ReceiptSnapshot } from "@kfit/shared";
import {
  pinPdfTimestamps,
  type HtmlPdfRenderer,
} from "../../../pdf/html-pdf-renderer.js";
import { receiptHtml } from "./receipt-snapshot.js";

/** S9B: the API builds the receipt HTML from the frozen snapshot; only the HTML -> PDF step leaves the process. */
export class ReceiptPdfRenderer {
  constructor(private readonly htmlPdf: HtmlPdfRenderer) {}

  async render(snapshot: ReceiptSnapshot): Promise<Buffer> {
    const pdf = await this.htmlPdf.render(receiptHtml(snapshot));
    return pinPdfTimestamps(pdf, snapshot.issuedAt);
  }
}

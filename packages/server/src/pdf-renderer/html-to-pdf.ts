import puppeteer from "puppeteer";
import { RENDER_STEP_TIMEOUT_MS, type RenderProfile } from "./contract.js";

export type HtmlToPdf = (
  html: string,
  profile: RenderProfile,
) => Promise<Buffer>;

/**
 * S9B: the only Chromium code. One browser per render (no state shared between requests), Chromium's own sandbox kept
 * (no sandbox-disabling flag), page JavaScript disabled and every resource request aborted, so the HTML can never fetch anything.
 * `onBlockedRequest` lets the preflight and tests count what was refused.
 */
export function chromiumHtmlToPdf(
  options: { onBlockedRequest?: (url: string) => void } = {},
): HtmlToPdf {
  return async (html) => {
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        options.onBlockedRequest?.(request.url());
        void request.abort();
      });
      await page.setContent(html, {
        waitUntil: "load",
        timeout: RENDER_STEP_TIMEOUT_MS,
      });
      return Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          timeout: RENDER_STEP_TIMEOUT_MS,
        }),
      );
    } finally {
      await browser.close();
    }
  };
}

import { existsSync } from "node:fs";
import puppeteer from "puppeteer";

/**
 * Real-Chromium PDF tests need Puppeteer's browser. CI installs with PUPPETEER_SKIP_DOWNLOAD, so they are skipped there
 * (explicitly reported as skipped, never silently passed) and run wherever the browser is installed.
 */
export function chromiumUnavailable(): string | false {
  try {
    return existsSync(puppeteer.executablePath())
      ? false
      : "Puppeteer Chrome not installed (PUPPETEER_SKIP_DOWNLOAD)";
  } catch {
    return "Puppeteer Chrome not resolvable";
  }
}

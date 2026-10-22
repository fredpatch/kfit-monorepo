import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { QuoteSnapshot } from "@kfit/shared";
import { PuppeteerQuoteRenderer } from "../services/quote-pdf.renderer.js";

test("real Chromium quote PDF is deterministic for an identical frozen snapshot", { timeout: 30000 }, async () => {
  const snapshot: QuoteSnapshot = { quoteNumber: "DEV-2026-0001", versionNumber: 1, customerName: "Synthetic PDF Customer", subscriptionReference: "SUB-SYNTHETIC-PDF", serviceLabel: "Service synthétique", variantLabel: null,
    amountXaf: 15000, currency: "XAF", durationValue: 12, durationUnit: "week", components: [], issuedAt: "2026-10-22T12:00:00.000Z", validUntil: "2026-11-22T12:00:00.000Z", terms: "Conditions commerciales synthétiques explicites.", templateVersion: "quote-v1" };
  const renderer = new PuppeteerQuoteRenderer(), first = await renderer.render(snapshot);
  await new Promise(resolve => setTimeout(resolve, 1050));
  const second = await renderer.render(structuredClone(snapshot));
  assert.equal(first.subarray(0, 5).toString(), "%PDF-"); assert.ok(first.length > 1000);
  assert.equal(createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"));
  assert.ok(first.toString("latin1").includes("D:20261022120000"));
});

import assert from "node:assert/strict";
import test from "node:test";
import type { QuoteSnapshot } from "@kfit/shared";
import { QuotesService, type QuotesRepository } from "../services/quotes.service.js";
import { quoteHtml, quotePrintModel, quoteYear, quoteNumber, readQuoteSnapshot } from "../services/quote-snapshot.js";
const id = "11111111-1111-1111-1111-111111111111", actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
const draft = { amountXaf: 12500, terms: "Conditions explicites synthétiques", validUntil: "2030-01-01T12:00:00+01:00" };
const denied: QuotesRepository = { async execute() { assert.fail("invalid input persisted"); } };
const service = new QuotesService(denied);
for (const amountXaf of [-1, 0.1, Number.NaN, 2147483648, "500"]) test(`quote rejects invalid XAF ${amountXaf}`, async () => {
  assert.deepEqual(await service.execute(id, "create", { ...draft, amountXaf }, actor), { ok: false, error: "QUOTE_INVALID_INPUT" });
});
for (const field of ["customerId", "subscriptionId", "requestId", "quoteNumber", "status", "acceptedAt", "pdfDocumentId", "serviceSnapshotJson"]) test(`quote rejects caller-owned ${field}`, async () => {
  assert.deepEqual(await service.execute(id, "create", { ...draft, [field]: id }, actor), { ok: false, error: "QUOTE_INVALID_INPUT" });
});
for (const validUntil of ["2030-02-30T12:00:00Z", "2030-01-01", "2030-01-01T24:00:00Z", "2030-01-01T12:60:00Z"]) test(`quote rejects non-strict validity ${validUntil}`, async () => {
  assert.deepEqual(await service.execute(id, "edit", { ...draft, validUntil }, actor), { ok: false, error: "QUOTE_INVALID_INPUT" });
});
test("quote accepts integer zero and coach terms but not lifecycle fields", async () => {
  const accepted = new QuotesService({ async execute(_id, c) { assert.equal(c.action, "create"); if (c.action === "create") { assert.equal(c.draft.amountXaf, 0); assert.equal(c.draft.validUntil.toISOString(), "2030-01-01T11:00:00.000Z"); } return { ok: false, error: "QUOTE_NOT_FOUND" }; } });
  await accepted.execute(id, "create", { ...draft, amountXaf: 0 }, actor);
  assert.deepEqual(await service.execute(id, "issue", { status: "issued" }, actor), { ok: false, error: "QUOTE_INVALID_INPUT" });
});
test("quote response vocabulary is closed and no free text is accepted", async () => {
  const audited = new QuotesService({ async execute(_id, command) { assert.equal(command.action, "invalid-public-input"); return { ok: false, error: "QUOTE_INVALID_INPUT" }; } });
  for (const body of [{ decision: "approve" }, { decision: "changes_requested", message: "private text" }, { decision: "accepted", acceptedAt: draft.validUntil }]) assert.deepEqual(await audited.execute("a".repeat(43), "respond", body, actor), { ok: false, error: "QUOTE_INVALID_INPUT" });
});
test("malformed bearer audits the original response action without storing the bearer", async () => {
  const audited = new QuotesService({ async execute(id, command) { assert.equal(id, ""); assert.deepEqual(command, { action: "invalid-public-input", event: "respond" }); return { ok: false, error: "QUOTE_LINK_INVALID" }; } });
  assert.deepEqual(await audited.execute("malformed-private-bearer", "respond", { decision: "accepted" }, actor), { ok: false, error: "QUOTE_LINK_INVALID" });
});
export const snapshot: QuoteSnapshot = { quoteNumber: "DEV-2026-0001", versionNumber: 1, customerName: "Synthetic <Client>", subscriptionReference: "SUB-SYNTHETIC", serviceLabel: "Service figé", variantLabel: "Formule figée", amountXaf: 12500, currency: "XAF", durationValue: 12, durationUnit: "week", components: [{ label: "Séance figée", quantity: 3 }], issuedAt: "2026-10-22T12:00:00.000Z", validUntil: "2026-11-22T12:00:00.000Z", terms: "<script>alert(1)</script>\nConditions explicites", templateVersion: "quote-v1" };
test("quote print model is deterministic and uses only the supplied snapshot", () => {
  const frozen = structuredClone(snapshot), model = quotePrintModel(frozen);
  assert.equal(model.totalLabel.replace(/\s/g, " "), "12 500 FCFA"); assert.match(model.issuedLabel, /13:00/);
  assert.equal(quoteHtml(frozen), quoteHtml(snapshot)); assert.deepEqual(frozen, snapshot);
  assert.ok(quoteHtml(frozen).includes("Service figé")); assert.ok(quoteHtml(frozen).includes("Synthetic &lt;Client&gt;"));
  assert.ok(!quoteHtml(frozen).includes("<script>")); assert.ok(quoteHtml(frozen).includes("&lt;script&gt;")); assert.doesNotMatch(quoteHtml(frozen), /(?:src|href)\s*=\s*["']https?:/);
  assert.deepEqual(readQuoteSnapshot(snapshot), snapshot); assert.equal(readQuoteSnapshot({ amountXaf: 500 }), null);
});
test("official quote number uses Libreville annual partition and minimum four-digit sequence", () => {
  assert.equal(quoteYear(new Date("2026-12-31T23:30:00Z")), 2027); assert.equal(quoteNumber(2027, 1), "DEV-2027-0001"); assert.equal(quoteNumber(2027, 10000), "DEV-2027-10000");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { FinanceDetail, FinancePaymentEvent, Receipt } from "@kfit/shared";
import { ReceiptsService } from "../services/receipts.service.js";
import { receiptNumber, buildReceiptSnapshot, correctionOf, readReceiptSnapshot, receiptHtml, publicReceipt } from "../services/receipt-snapshot.js";
import { PuppeteerReceiptRenderer } from "../services/receipt-pdf.renderer.js";
import { ReceiptDomainError, type ReceiptActor } from "../services/receipts.types.js";
import { chromiumUnavailable } from "../../../testing/chromium.js";
const id = "11111111-1111-1111-1111-111111111111", actor: ReceiptActor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
const denied = new ReceiptsService({ async execute() { assert.fail("Invalid input reached persistence"); } });
const fail = { ok: false, error: "RECEIPT_INVALID_INPUT" };
for (const field of ["receiptNumber", "customerId", "amount", "balance", "allocations", "pdfDocumentId", "issuedAt", "correctionState", "status", "paymentEventId"]) test(`receipt issue rejects server-owned ${field}`, async () => { assert.deepEqual(await denied.execute(id, "issue", { [field]: id }, actor), fail); });
for (const maxUses of [0, -1, 21, 1.5, "3", null]) test(`receipt sharing rejects invalid use limit ${String(maxUses)}`, async () => { assert.deepEqual(await denied.execute(id, "share", { expiresAt: "2030-01-01T12:00:00Z", maxUses }, actor), fail); });
test("receipt sharing uses document-policy default, strict expiry and unknown-field rejection", async () => {
  const service = new ReceiptsService({ async execute(_id, c) { assert.equal(c.action, "share"); if (c.action === "share") { assert.equal(c.maxUses, 3); assert.equal(c.expiresAt.toISOString(), "2030-01-01T12:00:00.000Z"); } return { ok: false, error: "RECEIPT_NOT_FOUND" }; } });
  await service.execute(id, "share", { expiresAt: "2030-01-01T12:00:00Z" }, actor);
  assert.deepEqual(await denied.execute(id, "share", { expiresAt: "2030-02-30T12:00:00Z" }, actor), fail);
  assert.deepEqual(await denied.execute(id, "share", { expiresAt: "2030-01-01T12:00:00Z", receiptNumber: "bad" }, actor), fail);
});
test("void requires normalized nonblank private reason and no other fields", async () => {
  for (const body of [{}, { voidReason: " " }, { voidReason: 4 }, { voidReason: "x", state: "voided" }, { voidReason: "x\0" }]) assert.deepEqual(await denied.execute(id, "void", body, actor), fail);
  const service = new ReceiptsService({ async execute(_id, c) { assert.deepEqual(c, { action: "void", voidReason: "Synthetic reason" }); return { ok: false, error: "RECEIPT_NOT_FOUND" }; } });
  await service.execute(id, "void", { voidReason: " Synthetic reason " }, actor);
});
test("malformed public input is audited as failure rather than bypassing persistence", async () => {
  const service = new ReceiptsService({ async execute(token, c) { assert.equal(token, ""); assert.deepEqual(c, { action: "invalid-public-input", event: "download" }); return { ok: false, error: "RECEIPT_LINK_INVALID" }; } });
  await service.execute("bad/token", "public-pdf", { extra: true }, { ...actor, userId: null });
});
test("receipt number formatting preserves annual partition and expands beyond four digits", () => { assert.equal(receiptNumber(2026, 1), "REC-2026-0001"); assert.equal(receiptNumber(2026, 10000), "REC-2026-10000"); assert.throws(() => receiptNumber(2026, 0), ReceiptDomainError); });
test("receipt correction state derives solely from authoritative correctable amount", () => {
  assert.equal(correctionOf({ amountXaf: 100, correctableXaf: 100 }).correctionState, "none"); assert.deepEqual(correctionOf({ amountXaf: 100, correctableXaf: 60 }), { originalAmountXaf: 100, correctedAmountXaf: 40, effectiveAmountXaf: 60, correctionState: "partially_corrected" }); assert.equal(correctionOf({ amountXaf: 100, correctableXaf: 0 }).correctionState, "fully_corrected"); assert.throws(() => correctionOf({ amountXaf: 100, correctableXaf: -1 }));
});
const received = (paymentId: string, amountXaf: number, confirmedAt: string): FinancePaymentEvent => ({ id: paymentId, eventType: "payment_received", amountXaf, currency: "XAF", paymentMethod: "cash", occurredAt: confirmedAt, confirmedAt, confirmedByUserId: id, correctionOfEventId: null, externalReference: "PRIVATE_EXTERNAL_REFERENCE", correctableXaf: amountXaf, allocations: [{ id, subscriptionId: id, installmentId: id, paymentPlanId: id, amountXaf, createdAt: confirmedAt }] });
const source = received(id, 4000, "2030-01-01T12:00:00.000Z");
const view: FinanceDetail = { subscriptionId: id, subscriptionStatus: "active", asOf: "2030-01-03T00:00:00Z", currency: "XAF", agreedAmountXaf: 10000, confirmedPaidXaf: 7000, remainingXaf: 3000, financialStatus: "partially_paid", hasOverdueInstallment: false, scheduleRequiresRevision: false, canCreatePlan: false, canRecordPayment: true, activePaymentPlan: null,
  plans: [{ id, totalExpectedXaf: 10000, status: "active", revisedFromPlanId: null, createdAt: source.confirmedAt, availableCommands: [], installments: [{ id, sequenceNumber: 1, amountXaf: 10000, dueDate: source.confirmedAt, paidXaf: 7000, remainingXaf: 3000, effectiveStatus: "partially_paid" }] }], paymentHistory: [source, received("later", 3000, "2030-01-02T12:00:00Z")] };
const header = { receiptNumber: "REC-2030-0001", customerName: "<script>synthetic</script>", subscriptionReference: "SUB-SYNTHETIC", issuedAt: "2030-01-03T12:00:00.000Z" };
const snapshot = buildReceiptSnapshot(view, source, header);
test("historical snapshot is deterministic and excludes later payments/current mutable balance", () => { assert.deepEqual(buildReceiptSnapshot(view, source, header), snapshot); assert.equal(snapshot.confirmedPaidAfterPaymentXaf, 4000); assert.equal(snapshot.balanceAfterPaymentXaf, 6000); assert.ok(!JSON.stringify(snapshot).includes(source.externalReference!)); assert.deepEqual(readReceiptSnapshot(snapshot), snapshot); });
test("historical prefix includes earlier corrections but excludes later corrections", () => {
  const previous = received("previous", 2000, "2029-12-01T12:00:00Z"), correction = { ...received("correction", 1000, "2029-12-02T12:00:00Z"), eventType: "payment_correction" as const, correctionOfEventId: previous.id };
  const s = buildReceiptSnapshot({ ...view, paymentHistory: [previous, correction, source, { ...correction, id: "later-correction", confirmedAt: "2030-01-02T12:00:00Z" }] }, source, header); assert.equal(s.confirmedPaidAfterPaymentXaf, 5000); assert.equal(s.balanceAfterPaymentXaf, 5000);
});
test("ambiguous confirmation position, unconfirmed events and corrections cannot form receipts", () => {
  assert.throws(() => buildReceiptSnapshot({ ...view, paymentHistory: [source, { ...source, id: "tied" }] }, source, header), { code: "RECEIPT_ISSUE_CONFLICT" });
  for (const s of [{ ...source, confirmedAt: "" }, { ...source, eventType: "payment_correction" as const }, { ...source, allocations: [] }]) assert.throws(() => buildReceiptSnapshot(view, s, header), { code: "RECEIPT_INVALID_PAYMENT" });
});
test("French receipt template escapes identity and prints only frozen facts", () => { const html = receiptHtml(snapshot); assert.ok(html.includes("Reçu de paiement")); assert.ok(html.includes("FCFA")); assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>")); assert.ok(!html.includes(source.externalReference!)); });
test("public receipt metadata excludes internal identity, notes, references, allocation details and reason", () => {
  const r: Receipt = { id, customerId: id, subscriptionId: id, paymentEventId: id, receiptNumber: snapshot.receiptNumber, issuedAt: snapshot.issuedAt, state: "voided", voidedAt: snapshot.issuedAt, voidReason: "PRIVATE_REASON", snapshot, pdfDocumentId: id, links: [], ...correctionOf({ amountXaf: 4000, correctableXaf: 0 }) };
  const p = publicReceipt(r, { maxUses: 3, useCount: 0 }); assert.equal(p.state, "voided"); assert.equal(p.correctionState, "fully_corrected"); for (const k of ["id", "customerId", "subscriptionId", "paymentEventId", "voidReason", "snapshot", "links", "allocations"]) assert.ok(!Object.hasOwn(p, k));
  assert.deepEqual([0, 1, 2, 3, 4].map(useCount => { const m = publicReceipt(r, { maxUses: 3, useCount }); return [m.remainingDownloads, m.canDownload]; }),
    [[3, true], [2, true], [1, true], [0, false], [0, false]], "POL-01 D3: downloads count down to 0 and the button turns off");
});
test("real Chromium receipt PDF is deterministic for the identical frozen snapshot", { skip: chromiumUnavailable() }, async () => { const renderer = new PuppeteerReceiptRenderer(), a = await renderer.render(snapshot), b = await renderer.render(structuredClone(snapshot)); assert.equal(a.subarray(0, 5).toString(), "%PDF-"); assert.equal(createHash("sha256").update(a).digest("hex"), createHash("sha256").update(b).digest("hex")); });

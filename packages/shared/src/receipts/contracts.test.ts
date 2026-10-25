import assert from "node:assert/strict";
import test from "node:test";
import { receiptApiRoutes, receiptCorrectionStates, receiptErrorCodes, receiptStates } from "./contracts.js";
test("receipt contracts expose only explicit commands and separate correction states", () => {
  assert.deepEqual(receiptStates, ["issued", "voided"]); assert.deepEqual(receiptCorrectionStates, ["none", "partially_corrected", "fully_corrected"]);
  assert.equal(Object.keys(receiptApiRoutes).length, 9); assert.equal(new Set(Object.values(receiptApiRoutes)).size, 9);
  assert.ok(!Object.keys(receiptApiRoutes).some(k => /patch|update|delete/i.test(k)));
});
test("receipt error taxonomy is unique, stable and domain specific", () => { assert.equal(new Set(receiptErrorCodes).size, 17); assert.ok(receiptErrorCodes.every(e => e.startsWith("RECEIPT_"))); });

test("POL-01 D3: consumed, expired and revoked links close the download button; other errors do not", async () => {
  const { isReceiptLinkClosed } = await import("./contracts.js");
  for (const code of ["RECEIPT_LINK_CONSUMED", "RECEIPT_LINK_EXPIRED", "RECEIPT_LINK_REVOKED"]) assert.equal(isReceiptLinkClosed(code), true, code);
  for (const code of ["RECEIPT_PDF_FAILURE", "RECEIPT_RATE_LIMITED", "RECEIPT_LINK_INVALID", undefined]) assert.equal(isReceiptLinkClosed(code), false, String(code));
});

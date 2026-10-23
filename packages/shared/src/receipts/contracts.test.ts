import assert from "node:assert/strict";
import test from "node:test";
import { receiptApiRoutes, receiptCorrectionStates, receiptErrorCodes, receiptStates } from "./contracts.js";
test("receipt contracts expose only explicit commands and separate correction states", () => {
  assert.deepEqual(receiptStates, ["issued", "voided"]); assert.deepEqual(receiptCorrectionStates, ["none", "partially_corrected", "fully_corrected"]);
  assert.equal(Object.keys(receiptApiRoutes).length, 9); assert.equal(new Set(Object.values(receiptApiRoutes)).size, 9);
  assert.ok(!Object.keys(receiptApiRoutes).some(k => /patch|update|delete/i.test(k)));
});
test("receipt error taxonomy is unique, stable and domain specific", () => { assert.equal(new Set(receiptErrorCodes).size, 17); assert.ok(receiptErrorCodes.every(e => e.startsWith("RECEIPT_"))); });

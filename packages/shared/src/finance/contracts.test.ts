import assert from "node:assert/strict";
import test from "node:test";
import {
  financeApiRoutes,
  financeErrorCodes,
  financeEventTypes,
  financePaymentMethods,
} from "./contracts.js";
test("finance vocabulary uses closed methods and explicit compensating direction", () => {
  assert.deepEqual(financePaymentMethods, [
    "cash",
    "bank_transfer",
    "mobile_money",
  ]);
  assert.deepEqual(financeEventTypes, [
    "payment_received",
    "payment_correction",
  ]);
});
test("finance exposes admin named commands with unique stable domain errors", () => {
  assert.ok(
    Object.values(financeApiRoutes).every((route) =>
      route.startsWith("/admin/"),
    ),
  );
  assert.equal(new Set(financeErrorCodes).size, financeErrorCodes.length);
  assert.equal(
    financeApiRoutes.correct,
    "/admin/payment-events/:paymentEventId/correct",
  );
});

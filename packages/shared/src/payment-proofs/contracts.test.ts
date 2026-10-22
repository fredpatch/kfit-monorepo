import assert from "node:assert/strict";
import test from "node:test";
import { paymentProofStatuses, paymentProofApiRoutes, paymentProofMimeTypes, paymentProofDocumentType, paymentProofErrorCodes } from "./contracts.js";
import { documentTypes } from "../documents/contracts.js";
test("payment proofs expose closed evidence states and named review commands", () => {
  assert.deepEqual(paymentProofStatuses, ["pending_review", "confirmed", "partially_confirmed", "correction_requested", "rejected", "duplicate", "superseded"]);
  assert.equal(Object.keys(paymentProofApiRoutes).length, 12); assert.equal(paymentProofApiRoutes.confirm, "/admin/payment-proofs/:proofId/confirm"); assert.equal(new Set(paymentProofErrorCodes).size, paymentProofErrorCodes.length);
});
test("proof documents support safe file formats without broadening personalized/public delivery contracts", () => {
  assert.deepEqual(paymentProofMimeTypes, ["application/pdf", "image/jpeg", "image/png", "image/webp"]); assert.equal(paymentProofDocumentType, "payment_proof"); assert.ok(!documentTypes.some(type => String(type) === paymentProofDocumentType));
});

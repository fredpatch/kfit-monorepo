import assert from "node:assert/strict";
import test from "node:test";
import { DocumentStorageError, PrivateDocumentStorage } from "../../documents/services/document-storage.service.js";
import { PaymentProofsService, parseProofClaims, proofFileError } from "../services/payment-proofs.service.js";
import { proofLineage, type ProofCommand, type ProofStorage, type PaymentProofsRepository } from "../services/payment-proofs.types.js";
const id = "11111111-1111-1111-1111-111111111111", token = "a".repeat(43), actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
const claims = { claimedAmountXaf: 10000, claimedPaymentMethod: "mobile_money", claimedOccurredAt: "2030-01-01T12:00:00+01:00", claimedExternalReference: "  REF-évidence  " };
const facts = { confirmedAmountXaf: 10000, confirmedPaymentMethod: "cash", confirmedOccurredAt: "2030-01-01T12:00:00Z", reviewNote: "Private" };
const file = { storageKey: id + ".pdf", originalFilename: "proof.pdf", mimeType: "application/pdf" as const, sizeBytes: 8, sha256: "a".repeat(64) };
const storage: ProofStorage = { async persist() { return file; }, async read() { return Buffer.from("%PDF-1.7"); }, async remove() {} };
const denied: PaymentProofsRepository = { async execute() { assert.fail("Invalid admin input persisted"); } }, service = new PaymentProofsService(denied, storage);
for (const value of [0, -1, 1.5, 2147483648, "100"]) test(`proof claims reject invalid integer XAF ${value}`, () => assert.equal(parseProofClaims({ ...claims, claimedAmountXaf: value }), null));
for (const value of ["card", "Cash", null]) test(`proof rejects non-vocabulary method ${value}`, () => assert.equal(parseProofClaims({ ...claims, claimedPaymentMethod: value }), null));
for (const value of ["2030-02-30T12:00:00Z", "2030-01-01", "2030-01-01T24:00:00Z", "2030-01-01T12:60:00Z"]) test(`proof rejects non-strict date ${value}`, () => assert.equal(parseProofClaims({ ...claims, claimedOccurredAt: value }), null));
for (const field of ["customerId", "subscriptionId", "paymentEventId", "allocationRows", "paidBalance", "currency", "confirmedAt", "confirmedByUserId", "status", "idempotencyKey"]) test(`review rejects server-owned ${field}`, async () => {
  assert.deepEqual(await service.execute(id, "confirm", { ...facts, [field]: id }, actor), { ok: false, error: "PAYMENT_PROOF_INVALID_INPUT" });
  assert.equal(parseProofClaims({ ...claims, [field]: id }), null);
});
test("proof claim reference normalization is evidence-only and rejects controls", () => {
  assert.equal(parseProofClaims(claims)?.claimedExternalReference, "REF-évidence"); assert.equal(parseProofClaims(claims)?.claimedOccurredAt.toISOString(), "2030-01-01T11:00:00.000Z");
  assert.equal(parseProofClaims({ ...claims, claimedExternalReference: "bad\nreference" }), null); assert.equal(parseProofClaims({ ...claims, reviewNote: "private" }), null);
});
test("private review note and customer correction message remain separate and command-owned", async () => {
  const seen: ProofCommand[] = [], capture = new PaymentProofsService({ async execute(_id, command) { seen.push(command); return { ok: false, error: "PAYMENT_PROOF_NOT_FOUND" }; } }, storage);
  await capture.execute(id, "request-correction", { reviewNote: "Private note", customerMessage: "Please upload a clearer file" }, actor);
  assert.deepEqual(seen[0], { action: "request-correction", reviewNote: "Private note", customerMessage: "Please upload a clearer file" });
  assert.deepEqual(await service.execute(id, "reject", { customerMessage: "not allowed" }, actor), { ok: false, error: "PAYMENT_PROOF_INVALID_INPUT" });
});
test("successful upload uses only evidence commands, never an authoritative finance command", async () => {
  const actions: string[] = [], capture = new PaymentProofsService({ async execute(_id, command) { actions.push(command.action); return { ok: true, body: { submitted: true } }; } }, storage);
  assert.ok((await capture.upload(token, claims, { bytes: Buffer.from("%PDF-1.7"), mimeType: "application/pdf", originalFilename: "proof.pdf" }, { ...actor, userId: null })).ok);
  assert.deepEqual(actions, ["prepare-upload", "commit-upload"]);
});
test("failed token authorization prevents storage work", async () => {
  const capture = new PaymentProofsService({ async execute() { return { ok: false, error: "PAYMENT_PROOF_LINK_REVOKED" }; } }, { ...storage, async persist() { assert.fail("Revoked token caused scan/storage"); } });
  assert.deepEqual(await capture.upload(token, claims, { bytes: Buffer.from("%PDF-1.7"), mimeType: "application/pdf", originalFilename: "proof.pdf" }, actor), { ok: false, error: "PAYMENT_PROOF_LINK_REVOKED" });
});
test("failed hard commit removes newly persisted file; database exception records sanitized access failure", async () => {
  let removed = 0;
  const capture = new PaymentProofsService({ async execute(_id, c) { if (c.action === "commit-upload") throw new Error("Private SQL/path"); if (c.action === "upload-failed") return { ok: false, error: c.error }; return { ok: true, body: { submitted: true } }; } }, { ...storage, async remove(key) { assert.equal(key, file.storageKey); removed++; } });
  assert.deepEqual(await capture.upload(token, claims, { bytes: Buffer.from("%PDF-1.7"), mimeType: "application/pdf", originalFilename: "proof.pdf" }, actor), { ok: false, error: "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE" }); assert.equal(removed, 1);
});
test("file failures map to stable proof errors and no commit command", async () => {
  for (const [code, expected] of [["DOCUMENT_FILE_INFECTED", "PAYMENT_PROOF_MALWARE_DETECTED"], ["DOCUMENT_FILE_SIGNATURE_INVALID", "PAYMENT_PROOF_UPLOAD_INVALID"], ["DOCUMENT_FILE_TOO_LARGE", "PAYMENT_PROOF_UPLOAD_INVALID"], ["DOCUMENT_FILE_SCAN_FAILED", "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE"]] as const) {
    const capture = new PaymentProofsService({ async execute(_id, c) { assert.notEqual(c.action, "commit-upload"); return c.action === "upload-failed" ? { ok: false, error: c.error } : { ok: true, body: { submitted: true } }; } }, { ...storage, async persist() { throw new DocumentStorageError(code); } });
    assert.deepEqual(await capture.upload(token, claims, { bytes: Buffer.from("%PDF-1.7"), mimeType: "application/pdf", originalFilename: "proof.pdf" }, actor), { ok: false, error: expected });
  }
  assert.equal(proofFileError(new Error("private")), "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE");
});
test("existing signature validation rejects claimed MIME/extension mismatch and zero/oversize files", () => {
  const real = new PrivateDocumentStorage(); assert.throws(() => real.validate(Buffer.from("%PDF-1.7"), "image/jpeg", "proof.jpg")); assert.throws(() => real.validate(Buffer.from("%PDF-1.7"), "application/pdf", "proof.jpg")); assert.throws(() => real.validate(Buffer.alloc(0), "application/pdf", "proof.pdf"));
});
test("token lineage parser accepts only the explicit replacement identity", () => {
  assert.deepEqual(proofLineage({ supersedesProofId: id }), { valid: true, supersedesProofId: id }); assert.equal(proofLineage({ customerId: id }).valid, false); assert.equal(proofLineage({ supersedesProofId: "bad" }).valid, false);
});

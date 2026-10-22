import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, paymentProofApiRoutes, paymentProofClaimsHeader } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import { PaymentProofsController } from "../controllers/payment-proofs.controller.js";
import { createExpressPaymentProofsRouter } from "../routes/express-payment-proofs.router.js";
import { PaymentProofsService } from "../services/payment-proofs.service.js";
import type { PaymentProofsRepository, ProofStorage } from "../services/payment-proofs.types.js";
const id = "11111111-1111-1111-1111-111111111111", token = "a".repeat(43), auth: AuthenticatedSessionContext = { userId: id, sessionId: id, role: "admin" };
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=synthetic`, "x-csrf-token": "synthetic" };
const claims = { claimedAmountXaf: 10000, claimedPaymentMethod: "cash", claimedOccurredAt: "2030-01-01T12:00:00Z" };
const uploadHeaders = { "content-type": "application/pdf", "x-file-name": "preuve.pdf", [paymentProofClaimsHeader]: encodeURIComponent(JSON.stringify(claims)) };
const path = (value: string) => value.replace(/:(subscriptionId|proofId|tokenId)/, id).replace(":token", token);
const adminRoutes = Object.entries(paymentProofApiRoutes).filter(([, route]) => route.startsWith("/admin/"))
  .map(([name, route]) => ({ path: path(route), method: ["list", "detail", "document"].includes(name) ? "GET" : "POST" }));
const denied: PaymentProofsRepository = { async execute() { assert.fail("Unauthorized persistence"); } };
const storage: ProofStorage = { async persist() { return { storageKey: id + ".pdf", originalFilename: "preuve.pdf", mimeType: "application/pdf", sizeBytes: 8, sha256: "a".repeat(64) }; }, async read() { return Buffer.alloc(0); }, async remove() {} };
async function server(run: (base: string) => Promise<void>, repository = denied, session: AuthenticatedSessionContext | null = auth, max = 100) {
  const app = express(); app.use(express.json()); app.use(createExpressPaymentProofsRouter({ controller: new PaymentProofsController(new PaymentProofsService(repository, storage)), resolveSession: () => session, rateLimiter: new IpRateLimiter({ windowMs: 60000, maxPerWindow: max }) }));
  const instance = createServer(app); instance.listen(0, "127.0.0.1"); await once(instance, "listening");
  try { await run(`http://127.0.0.1:${(instance.address() as AddressInfo).port}`); } finally { instance.closeAllConnections(); await new Promise<void>((resolve, reject) => instance.close(error => error ? reject(error) : resolve())); }
}
for (const role of [null, "coach"] as const) test(`all payment-proof admin routes deny ${role ?? "anonymous"}`, async () => {
  await server(async base => { for (const route of adminRoutes) assert.equal((await fetch(base + route.path, { method: route.method, headers, ...(route.method === "GET" ? {} : { body: "{}" }) })).status, role ? 403 : 401); }, denied, role ? { ...auth, role } : null);
});
test("all payment-proof admin mutations require CSRF and same origin", async () => {
  await server(async base => { for (const route of adminRoutes.filter(r => r.method === "POST")) {
    assert.equal((await fetch(base + route.path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await fetch(base + route.path, { method: "POST", headers: { ...headers, origin: "https://foreign.invalid" }, body: "{}" })).status, 403);
  } });
});
test("public raw upload requires no session/CSRF but preserves untrusted claims and rejects foreign origin", async () => {
  const actions: string[] = [];
  await server(async base => {
    const result = await fetch(base + path(paymentProofApiRoutes.upload), { method: "POST", headers: uploadHeaders, body: "%PDF-1.7" }); assert.equal(result.status, 200); assert.deepEqual(await result.json(), { submitted: true }); assert.deepEqual(actions, ["prepare-upload", "commit-upload"]);
    assert.equal((await fetch(base + path(paymentProofApiRoutes.upload), { method: "POST", headers: { ...uploadHeaders, origin: "https://foreign.invalid" }, body: "%PDF-1.7" })).status, 403); assert.equal(actions.length, 2);
  }, { async execute(_id, command, actor) { actions.push(command.action); assert.equal(actor.userId, null); if (command.action === "commit-upload") assert.equal(command.claims.claimedAmountXaf, 10000); return { ok: true, body: { submitted: true } }; } }, null);
});
test("public upload rejects extra fields and malformed encoded metadata without authoritative writes", async () => {
  await server(async base => { for (const value of ["%bad", encodeURIComponent(JSON.stringify({ ...claims, customerId: id }))]) {
    const result = await fetch(base + path(paymentProofApiRoutes.upload), { method: "POST", headers: { ...uploadHeaders, [paymentProofClaimsHeader]: value }, body: "%PDF-1.7" }); assert.equal(result.status, 400);
  } }, { async execute(_id, command) { assert.equal(command.action, "upload-failed"); return { ok: false, error: "PAYMENT_PROOF_INVALID_INPUT" }; } }, null);
});
test("public proof routes share rate limit and never expose download or generic status mutation", async () => {
  await server(async base => { assert.equal((await fetch(base + path(paymentProofApiRoutes.publicMetadata))).status, 400); const limited = await fetch(base + path(paymentProofApiRoutes.upload), { method: "POST", headers: uploadHeaders, body: "%PDF-1.7" }); assert.equal(limited.status, 429);
    assert.equal((await fetch(base + "/public/payment-proofs/" + token + "/document")).status, 404); assert.equal((await fetch(base + path(paymentProofApiRoutes.detail), { method: "PATCH", headers, body: '{"status":"confirmed"}' })).status, 404);
  }, { async execute() { return { ok: false, error: "PAYMENT_PROOF_LINK_INVALID" }; } }, null, 1);
});
test("proof route failures are private, typed and non-cacheable", async () => {
  await server(async base => { const r = await fetch(base + path(paymentProofApiRoutes.publicMetadata)); assert.equal(r.status, 500); assert.deepEqual(await r.json(), { error: "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE" }); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal(r.headers.get("referrer-policy"), "no-referrer"); }, { async execute() { throw new Error("Private SQL/reference/path/bearer"); } }, null);
});

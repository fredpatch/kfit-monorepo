import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, consentApiRoutes } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { ConsentController } from "../controllers/consent.controller.js";
import { createExpressConsentRouter } from "../routes/express-consent.router.js";
import { ConsentService, type ConsentRepository } from "../services/consent.service.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
const id = randomUUID(); const csrf = "synthetic-consent-csrf";
const session: AuthenticatedSessionContext = { userId: id, sessionId: id, role: "admin" };
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf };
const paths = Object.entries(consentApiRoutes).filter(([key]) => key !== "public").map(([action, path]) => ({ action,
  path: path.replace(":subscriptionId", id).replace(":tokenId", id).replace(":consentType", "marketing"), method: action === "detail" ? "GET" : "POST" }));
const repository: ConsentRepository = { async execute() { return { ok: true, body: { accepted: true } }; }, async publicAccess() { return { ok: true, body: { accepted: true } }; } };
async function withServer(run: (base: string) => Promise<void>, repo = repository, auth: AuthenticatedSessionContext | null = session, max = 100) {
  const app = express(); app.use(express.json()); app.use(createExpressConsentRouter({ controller: new ConsentController(new ConsentService(repo)),
    resolveSession: () => auth, rateLimiter: new IpRateLimiter({ windowMs: 60000, maxPerWindow: max }) }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
for (const role of [null, "coach"] as const) test(`all admin consent routes reject ${role ?? "unauthenticated"} callers`, async () => {
  await withServer(async base => { for (const route of paths) {
    const result = await fetch(base + route.path, { method: route.method, headers, ...(route.method === "POST" ? { body: "{}" } : {}) }); assert.equal(result.status, role ? 403 : 401);
  } }, { ...repository, async execute() { assert.fail("unauthorized access"); } }, role ? { ...session, role } : null);
});
test("every admin consent mutation requires CSRF and same origin", async () => {
  await withServer(async base => { for (const route of paths.filter(r => r.method === "POST")) {
    assert.equal((await fetch(base + route.path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await fetch(base + route.path, { method: "POST", headers: { ...headers, origin: "https://foreign.invalid" }, body: "{}" })).status, 403);
  } });
});
test("public consent needs no login or CSRF cookie but rejects foreign origin", async () => {
  await withServer(async base => {
    const path = "/public/consents/synthetic";
    assert.equal((await fetch(base + path)).status, 200);
    const request = { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ decisions: { service_terms: "granted", privacy_notice: "refused" } }) };
    assert.equal((await fetch(base + path, request)).status, 200);
    assert.equal((await fetch(base + path, { ...request, headers: { ...request.headers, origin: "https://foreign.invalid" } })).status, 403);
  }, repository, null);
});
test("public definition override reaches only the rejected-input failure-event path", async () => {
  await withServer(async base => {
    const response = await fetch(base + "/public/consents/synthetic", { method: "POST", headers, body: JSON.stringify({ decisions: { service_terms: "granted", privacy_notice: "granted" }, version: "9" }) });
    assert.equal(response.status, 400);
  }, { ...repository, async publicAccess(_token, decisions, _actor, rejectedInput) { assert.equal(decisions, null); assert.equal(rejectedInput, "CONSENT_INVALID_INPUT"); return { ok: false, error: "CONSENT_INVALID_INPUT" }; } });
});
test("public token errors are typed and responses prevent caching/referrer disclosure", async () => {
  await withServer(async base => {
    const response = await fetch(base + "/public/consents/synthetic"); assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "CONSENT_LINK_CONSUMED" }); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  }, { ...repository, async publicAccess() { return { ok: false, error: "CONSENT_LINK_CONSUMED" }; } });
});
test("public token reads are rate limited", async () => {
  await withServer(async base => { assert.equal((await fetch(base + "/public/consents/synthetic")).status, 200); assert.equal((await fetch(base + "/public/consents/synthetic")).status, 429); }, repository, null, 1);
});
test("persistence exceptions never disclose tokens, text or SQL", async () => {
  await withServer(async base => { const response = await fetch(base + "/public/consents/synthetic"); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: "CONSENT_ROUTE_UNEXPECTED_FAILURE" }); },
    { ...repository, async publicAccess() { throw new Error("secret SQL / synthetic bearer"); } });
});

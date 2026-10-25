import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { DevToolsController } from "../controllers/dev-tools.controller.js";
import { createExpressDevToolsRouter } from "../routes/express-dev-tools.router.js";
import { devToolsAvailable } from "../services/dev-tools.guard.js";
import { testDataFingerprint, type TestDataClassification } from "../services/test-data.policy.js";
import { TestDataService } from "../services/test-data.service.js";

const admin: AuthenticatedSessionContext = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", role: "admin" };
const csrf = "synthetic-dev-tools-csrf";
const writeHeaders = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf };
const classification: TestDataClassification = { doomed: new Map([["services", ["s1", "s2"]]]), kept: new Map([["customers", ["c1"]]]), syntheticUsers: 3 };
const fingerprint = testDataFingerprint(classification);

async function withServer(run: (url: string, calls: string[]) => Promise<void>, options: { session?: AuthenticatedSessionContext | null; available?: boolean } = {}) {
  const calls: string[] = [];
  const repository = {
    async classify() { return classification; },
    async purge(expected: string, fingerprintOf: (c: TestDataClassification) => string, actor: { userId: string }) {
      calls.push(`purge:${actor.userId}`);
      return expected === fingerprintOf(classification)
        ? { status: "purged" as const, counts: { services: 2 }, files: [{ documentVersionId: "v1", storageKey: "k1.pdf" }, { documentVersionId: "v2", storageKey: "k2.pdf" }] }
        : { status: "changed" as const };
    },
  };
  const service = new TestDataService(repository, async (key) => { calls.push(`remove:${key}`); if (key === "k2.pdf") throw new Error("EACCES"); }, (line) => calls.push(`log:${line}`));
  const app = express(); app.use(express.json());
  app.use(createExpressDevToolsRouter({ controller: new DevToolsController(service, () => options.available ?? true), resolveSession: () => (options.session === undefined ? admin : options.session) }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("TEST-01 dev guard: only non-production on local kfit_dev:5433 (D4)", () => {
  const dev = "postgresql://u:p@localhost:5433/kfit_dev";
  assert.equal(devToolsAvailable({ NODE_ENV: "development", DATABASE_URL: dev }), true);
  assert.equal(devToolsAvailable({ DATABASE_URL: dev }), true);
  assert.equal(devToolsAvailable({ NODE_ENV: "production", DATABASE_URL: dev }), false);
  for (const url of ["postgresql://u:p@localhost:5433/kfit_test", "postgresql://u:p@localhost:5432/kfit_dev", "postgresql://u:p@db.example.com:5433/kfit_dev", undefined]) {
    assert.equal(devToolsAvailable({ NODE_ENV: "development", DATABASE_URL: url }), false, String(url));
  }
});

test("TEST-01 every dev-tools request is refused when the guard fails, before auth (D4)", async () => {
  await withServer(async (url, calls) => {
    const analyse = await fetch(`${url}/admin/dev/test-data`);
    assert.equal(analyse.status, 403);
    assert.deepEqual(await analyse.json(), { error: "DEV_TOOLS_UNAVAILABLE" });
    const purge = await fetch(`${url}/admin/dev/test-data/purge`, { method: "POST", headers: writeHeaders, body: JSON.stringify({ fingerprint }) });
    assert.deepEqual(await purge.json(), { error: "DEV_TOOLS_UNAVAILABLE" });
    assert.deepEqual(calls, []);
  }, { available: false, session: null });
});

for (const [session, expected] of [[null, 401], [{ ...admin, role: "coach" }, 403]] as const) test(`TEST-01 dev-tools endpoints answer ${expected} without an admin session (D6)`, async () => {
  await withServer(async (url) => {
    assert.equal((await fetch(`${url}/admin/dev/test-data`)).status, expected);
    assert.equal((await fetch(`${url}/admin/dev/test-data/purge`, { method: "POST", headers: writeHeaders, body: JSON.stringify({ fingerprint }) })).status, expected);
  }, { session });
});

test("TEST-01 analyse returns counts, kept and fingerprint only (D6)", async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/admin/dev/test-data`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { counts: { services: 2 }, kept: { customers: 1, users: 3 }, fingerprint });
  });
});

test("TEST-01 purge needs CSRF, same origin and the analysed fingerprint; files go after commit, best effort (D5, D6)", async () => {
  await withServer(async (url, calls) => {
    const post = (headers: Record<string, string>, body: unknown) => fetch(`${url}/admin/dev/test-data/purge`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal((await post({ "content-type": "application/json" }, { fingerprint })).status, 403);
    assert.equal((await post({ ...writeHeaders, origin: "https://evil.example" }, { fingerprint })).status, 403);
    assert.equal((await post(writeHeaders, { fingerprint: "nope" })).status, 400);
    const stale = await post(writeHeaders, { fingerprint: "0".repeat(64) });
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: "DEV_TEST_DATA_CHANGED" });
    const done = await post(writeHeaders, { fingerprint });
    assert.equal(done.status, 200);
    assert.deepEqual(await done.json(), { counts: { services: 2 } });
    assert.deepEqual(calls, [`purge:${admin.userId}`, `purge:${admin.userId}`, "remove:k1.pdf", "remove:k2.pdf", "log:dev test-data purge: stored file not removed for document version v2"]);
  });
});

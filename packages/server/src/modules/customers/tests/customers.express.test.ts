import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames } from "../../auth/middleware/auth.cookies.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { CustomersController } from "../controllers/customers.controller.js";
import { createExpressCustomersRouter } from "../routes/express-customers.router.js";
import { CustomersService, type CustomersRepository } from "../services/customers.service.js";

const session: AuthenticatedSessionContext = { userId: "11111111-1111-1111-1111-111111111111", sessionId: "22222222-2222-2222-2222-222222222222", role: "admin" };
const customer = { id: "33333333-3333-3333-3333-333333333333", fullName: "Synthetic Customer", whatsapp: "+24100000000", email: null, city: null, country: null, prospectId: null, preferredContactChannel: "whatsapp", createdAt: "2026-10-20T08:00:00.000Z" };
const csrf = "synthetic-csrf-token";
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf };
async function withServer(run: (url: string) => Promise<void>, auth: AuthenticatedSessionContext | null = session, overrides: Partial<CustomersRepository> = {}) {
  const repository: CustomersRepository = { async listActive() { return [customer]; }, async searchActive() { return [customer]; }, async createManual() { return { status: "ok", customer }; }, async getDetail() { return { customer, subscriptions: [] }; }, ...overrides };
  const app = express();
  app.use(express.json());
  app.use(createExpressCustomersRouter({ controller: new CustomersController(new CustomersService(repository)), resolveSession: () => auth }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

for (const role of [null, "coach"] as const) {
  test(`all customer routes reject ${role ?? "unauthenticated"} callers before persistence`, async () => {
    const fail = async (): Promise<never> => assert.fail("unauthorized persistence access");
    await withServer(async url => {
      for (const [path, method] of [["/admin/customers", "GET"], ["/admin/customers/search?whatsapp=123456", "GET"], ["/admin/customers", "POST"], [`/admin/customers/${customer.id}`, "GET"]] as const) {
        const response = await fetch(url + path, { method, headers, ...(method === "POST" ? { body: "{}" } : {}) });
        assert.equal(response.status, role ? 403 : 401);
      }
    }, role ? { ...session, role } : null, { listActive: fail, searchActive: fail, createManual: fail, getDetail: fail });
  });
}

test("customer POST requires CSRF and same origin", async () => {
  await withServer(async url => {
    const missing = await fetch(url + "/admin/customers", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(missing.status, 403);
    assert.deepEqual(await missing.json(), { error: "AUTH_CSRF_INVALID" });
    const crossOrigin = await fetch(url + "/admin/customers", { method: "POST", headers: { ...headers, origin: "https://other.invalid" }, body: "{}" });
    assert.equal(crossOrigin.status, 403);
    assert.deepEqual(await crossOrigin.json(), { error: "AUTH_ORIGIN_INVALID" });
  }, session, { async createManual() { assert.fail("unprotected mutation"); } });
});

test("customer HTTP list, normalized search and manual create serialize approved DTOs", async () => {
  await withServer(async url => {
    const list = await fetch(url + "/admin/customers");
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { customers: [customer] });
    const search = await fetch(url + "/admin/customers/search?whatsapp=" + encodeURIComponent("+241 00 00 00 00"));
    assert.equal(search.status, 200);
    assert.deepEqual(await search.json(), { customers: [customer] });
    const created = await fetch(url + "/admin/customers", { method: "POST", headers: { ...headers, origin: url }, body: JSON.stringify({ fullName: customer.fullName, whatsapp: customer.whatsapp }) });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { customer });
  }, session, { async searchActive(phone) { assert.equal(phone, customer.whatsapp); return [customer]; }, async createManual(input, actor) { assert.equal(actor.userId, session.userId); assert.equal(input.whatsapp, customer.whatsapp); return { status: "ok", customer }; } });
});

test("customer HTTP invalid inputs return safe 400 errors", async () => {
  await withServer(async url => {
    for (const path of ["/admin/customers/search", "/admin/customers/search?whatsapp=123", "/admin/customers/search?whatsapp=123456&whatsapp=654321", "/admin/customers/search?whatsapp[x]=123456"]) {
      assert.equal((await fetch(url + path)).status, 400);
    }
    const response = await fetch(url + "/admin/customers", { method: "POST", headers, body: "{}" });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "CUSTOMER_INVALID_INPUT", reason: "full_name_invalid" });
  });
});

test("customer HTTP duplicate is a stable 409 conflict", async () => {
  await withServer(async url => {
    const response = await fetch(url + "/admin/customers", { method: "POST", headers, body: JSON.stringify(customer) });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "CUSTOMER_DUPLICATE_WHATSAPP" });
  }, session, { async createManual() { return { status: "duplicate" }; } });
});

test("customer HTTP persistence failures do not expose PII or internal causes", async () => {
  const fail = async (): Promise<never> => { throw new Error("secret database detail"); };
  await withServer(async url => {
    for (const [path, method] of [["/admin/customers", "GET"], ["/admin/customers/search?whatsapp=123456", "GET"], ["/admin/customers", "POST"], [`/admin/customers/${customer.id}`, "GET"]] as const) {
      const response = await fetch(url + path, { method, headers, ...(method === "POST" ? { body: JSON.stringify(customer) } : {}) });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "CUSTOMER_ROUTE_UNEXPECTED_FAILURE" });
    }
  }, session, { listActive: fail, searchActive: fail, createManual: fail, getDetail: fail });
});

test("customer detail returns the profile, 404 for unknown ids, 400 for malformed ids, and keeps /search routed", async () => {
  await withServer(async url => {
    const ok = await fetch(`${url}/admin/customers/${customer.id}`, { headers });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { customer, subscriptions: [] });
    const missing = await fetch(`${url}/admin/customers/44444444-4444-4444-4444-444444444444`, { headers });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "CUSTOMER_NOT_FOUND" });
    const malformed = await fetch(`${url}/admin/customers/not-a-uuid`, { headers });
    assert.equal(malformed.status, 400);
    const search = await fetch(`${url}/admin/customers/search?whatsapp=%2B24100000000`, { headers });
    assert.equal(search.status, 200);
    assert.deepEqual(await search.json(), { customers: [customer] });
  }, session, { async getDetail(id) { return id === customer.id ? { customer, subscriptions: [] } : null; } });
});

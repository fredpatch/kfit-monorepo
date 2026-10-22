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
  const repository: CustomersRepository = { async listActive() { return [customer]; }, async searchActive() { return [customer]; }, async createManual() { return { status: "ok", customer }; }, async getDetail() { return { customer, subscriptions: [] }; }, async getAnalyticsSource() { return { customerId: customer.id, subscriptions: [], appointments: [], followUps: [], links: [], rescheduleRequests: [] }; }, async getOverviewSource() { return { customers: [customer], subscriptions: [], completedAppointments: [], followUps: [], upcomingAppointments: [] }; }, ...overrides };
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
      for (const [path, method] of [["/admin/customers", "GET"], ["/admin/customers/search?whatsapp=123456", "GET"], ["/admin/customers", "POST"], [`/admin/customers/${customer.id}`, "GET"], [`/admin/customers/${customer.id}/analytics`, "GET"], ["/admin/customers/overview", "GET"]] as const) {
        const response = await fetch(url + path, { method, headers, ...(method === "POST" ? { body: "{}" } : {}) });
        assert.equal(response.status, role ? 403 : 401);
      }
    }, role ? { ...session, role } : null, { listActive: fail, searchActive: fail, createManual: fail, getDetail: fail, getAnalyticsSource: fail, getOverviewSource: fail });
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
    for (const [path, method] of [["/admin/customers", "GET"], ["/admin/customers/search?whatsapp=123456", "GET"], ["/admin/customers", "POST"], [`/admin/customers/${customer.id}`, "GET"], [`/admin/customers/${customer.id}/analytics`, "GET"], ["/admin/customers/overview", "GET"]] as const) {
      const response = await fetch(url + path, { method, headers, ...(method === "POST" ? { body: JSON.stringify(customer) } : {}) });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "CUSTOMER_ROUTE_UNEXPECTED_FAILURE" });
    }
  }, session, { listActive: fail, searchActive: fail, createManual: fail, getDetail: fail, getAnalyticsSource: fail, getOverviewSource: fail });
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

test("customer analytics returns the read-only analytics, 404 for unknown ids and 400 for invalid queries", async () => {
  await withServer(async url => {
    const ok = await fetch(`${url}/admin/customers/${customer.id}/analytics?periode=tout`, { headers });
    assert.equal(ok.status, 200);
    const body = await ok.json() as { analytics: { customerId: string; period: string; journey: unknown[] } };
    assert.equal(body.analytics.customerId, customer.id);
    assert.equal(body.analytics.period, "tout");
    assert.deepEqual(body.analytics.journey, []);
    const missing = await fetch(`${url}/admin/customers/44444444-4444-4444-4444-444444444444/analytics`, { headers });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "CUSTOMER_NOT_FOUND" });
    for (const query of ["?periode=semaine", "?periode=30j&periode=tout", "?abonnement=not-a-uuid"]) {
      const invalid = await fetch(`${url}/admin/customers/${customer.id}/analytics${query}`, { headers });
      assert.equal(invalid.status, 400);
    }
  }, session, { async getAnalyticsSource(id) { return id === customer.id ? { customerId: id, subscriptions: [], appointments: [], followUps: [], links: [], rescheduleRequests: [] } : null; } });
});

test("customer overview is served at its literal path (not captured by :customerId) with rows and view counts", async () => {
  await withServer(async url => {
    const response = await fetch(`${url}/admin/customers/overview`, { headers });
    assert.equal(response.status, 200);
    const body = await response.json() as { customers: Array<{ customer: { id: string }; clientStatus: string; views: string[] }>; counts: Record<string, number> };
    assert.deepEqual(body.customers.map((row) => [row.customer.id, row.clientStatus, row.views]), [[customer.id, "none", ["all"]]]);
    assert.deepEqual(body.counts, { all: 1, active: 0, overdue: 0, preparation: 0, paused: 0, former: 0 });
  }, session, { async getDetail() { assert.fail("overview must not reach the detail route"); } });
});

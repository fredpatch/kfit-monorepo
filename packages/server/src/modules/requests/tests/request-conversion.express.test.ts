import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, type RequestConversionResponse } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { AdminRequestsController } from "../controllers/admin-requests.controller.js";
import { RequestConversionController } from "../controllers/request-conversion.controller.js";
import { createExpressAdminRequestsRouter } from "../routes/express-admin-requests.router.js";
import { RequestConversionService, type RequestConversionRepository } from "../services/request-conversion.service.js";

const id = "11111111-1111-1111-1111-111111111111";
const session: AuthenticatedSessionContext = { userId: id, sessionId: id, role: "admin" };
const response: RequestConversionResponse = {
  request: { id, status: "converted", convertedSubscriptionId: id }, customerResolution: "created",
  subscription: { id, reference: "SUB-SYNTHETIC", customerId: id, sourceRequestId: id, serviceId: id, variantId: id,
    status: "onboarding", agreedPriceXaf: 45000, currency: "XAF", plannedStartDate: "2026-11-01T00:00:00.000Z", createdByUserId: id, capacityReservedUntil: null },
};
const csrf = "synthetic-conversion-csrf";
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf };
const path = `/admin/requests/${id}/convert`;
async function withServer(run: (base: string) => Promise<void>, repository: RequestConversionRepository, auth: AuthenticatedSessionContext | null = session) {
  const fail = async (): Promise<never> => assert.fail("unrelated request command called");
  const controller = new AdminRequestsController({ listQueue: fail, getDetail: fail, logContactAttempt: fail, transitionStatus: fail, recordQualificationReview: fail, createWaitlistEntry: fail, withdrawWaitlistEntry: fail });
  const app = express();
  app.use(express.json());
  app.use(createExpressAdminRequestsRouter({ controller, conversionController: new RequestConversionController(new RequestConversionService(repository)), resolveSession: () => auth }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

for (const role of [null, "coach"] as const) {
  test(`conversion POST denies ${role ?? "unauthenticated"} caller before persistence`, async () => {
    await withServer(async base => {
      const result = await fetch(base + path, { method: "POST", headers, body: "{}" });
      assert.equal(result.status, role ? 403 : 401);
      assert.deepEqual(await result.json(), { error: role ? "REQUEST_ADMIN_FORBIDDEN" : "AUTH_SESSION_REQUIRED" });
    }, { async convert() { assert.fail("unauthorized conversion"); } }, role ? { ...session, role } : null);
  });
}

test("conversion POST requires same-origin and matching CSRF tokens", async () => {
  await withServer(async base => {
    for (const [requestHeaders, code] of [[{ "content-type": "application/json" }, "AUTH_CSRF_INVALID"],
      [{ ...headers, "x-csrf-token": "wrong" }, "AUTH_CSRF_INVALID"], [{ ...headers, origin: "https://other.invalid" }, "AUTH_ORIGIN_INVALID"]] as const) {
      const result = await fetch(base + path, { method: "POST", headers: requestHeaders, body: "{}" });
      assert.equal(result.status, 403);
      assert.deepEqual(await result.json(), { error: code });
    }
  }, { async convert() { assert.fail("unprotected conversion"); } });
});

test("conversion POST serializes a successful hard commit as 201", async () => {
  await withServer(async base => {
    const result = await fetch(base + path, { method: "POST", headers: { ...headers, origin: base }, body: '{"plannedStartDate":"2026-11-01"}' });
    assert.equal(result.status, 201);
    assert.deepEqual(await result.json(), response);
  }, { async convert(requestId, start, actor) { assert.equal(requestId, id); assert.equal(start?.toISOString(), "2026-11-01T00:00:00.000Z"); assert.equal(actor.userId, session.userId); return { status: "ok", response }; } });
});

test("conversion POST rejects malformed payloads and attempts to override commercial values", async () => {
  await withServer(async base => {
    for (const body of [[], { agreedPriceXaf: 1 }, { serviceId: id }, { plannedStartDate: "2026-02-30" }]) {
      const result = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
      assert.equal(result.status, 400);
      assert.deepEqual(await result.json(), { error: "REQUEST_INVALID_INPUT" });
    }
    assert.equal((await fetch(base + "/admin/requests/invalid/convert", { method: "POST", headers, body: "{}" })).status, 400);
  }, { async convert() { assert.fail("invalid conversion reached persistence"); } });
});

for (const [status, code, http] of [
  ["not_found", "REQUEST_NOT_FOUND", 404], ["already_converted", "REQUEST_ALREADY_CONVERTED", 409],
  ["not_eligible", "REQUEST_CONVERSION_NOT_ELIGIBLE", 409], ["qualification_invalid", "REQUEST_CONVERSION_QUALIFICATION_INVALID", 409],
  ["start_date_required", "REQUEST_CONVERSION_START_DATE_REQUIRED", 400],
] as const) {
  test(`conversion POST maps ${status} to ${code}`, async () => {
    await withServer(async base => {
      const result = await fetch(base + path, { method: "POST", headers, body: "{}" });
      assert.equal(result.status, http);
      assert.deepEqual(await result.json(), { error: code });
    }, { async convert() { return { status }; } });
  });
}

test("conversion POST hides internal persistence details on failure", async () => {
  await withServer(async base => {
    const result = await fetch(base + path, { method: "POST", headers, body: "{}" });
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), { error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
  }, { async convert() { throw new Error("synthetic secret detail"); } });
});

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, subscriptionApiRoutes, subscriptionCommands } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { SubscriptionsController } from "../controllers/subscriptions.controller.js";
import { createExpressSubscriptionsRouter } from "../routes/express-subscriptions.router.js";
import { SubscriptionsService, type SubscriptionsRepository } from "../services/subscriptions.service.js";
const id = "11111111-1111-1111-1111-111111111111";
const session: AuthenticatedSessionContext = { userId: id, sessionId: id, role: "admin" };
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=synthetic`, "x-csrf-token": "synthetic" };
const routes = [subscriptionApiRoutes.detail, ...subscriptionCommands.map(action => subscriptionApiRoutes[action])].map((path, i) => ({ path: path.replace(":subscriptionId", id), method: i === 0 ? "GET" : "POST" }));
async function server(run: (base: string) => Promise<void>, repo: SubscriptionsRepository, auth: AuthenticatedSessionContext | null = session) {
  const app = express(); app.use(express.json()); app.use(createExpressSubscriptionsRouter({ controller: new SubscriptionsController(new SubscriptionsService(repo)), resolveSession: () => auth }));
  const instance = createServer(app); instance.listen(0, "127.0.0.1"); await once(instance, "listening");
  try { await run(`http://127.0.0.1:${(instance.address() as AddressInfo).port}`); }
  finally { instance.closeAllConnections(); await new Promise<void>((resolve, reject) => instance.close(error => error ? reject(error) : resolve())); }
}
for (const role of [null, "coach"] as const) test(`all lifecycle routes reject ${role ?? "unauthenticated"} callers`, async () => {
  await server(async base => { for (const route of routes) { const result = await fetch(base + route.path, { method: route.method, headers, ...(route.method === "POST" ? { body: "{}" } : {}) }); assert.equal(result.status, role ? 403 : 401); } }, { async execute() { assert.fail("unauthorized repository access"); } }, role ? { ...session, role } : null);
});
test("every lifecycle route rejects foreign origin and every mutation requires CSRF", async () => {
  await server(async base => { for (const route of routes) {
    const result = await fetch(base + route.path, { method: route.method, headers: { ...headers, origin: "https://foreign.invalid" }, ...(route.method === "POST" ? { body: "{}" } : {}) }); assert.equal(result.status, 403); assert.deepEqual(await result.json(), { error: "AUTH_ORIGIN_INVALID" });
    if (route.method === "POST") { const missing = await fetch(base + route.path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); assert.equal(missing.status, 403); assert.deepEqual(await missing.json(), { error: "AUTH_CSRF_INVALID" }); }
  } }, { async execute() { assert.fail("unprotected persistence"); } });
});
test("HTTP maps lifecycle conflict, missing and unexpected errors without internal detail", async () => {
  for (const [error, status] of [["SUBSCRIPTION_BLOCKED", 409], ["SUBSCRIPTION_NOT_FOUND", 404], ["SUBSCRIPTION_DURATION_INVALID", 409]] as const) await server(async base => {
    const result = await fetch(base + routes[1]!.path, { method: "POST", headers, body: "{}" }); assert.equal(result.status, status); assert.deepEqual(await result.json(), { error });
  }, { async execute(_id, _command, actor) { assert.equal(actor.userId, id); return { status: "error", error }; } });
  await server(async base => { const result = await fetch(base + routes[0]!.path); assert.equal(result.status, 500); assert.deepEqual(await result.json(), { error: "SUBSCRIPTION_ROUTE_UNEXPECTED_FAILURE" }); }, { async execute() { throw new Error("private SQL detail"); } });
});
test("HTTP forbids mass assignment and has no generic PATCH status route", async () => {
  await server(async base => {
    const response = await fetch(base + routes[1]!.path, { method: "POST", headers, body: '{"status":"active"}' }); assert.equal(response.status, 400);
    assert.equal((await fetch(base + routes[0]!.path, { method: "PATCH", headers, body: '{"status":"active"}' })).status, 404);
  }, { async execute() { assert.fail("invalid input reached repository"); } });
});

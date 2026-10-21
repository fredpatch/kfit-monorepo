import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, progressApiRoutes } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { ProgressController } from "../controllers/progress.controller.js";
import { createExpressProgressRouter } from "../routes/express-progress.router.js";
import { ProgressService, type ProgressRepository } from "../services/progress.service.js";
const id = "11111111-1111-1111-1111-111111111111", auth: AuthenticatedSessionContext = { userId: id, sessionId: id, role: "admin" };
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=synthetic`, "x-csrf-token": "synthetic" };
const path = (value: string) => value.replace(":subscriptionId", id).replace(":goalId", id);
const routes = [
  { method: "GET", path: path(progressApiRoutes.progress) }, { method: "GET", path: path(progressApiRoutes.goals) },
  { method: "POST", path: path(progressApiRoutes.measurements) }, { method: "POST", path: path(progressApiRoutes.goals) },
  ...[progressApiRoutes.pause, progressApiRoutes.resume, progressApiRoutes.cancel, progressApiRoutes.confirmOutcome].map(value => ({ method: "POST", path: path(value) })),
];
const denied: ProgressRepository = { async execute() { assert.fail("unauthorized persistence"); } };
async function server(run: (base: string) => Promise<void>, repository = denied, session: AuthenticatedSessionContext | null = auth) {
  const app = express(); app.use(express.json()); app.use(createExpressProgressRouter({ controller: new ProgressController(new ProgressService(repository)), resolveSession: () => session }));
  const instance = createServer(app); instance.listen(0, "127.0.0.1"); await once(instance, "listening");
  try { await run(`http://127.0.0.1:${(instance.address() as AddressInfo).port}`); }
  finally { instance.closeAllConnections(); await new Promise<void>((resolve, reject) => instance.close(error => error ? reject(error) : resolve())); }
}
for (const role of [null, "coach"] as const) test(`every progress/goal route denies ${role ?? "anonymous"}`, async () => {
  await server(async base => { for (const route of routes) assert.equal((await fetch(base + route.path, { method: route.method, headers, ...(route.method === "GET" ? {} : { body: "{}" }) })).status, role ? 403 : 401); }, denied, role ? { ...auth, role } : null);
});
test("every progress/goal mutation enforces same origin and CSRF", async () => {
  await server(async base => { for (const route of routes.filter(r => r.method === "POST")) {
    assert.equal((await fetch(base + route.path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 403);
    const response = await fetch(base + route.path, { method: "POST", headers: { ...headers, origin: "https://foreign.invalid" }, body: "{}" });
    assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: "AUTH_ORIGIN_INVALID" });
  } });
});
test("progress HTTP has no update/delete/public paths or status mass assignment", async () => {
  await server(async base => {
    for (const method of ["PATCH", "DELETE"]) assert.equal((await fetch(base + path(progressApiRoutes.measurements), { method, headers, body: "{}" })).status, 404);
    assert.equal((await fetch(base + "/public/progress/synthetic")).status, 404);
    assert.equal((await fetch(base + path(progressApiRoutes.pause), { method: "POST", headers, body: '{"status":"achieved"}' })).status, 400);
  });
});
test("progress HTTP maps typed errors without disclosing private failures", async () => {
  for (const [error, expected] of [["GOAL_NOT_FOUND", 404], ["GOAL_TRANSITION_INVALID", 409], ["GOAL_INVALID_INPUT", 400]] as const) await server(async base => {
    const response = await fetch(base + path(progressApiRoutes.pause), { method: "POST", headers, body: "{}" }); assert.equal(response.status, expected); assert.deepEqual(await response.json(), { error });
  }, { async execute() { return { ok: false, error }; } });
  await server(async base => { const response = await fetch(base + path(progressApiRoutes.progress)); assert.equal(response.status, 500); assert.equal(response.headers.get("cache-control"), "no-store"); assert.deepEqual(await response.json(), { error: "PROGRESS_ROUTE_UNEXPECTED_FAILURE" }); }, { async execute() { throw new Error("Private synthetic health note"); } });
});

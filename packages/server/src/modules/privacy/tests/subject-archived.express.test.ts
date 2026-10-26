import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, followUpApiRoutes } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { FollowUpsController } from "../../follow-ups/controllers/follow-ups.controller.js";
import { createExpressFollowUpsRouter } from "../../follow-ups/routes/express-follow-ups.router.js";
import { FollowUpsService } from "../../follow-ups/services/follow-ups.service.js";
import { SubjectArchivedError } from "../repositories/subject-freeze.js";

const admin: AuthenticatedSessionContext = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", role: "admin" };
const csrf = "synthetic-freeze-csrf";
const headers = { "content-type": "application/json", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf };
const followUpId = "33333333-3333-4333-8333-333333333333";

async function withRouter(failure: Error, run: (url: string) => Promise<void>) {
  const service = new FollowUpsService({ async execute() { throw failure; } });
  const app = express(); app.use(express.json());
  app.use(createExpressFollowUpsRouter({ controller: new FollowUpsController(service), resolveSession: () => admin }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("ARCH-01 D1: a module router answers 409 with the frozen-subject code; other failures stay 500", async () => {
  const path = followUpApiRoutes.complete.replace(":followUpId", followUpId);
  await withRouter(new SubjectArchivedError("CUSTOMER_ARCHIVED"), async (url) => {
    const response = await fetch(url + path, { method: "POST", headers, body: "{}" });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "CUSTOMER_ARCHIVED" });
  });
  await withRouter(new Error("unexpected"), async (url) => {
    assert.equal((await fetch(url + path, { method: "POST", headers, body: "{}" })).status, 500);
  });
});

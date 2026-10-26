import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { requestsApiRoutes } from "@kfit/shared";
import { createServerApp } from "../app.js";
import { AuthController } from "../modules/auth/controllers/auth.controller.js";
import { RequestsController } from "../modules/requests/controllers/requests.controller.js";
import { CANONICAL_UUID_PATTERN } from "./request-id.middleware.js";

const unused = async (): Promise<never> => { throw new Error("unused in this test"); };

async function withApp(run: (url: string, seen: string[]) => Promise<void>) {
  const seen: string[] = [];
  const app = createServerApp({
    authController: new AuthController({ otpChallengeService: { issue: unused, verify: unused } }),
    resolveAuthSession: () => null,
    requestsController: new RequestsController({ async submit(_input, context) { seen.push(context.requestId ?? ""); throw new Error("synthetic stop after the handler saw the id"); } }),
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const submit = (url: string, headers: Headers) => {
  headers.set("content-type", "application/json");
  return fetch(url + requestsApiRoutes.publicSubmit, { method: "POST", headers, body: "{}" });
};

test("S7.4 D4: a canonical UUID request id (any version, any case) is kept, seen by the route and echoed", async () => {
  await withApp(async (url, seen) => {
    for (const id of [randomUUID(), randomUUID().toUpperCase(), "00000000-0000-0000-0000-000000000000"]) {
      const response = await submit(url, new Headers({ "x-request-id": id }));
      assert.equal(response.headers.get("x-request-id"), id);
      assert.equal(seen.at(-1), id);
    }
  });
});

test("S7.4 D4: a missing, empty, malformed, oversized or repeated request id is replaced by a generated UUID, the same one the route sees", async () => {
  const repeated = new Headers();
  repeated.append("x-request-id", randomUUID());
  repeated.append("x-request-id", randomUUID());
  const cases: Array<[string, Headers]> = [
    ["absent", new Headers()],
    ["empty", new Headers({ "x-request-id": "" })],
    ["abc", new Headers({ "x-request-id": "abc" })],
    ["200 chars", new Headers({ "x-request-id": "a".repeat(200) })],
    ["uuid with suffix", new Headers({ "x-request-id": `${randomUUID()}x` })],
    ["two headers", repeated],
  ];
  // One app per case: the public request route is rate-limited per IP.
  for (const [label, headers] of cases) await withApp(async (url, seen) => {
    const sent = headers.get("x-request-id");
    const response = await submit(url, headers);
    const echoed = response.headers.get("x-request-id") ?? "";
    assert.match(echoed, CANONICAL_UUID_PATTERN, label);
    assert.notEqual(echoed, sent, label);
    assert.deepEqual(seen, [echoed], label);
  });
  await withApp(async (url) => {
    const health = await fetch(url + "/health", { headers: { "x-request-id": "nope" } });
    assert.match(health.headers.get("x-request-id") ?? "", CANONICAL_UUID_PATTERN);
  });
});

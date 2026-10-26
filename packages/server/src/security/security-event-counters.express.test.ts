import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { receiptApiRoutes, requestsApiRoutes } from "@kfit/shared";
import { createServerApp } from "../app.js";
import { AuthController } from "../modules/auth/controllers/auth.controller.js";
import { ReceiptsController } from "../modules/receipts/controllers/receipts.controller.js";
import { RequestsController } from "../modules/requests/controllers/requests.controller.js";
import { REQUEST_ENCODING_UNSUPPORTED } from "./reject-encoded-request-bodies.js";
import { createSecurityEventCounter, type SecurityEventRecorder } from "./security-event-counters.js";

const unused = async (): Promise<never> => { throw new Error("unused in this test"); };
const synthetic = async (): Promise<never> => { throw new Error("synthetic stop after the limiter"); };

async function withApp(recordSecurityEvent: SecurityEventRecorder, run: (url: string) => Promise<void>) {
  const app = createServerApp({
    authController: new AuthController({ otpChallengeService: { issue: unused, verify: unused } }),
    resolveAuthSession: () => null,
    requestsController: new RequestsController({ submit: synthetic }),
    receiptsController: new ReceiptsController({ execute: synthetic }),
    recordSecurityEvent,
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const encoded = (url: string) => fetch(url + requestsApiRoutes.publicSubmit, { method: "POST", body: "{}", headers: { "content-type": "application/json", "content-encoding": "br" } });
const submit = (url: string) => fetch(url + requestsApiRoutes.publicSubmit, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
const receipt = (url: string) => fetch(url + receiptApiRoutes.publicMetadata.replace(":token", "synthetic-token"));

/** Calls until the first 429 and returns its status and body (the limiter allows `max` per minute). */
async function untilLimited(call: () => Promise<Response>, max: number) {
  for (let i = 0; i < max; i += 1) assert.notEqual((await call()).status, 429, `call ${i + 1} is under the limit`);
  const limited = await call();
  return { status: limited.status, body: await limited.json() as unknown };
}

test("S7.4b B9: a 415 records REQUEST_ENCODING_UNSUPPORTED; 429s record RATE_LIMITED:<router>; allowed calls record nothing", async () => {
  const codes: string[] = [];
  await withApp((code) => { codes.push(code); }, async (url) => {
    assert.equal((await encoded(url)).status, 415);
    assert.deepEqual(codes, [REQUEST_ENCODING_UNSUPPORTED]);
    assert.deepEqual(await untilLimited(() => submit(url), 5), { status: 429, body: { error: "REQUEST_RATE_LIMITED" } });
    assert.deepEqual(await untilLimited(() => receipt(url), 30), { status: 429, body: { error: "RECEIPT_RATE_LIMITED" } });
  });
  assert.deepEqual(codes, [REQUEST_ENCODING_UNSUPPORTED, "RATE_LIMITED:requests", "RATE_LIMITED:receipts"]);
});

test("S7.4b B9: a failing counter store never changes the 415 / 429 response and warns at most once per minute", async () => {
  const warnings: string[] = [];
  const rejecting = () => Promise.reject(new Error("synthetic database down"));
  const throwing = (): Promise<never> => { throw new TypeError("synthetic driver failure"); };
  for (const increment of [rejecting, throwing]) {
    warnings.length = 0;
    const counter = createSecurityEventCounter(increment, { warn: (line) => warnings.push(line) });
    await withApp(counter, async (url) => {
      for (let i = 0; i < 3; i += 1) {
        const response = await encoded(url);
        assert.equal(response.status, 415);
        assert.deepEqual(await response.json(), { error: REQUEST_ENCODING_UNSUPPORTED });
      }
      assert.deepEqual(await untilLimited(() => submit(url), 5), { status: 429, body: { error: "REQUEST_RATE_LIMITED" } });
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(warnings.length, 1, "throttled to one line per minute");
    assert.match(warnings[0]!, /^✖ security event counter write failed \((Error|TypeError)\)$/);
    assert.doesNotMatch(warnings[0]!, /synthetic/, "no error message, only its type");
  }
});

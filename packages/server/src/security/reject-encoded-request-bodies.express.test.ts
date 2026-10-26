import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { authCookieNames, documentApiRoutes, paymentProofApiRoutes, requestsApiRoutes } from "@kfit/shared";
import { createServerApp } from "../app.js";
import { AuthController } from "../modules/auth/controllers/auth.controller.js";
import type { AuthenticatedSessionContext } from "../modules/auth/types/auth.http.types.js";
import { DocumentsController } from "../modules/documents/controllers/documents.controller.js";
import { DocumentsService } from "../modules/documents/services/documents.service.js";
import { PaymentProofsController } from "../modules/payment-proofs/controllers/payment-proofs.controller.js";
import { RequestsController } from "../modules/requests/controllers/requests.controller.js";
import { REQUEST_ENCODING_UNSUPPORTED } from "./reject-encoded-request-bodies.js";

const admin: AuthenticatedSessionContext = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", role: "admin" };
const subscriptionId = "33333333-3333-4333-8333-333333333333";
const csrf = "synthetic-encoding-csrf";
const unused = async (): Promise<never> => { throw new Error("unused in this test"); };
// A short body that only looks compressed; no real Brotli payload is ever sent.
const body = Buffer.from("not-really-compressed");

async function withApp(run: (url: string, reached: string[]) => Promise<void>) {
  const reached: string[] = [];
  const app = createServerApp({
    authController: new AuthController({ otpChallengeService: { issue: unused, verify: unused } }),
    resolveAuthSession: () => admin,
    requestsController: new RequestsController({ async submit() { reached.push("request"); throw new Error("synthetic stop after the handler ran"); } }),
    documentsController: new DocumentsController(new DocumentsService(
      { execute: unused, summaryData: unused },
      { async persist() { reached.push("document"); throw new Error("synthetic stop after raw()"); }, read: unused, remove: async () => undefined },
      { templateVersion: "synthetic", render: unused },
    )),
    paymentProofsController: new PaymentProofsController({ execute: unused, async upload() { reached.push("proof"); throw new Error("synthetic stop after raw()"); } }),
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, reached); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const submit = (url: string, encoding?: string) => fetch(url + requestsApiRoutes.publicSubmit, {
  method: "POST", body: JSON.stringify({ synthetic: true }), headers: { "content-type": "application/json", ...(encoding === undefined ? {} : { "content-encoding": encoding }) },
});

test("SEC-01 D4: a JSON body sent with a request encoding other than identity is refused with 415 before the route runs", async () => {
  await withApp(async (url, reached) => {
    for (const encoding of ["br", "gzip", "deflate", "BR", " gzip ", "identity, br", "br, identity"]) {
      const response = await submit(url, encoding);
      assert.equal(response.status, 415, encoding);
      assert.deepEqual(await response.json(), { error: REQUEST_ENCODING_UNSUPPORTED });
    }
    assert.deepEqual(reached, []);
  });
});

test("SEC-01 D4: no header or exactly identity (any case, trimmed) reaches the route; a GET without body is unaffected", async () => {
  await withApp(async (url, reached) => {
    assert.notEqual((await submit(url)).status, 415);
    assert.notEqual((await submit(url, "identity")).status, 415);
    assert.notEqual((await submit(url, " Identity ")).status, 415);
    assert.deepEqual(reached, ["request", "request", "request"]);
    const health = await fetch(url + "/health");
    assert.equal(health.status, 200);
  });
});

test("SEC-01 D4: admin document upload and public payment-proof upload are refused before raw() reads the body", async () => {
  await withApp(async (url, reached) => {
    const document = await fetch(url + documentApiRoutes.create.replace(":subscriptionId", subscriptionId) + "?type=meal_plan", {
      method: "POST", body, headers: { "content-type": "application/pdf", "content-encoding": "br", "x-file-name": "plan.pdf", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf },
    });
    assert.equal(document.status, 415);
    assert.deepEqual(await document.json(), { error: REQUEST_ENCODING_UNSUPPORTED });

    const proof = await fetch(url + paymentProofApiRoutes.upload.replace(":token", "synthetic-token"), {
      method: "POST", body, headers: { "content-type": "image/png", "content-encoding": "gzip" },
    });
    assert.equal(proof.status, 415);
    assert.deepEqual(reached, []);

    const control = await fetch(url + documentApiRoutes.create.replace(":subscriptionId", subscriptionId) + "?type=meal_plan", {
      method: "POST", body, headers: { "content-type": "application/pdf", "x-file-name": "plan.pdf", cookie: `${authCookieNames.csrfToken}=${csrf}`, "x-csrf-token": csrf },
    });
    assert.notEqual(control.status, 415);
    assert.deepEqual(reached, ["document"]);
  });
});

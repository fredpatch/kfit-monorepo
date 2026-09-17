import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { requestsApiRoutes } from "@kfit/shared";
import { createExpressRequestsRouter } from "../routes/express-requests.router.js";
import { RequestsController } from "../controllers/requests.controller.js";
import { IpRateLimiter } from "../services/ip-rate-limiter.js";

type RequestsServiceFake = ConstructorParameters<typeof RequestsController>[0];

function makeService(overrides: Partial<RequestsServiceFake> = {}): RequestsServiceFake {
  return {
    async submit() {
      return {
        status: "ok",
        response: { request: { id: "request-1", reference: "REQ-1", status: "submitted", submittedAt: "2026-09-17T08:00:00.000Z" } },
      };
    },
    ...overrides,
  };
}

async function withTestServer<T>(
  controller: RequestsController,
  run: (baseUrl: string) => Promise<T>,
  rateLimiter: IpRateLimiter = new IpRateLimiter({ windowMs: 60_000, maxPerWindow: 1000 }),
): Promise<T> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(createExpressRequestsRouter({ controller, rateLimiter }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("Test server did not expose a TCP address");

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test("requests router accepts a public submission without authentication", async () => {
  const controller = new RequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${requestsApiRoutes.publicSubmit}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Awa", whatsapp: "+24106123456", serviceId: "service-1", submissionToken: "token-1" }),
    });

    assert.equal(response.status, 201);
    assert.equal((await response.json() as { request: { reference: string } }).request.reference, "REQ-1");
  });
});

test("requests router rejects cross-origin submissions", async () => {
  const controller = new RequestsController(makeService());

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${requestsApiRoutes.publicSubmit}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 403);
  });
});

test("requests router surfaces typed rejection errors from the controller", async () => {
  const controller = new RequestsController(makeService({
    async submit() {
      return { status: "waitlist_required" };
    },
  }));

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${requestsApiRoutes.publicSubmit}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "REQUEST_WAITLIST_REQUIRED" });
  });
});

test("requests router rejects unlisted services without disclosing catalogue details", async () => {
  const controller = new RequestsController(makeService({
    async submit() {
      return { status: "service_not_public" };
    },
  }));

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${requestsApiRoutes.publicSubmit}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "REQUEST_SERVICE_NOT_PUBLIC" });
  });
});

test("requests router rejects invalid variants with a generic error and no reason field", async () => {
  const controller = new RequestsController(makeService({
    async submit() {
      return { status: "variant_invalid" };
    },
  }));

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${requestsApiRoutes.publicSubmit}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "REQUEST_VARIANT_INVALID" });
  });
});

test("requests router returns a stable error on unexpected failures", async () => {
  const controller = new RequestsController(makeService({
    async submit() {
      throw new Error("boom");
    },
  }));

  await withTestServer(controller, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${requestsApiRoutes.publicSubmit}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "REQUEST_ROUTE_UNEXPECTED_FAILURE" });
  });
});

test("requests router enforces the per-IP rate limit", async () => {
  const controller = new RequestsController(makeService());
  const rateLimiter = new IpRateLimiter({ windowMs: 60_000, maxPerWindow: 1 });

  await withTestServer(controller, async (baseUrl) => {
    const first = await fetch(`${baseUrl}${requestsApiRoutes.publicSubmit}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(first.status, 201);

    const second = await fetch(`${baseUrl}${requestsApiRoutes.publicSubmit}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(second.status, 429);
    assert.deepEqual(await second.json(), { error: "REQUEST_RATE_LIMITED" });
  }, rateLimiter);
});

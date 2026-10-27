import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, receiptApiRoutes } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import { ReceiptsController } from "../controllers/receipts.controller.js";
import { ReceiptsService } from "../services/receipts.service.js";
import { createExpressReceiptsRouter } from "../routes/express-receipts.router.js";
import type { ReceiptsRepository } from "../services/receipts.types.js";
const id = "11111111-1111-1111-1111-111111111111",
  token = "a".repeat(43),
  auth: AuthenticatedSessionContext = {
    userId: id,
    sessionId: id,
    role: "admin",
  };
const headers = {
  "content-type": "application/json",
  cookie: `${authCookieNames.csrfToken}=synthetic`,
  "x-csrf-token": "synthetic",
};
const path = (v: string) =>
  v
    .replace(/:(subscriptionId|receiptId|paymentEventId|tokenId)/, id)
    .replace(":token", token);
const routes = Object.entries(receiptApiRoutes)
  .filter(([, p]) => p.startsWith("/admin/"))
  .map(([k, p]) => ({
    path: path(p),
    method: ["list", "detail", "pdf"].includes(k) ? "GET" : "POST",
  }));
const denied: ReceiptsRepository = {
  async execute() {
    assert.fail("Unauthorized persistence");
  },
};
async function server(
  run: (base: string) => Promise<void>,
  repo = denied,
  session: AuthenticatedSessionContext | null = auth,
  max = 100,
) {
  const app = express();
  app.use(express.json());
  app.use(
    createExpressReceiptsRouter({
      controller: new ReceiptsController(new ReceiptsService(repo)),
      resolveSession: () => session,
      rateLimiter: new IpRateLimiter({ windowMs: 60000, maxPerWindow: max }),
    }),
  );
  const instance = createServer(app);
  instance.listen(0, "127.0.0.1");
  await once(instance, "listening");
  try {
    await run(`http://127.0.0.1:${(instance.address() as AddressInfo).port}`);
  } finally {
    instance.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      instance.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
for (const role of [null, "coach"] as const)
  test(`every receipt admin route denies ${role ?? "anonymous"}`, async () => {
    await server(
      async (base) => {
        for (const route of routes)
          assert.equal(
            (
              await fetch(base + route.path, {
                method: route.method,
                headers,
                ...(route.method === "GET" ? {} : { body: "{}" }),
              })
            ).status,
            role ? 403 : 401,
          );
      },
      denied,
      role ? { ...auth, role } : null,
    );
  });
test("every receipt mutation enforces CSRF and same origin", async () => {
  await server(async (base) => {
    for (const route of routes.filter((r) => r.method === "POST")) {
      assert.equal(
        (
          await fetch(base + route.path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(base + route.path, {
            method: "POST",
            headers: { ...headers, origin: "https://foreign.invalid" },
            body: "{}",
          })
        ).status,
        403,
      );
    }
  });
});
test("receipt public metadata/PDF require no session and preserve access auditing on malformed queries", async () => {
  const actions: string[] = [];
  await server(
    async (base) => {
      for (const p of [
        path(receiptApiRoutes.publicMetadata),
        path(receiptApiRoutes.publicPdf) + "?amount=1",
      ]) {
        const r = await fetch(base + p);
        assert.equal(r.status, 400);
        assert.equal(r.headers.get("cache-control"), "no-store");
        assert.equal(r.headers.get("referrer-policy"), "no-referrer");
      }
    },
    {
      async execute(_id, c, actor) {
        assert.equal(actor.userId, null);
        actions.push(c.action);
        return { ok: false, error: "RECEIPT_LINK_INVALID" };
      },
    },
    null,
  );
  assert.deepEqual(actions, ["public-read", "invalid-public-input"]);
});
test("receipt public rate limiting and absence of generic mutation routes", async () => {
  await server(
    async (base) => {
      const url = base + path(receiptApiRoutes.publicMetadata);
      assert.equal((await fetch(url)).status, 400);
      assert.equal((await fetch(url)).status, 429);
      assert.equal(
        (
          await fetch(base + "/admin/receipts/" + id, {
            method: "PATCH",
            headers,
            body: "{}",
          })
        ).status,
        404,
      );
    },
    {
      async execute() {
        return { ok: false, error: "RECEIPT_LINK_INVALID" };
      },
    },
    null,
    1,
  );
});
test("receipt typed errors and unexpected failures expose no infrastructure details", async () => {
  for (const [error, status] of [
    ["RECEIPT_LINK_EXPIRED", 410],
    ["RECEIPT_LINK_REVOKED", 403],
    ["RECEIPT_LINK_CONSUMED", 409],
  ] as const)
    await server(
      async (base) => {
        const r = await fetch(base + path(receiptApiRoutes.publicMetadata));
        assert.equal(r.status, status);
        assert.deepEqual(await r.json(), { error });
      },
      {
        async execute() {
          return { ok: false, error };
        },
      },
      null,
    );
  await server(
    async (base) => {
      const r = await fetch(base + path(receiptApiRoutes.publicPdf));
      assert.equal(r.status, 500);
      assert.deepEqual(await r.json(), {
        error: "RECEIPT_ROUTE_UNEXPECTED_FAILURE",
      });
    },
    {
      async execute() {
        throw new Error("PRIVATE_SQL_STORAGE_BEARER");
      },
    },
    null,
  );
});

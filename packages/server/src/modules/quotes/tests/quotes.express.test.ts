import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, quoteApiRoutes } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import { QuotesController } from "../controllers/quotes.controller.js";
import { createExpressQuotesRouter } from "../routes/express-quotes.router.js";
import {
  QuotesService,
  type QuotesRepository,
} from "../services/quotes.service.js";
const id = "11111111-1111-1111-1111-111111111111",
  auth: AuthenticatedSessionContext = {
    userId: id,
    sessionId: id,
    role: "admin",
  };
const bearer = "a".repeat(43);
const headers = {
  "content-type": "application/json",
  cookie: `${authCookieNames.csrfToken}=synthetic`,
  "x-csrf-token": "synthetic",
};
const path = (value: string) =>
  value
    .replace(/:(subscriptionId|quoteId|versionId|tokenId)/, id)
    .replace(":token", bearer);
const adminRoutes = Object.entries(quoteApiRoutes)
  .filter(([, value]) => value.startsWith("/admin/"))
  .map(([key, value]) => ({
    method: ["list", "detail", "pdf"].includes(key) ? "GET" : "POST",
    path: path(value),
  }));
const denied: QuotesRepository = {
  async execute() {
    assert.fail("unauthorized persistence");
  },
};
async function server(
  run: (base: string) => Promise<void>,
  repository = denied,
  session: AuthenticatedSessionContext | null = auth,
  max = 100,
) {
  const app = express();
  app.use(express.json());
  app.use(
    createExpressQuotesRouter({
      controller: new QuotesController(new QuotesService(repository)),
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
  test(`all quote admin routes deny ${role ?? "anonymous"}`, async () => {
    await server(
      async (base) => {
        for (const route of adminRoutes)
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
test("all quote mutations require existing CSRF and same-origin guards", async () => {
  await server(async (base) => {
    for (const route of adminRoutes.filter((r) => r.method === "POST")) {
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
test("public quote response is bearer-only with same-origin protection and closed input", async () => {
  let calls = 0;
  await server(
    async (base) => {
      const response = await fetch(base + path(quoteApiRoutes.respond), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"decision":"accepted"}',
      });
      assert.equal(response.status, 409);
      assert.equal(calls, 1);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(
        (
          await fetch(base + path(quoteApiRoutes.respond), {
            method: "POST",
            headers: { ...headers, origin: "https://foreign.invalid" },
            body: '{"decision":"accepted"}',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(base + path(quoteApiRoutes.respond), {
            method: "PATCH",
            headers,
            body: "{}",
          })
        ).status,
        404,
      );
    },
    {
      async execute(_id, command, actor) {
        calls++;
        assert.equal(command.action, "respond");
        assert.equal(actor.userId, null);
        return { ok: false, error: "QUOTE_RESPONSE_CONFLICT" };
      },
    },
    null,
  );
});
test("public quote metadata and PDF share the per-IP rate limit", async () => {
  await server(
    async (base) => {
      assert.equal(
        (await fetch(base + path(quoteApiRoutes.publicDetail))).status,
        400,
      );
      const result = await fetch(base + path(quoteApiRoutes.publicPdf));
      assert.equal(result.status, 429);
      assert.deepEqual(await result.json(), { error: "QUOTE_RATE_LIMITED" });
    },
    {
      async execute() {
        return { ok: false, error: "QUOTE_LINK_INVALID" };
      },
    },
    null,
    1,
  );
});
test("quote routes redact internal database/storage/renderer errors", async () => {
  await server(
    async (base) => {
      const result = await fetch(base + path(quoteApiRoutes.publicDetail));
      assert.equal(result.status, 500);
      assert.equal(result.headers.get("cache-control"), "no-store");
      assert.deepEqual(await result.json(), {
        error: "QUOTE_ROUTE_UNEXPECTED_FAILURE",
      });
    },
    {
      async execute() {
        throw new Error("private bearer SQL Puppeteer storage path");
      },
    },
    null,
  );
});

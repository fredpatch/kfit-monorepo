import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, financeApiRoutes } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { FinanceController } from "../controllers/finance.controller.js";
import { createExpressFinanceRouter } from "../routes/express-finance.router.js";
import {
  FinanceService,
  type FinanceRepository,
} from "../services/finance.service.js";
const id = "11111111-1111-1111-1111-111111111111",
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
const path = (value: string) =>
  value
    .replace(":subscriptionId", id)
    .replace(":paymentPlanId", id)
    .replace(":paymentEventId", id);
const routes = Object.entries(financeApiRoutes).map(([name, value]) => ({
  method: name === "detail" ? "GET" : "POST",
  path: path(value),
}));
const denied: FinanceRepository = {
  async execute() {
    assert.fail("invalid or unauthorized persistence");
  },
};
async function server(
  run: (base: string) => Promise<void>,
  repository = denied,
  session: AuthenticatedSessionContext | null = auth,
) {
  const app = express();
  app.use(express.json());
  app.use(
    createExpressFinanceRouter({
      controller: new FinanceController(new FinanceService(repository)),
      resolveSession: () => session,
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
  test(`all finance routes deny ${role ?? "anonymous"}`, async () => {
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
test("all finance mutations enforce same-origin and CSRF", async () => {
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
      const foreign = await fetch(base + route.path, {
        method: "POST",
        headers: { ...headers, origin: "https://foreign.invalid" },
        body: "{}",
      });
      assert.equal(foreign.status, 403);
      assert.deepEqual(await foreign.json(), { error: "AUTH_ORIGIN_INVALID" });
    }
  });
});
test("finance has no public or generic status mutation and rejects extra allocation fields", async () => {
  await server(async (base) => {
    assert.equal(
      (
        await fetch(base + path(financeApiRoutes.detail), {
          method: "PATCH",
          headers,
          body: "{}",
        })
      ).status,
      404,
    );
    assert.equal((await fetch(base + "/public/finance/synthetic")).status, 404);
    assert.equal(
      (
        await fetch(base + path(financeApiRoutes.activate), {
          method: "POST",
          headers,
          body: '{"status":"active"}',
        })
      ).status,
      400,
    );
  });
});
test("finance errors remain typed and internal failures never expose SQL or references", async () => {
  for (const [error, expected] of [
    ["FINANCE_NOT_FOUND", 404],
    ["FINANCE_PLAN_ALREADY_ACTIVE", 409],
    ["FINANCE_INVALID_INPUT", 400],
  ] as const)
    await server(
      async (base) => {
        const result = await fetch(base + path(financeApiRoutes.cancel), {
          method: "POST",
          headers,
          body: "{}",
        });
        assert.equal(result.status, expected);
        assert.deepEqual(await result.json(), { error });
      },
      {
        async execute() {
          return { ok: false, error };
        },
      },
    );
  await server(
    async (base) => {
      const result = await fetch(base + path(financeApiRoutes.detail));
      assert.equal(result.status, 500);
      assert.equal(result.headers.get("cache-control"), "no-store");
      assert.deepEqual(await result.json(), {
        error: "FINANCE_ROUTE_UNEXPECTED_FAILURE",
      });
    },
    {
      async execute() {
        throw new Error("Synthetic private SQL/reference");
      },
    },
  );
});

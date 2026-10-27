import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { authCookieNames, followUpApiRoutes } from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { FollowUpsController } from "../controllers/follow-ups.controller.js";
import { createExpressFollowUpsRouter } from "../routes/express-follow-ups.router.js";
import {
  FollowUpsService,
  type FollowUpsRepository,
} from "../services/follow-ups.service.js";
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
  value.replace(":subscriptionId", id).replace(":followUpId", id);
const routes = [
  { method: "GET", path: path(followUpApiRoutes.list) },
  { method: "GET", path: followUpApiRoutes.queue },
  { method: "POST", path: path(followUpApiRoutes.list) },
  { method: "PUT", path: path(followUpApiRoutes.cadence) },
  { method: "POST", path: path(followUpApiRoutes.complete) },
  { method: "POST", path: path(followUpApiRoutes.cancel) },
];
const denied: FollowUpsRepository = {
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
    createExpressFollowUpsRouter({
      controller: new FollowUpsController(new FollowUpsService(repository)),
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
  test(`all follow-up routes deny ${role ?? "anonymous"} callers`, async () => {
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
test("all follow-up mutations including cadence PUT enforce origin and CSRF", async () => {
  await server(async (base) => {
    for (const route of routes.filter((r) => r.method !== "GET")) {
      const missing = await fetch(base + route.path, {
        method: route.method,
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(missing.status, 403);
      assert.deepEqual(await missing.json(), { error: "AUTH_CSRF_INVALID" });
      const foreign = await fetch(base + route.path, {
        method: route.method,
        headers: { ...headers, origin: "https://foreign.invalid" },
        body: "{}",
      });
      assert.equal(foreign.status, 403);
      assert.deepEqual(await foreign.json(), { error: "AUTH_ORIGIN_INVALID" });
    }
  });
});
test("follow-up HTTP forbids overdue/status mass assignment and public routes", async () => {
  await server(async (base) => {
    const result = await fetch(base + path(followUpApiRoutes.complete), {
      method: "POST",
      headers,
      body: '{"status":"overdue"}',
    });
    assert.equal(result.status, 400);
    assert.equal(
      (
        await fetch(base + path(followUpApiRoutes.list), {
          method: "PATCH",
          headers,
          body: '{"status":"overdue"}',
        })
      ).status,
      404,
    );
    assert.equal(
      (await fetch(base + "/public/follow-ups/synthetic")).status,
      404,
    );
  });
});
test("follow-up queue transports read-only response and authenticated actor", async () => {
  const body = { asOf: "2026-10-21T12:00:00.000Z", items: [] };
  await server(
    async (base) => {
      const result = await fetch(base + followUpApiRoutes.queue);
      assert.equal(result.status, 200);
      assert.equal(result.headers.get("cache-control"), "no-store");
      assert.deepEqual(await result.json(), body);
    },
    {
      async execute(_id, command, actor) {
        assert.equal(command.action, "queue");
        assert.equal(actor.userId, id);
        return { ok: true, body };
      },
    },
  );
});
test("follow-up HTTP maps typed domain conflicts and hides internal failures", async () => {
  for (const [error, status] of [
    ["FOLLOW_UP_NOT_FOUND", 404],
    ["FOLLOW_UP_TRANSITION_INVALID", 409],
    ["FOLLOW_UP_CADENCE_INVALID", 400],
  ] as const)
    await server(
      async (base) => {
        const result = await fetch(base + path(followUpApiRoutes.complete), {
          method: "POST",
          headers,
          body: "{}",
        });
        assert.equal(result.status, status);
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
      const result = await fetch(base + followUpApiRoutes.queue);
      assert.equal(result.status, 500);
      assert.deepEqual(await result.json(), {
        error: "FOLLOW_UP_ROUTE_UNEXPECTED_FAILURE",
      });
    },
    {
      async execute() {
        throw new Error("Synthetic private SQL/note");
      },
    },
  );
});

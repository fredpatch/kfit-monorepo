import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  authCookieNames,
  appointmentApiRoutes,
  appointmentActions,
} from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { AppointmentsController } from "../controllers/appointments.controller.js";
import { createExpressAppointmentsRouter } from "../routes/express-appointments.router.js";
import {
  AppointmentsService,
  type AppointmentsRepository,
} from "../services/appointments.service.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
const id = "11111111-1111-1111-1111-111111111111",
  token = "synthetic-token";
const auth: AuthenticatedSessionContext = {
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
    .replace(":appointmentId", id)
    .replace(":subscriptionId", id)
    .replace(":token", token);
const routes = [
  { path: path(appointmentApiRoutes.list), method: "GET" },
  { path: path(appointmentApiRoutes.list), method: "POST" },
  { path: path(appointmentApiRoutes.detail), method: "GET" },
  ...appointmentActions.map((action) => ({
    path: path(appointmentApiRoutes[action]),
    method: "POST",
  })),
];
const invalidRepo: AppointmentsRepository = {
  async execute() {
    assert.fail("unauthorized persistence");
  },
  async publicAccess() {
    assert.fail("unprotected public call");
  },
};
async function server(
  run: (base: string) => Promise<void>,
  repository: AppointmentsRepository = invalidRepo,
  session: AuthenticatedSessionContext | null = auth,
  max = 100,
) {
  const app = express();
  app.use(express.json());
  app.use(
    createExpressAppointmentsRouter({
      controller: new AppointmentsController(
        new AppointmentsService(repository),
      ),
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
  test(`all appointment admin routes deny ${role ?? "anonymous"}`, async () => {
    await server(
      async (base) => {
        for (const route of routes)
          assert.equal(
            (
              await fetch(base + route.path, {
                method: route.method,
                headers,
                ...(route.method === "POST" ? { body: "{}" } : {}),
              })
            ).status,
            role ? 403 : 401,
          );
      },
      invalidRepo,
      role ? { ...auth, role } : null,
    );
  });
test("all appointment admin mutations require origin and CSRF", async () => {
  await server(async (base) => {
    for (const route of routes.filter((r) => r.method === "POST")) {
      const missing = await fetch(base + route.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(missing.status, 403);
      assert.deepEqual(await missing.json(), { error: "AUTH_CSRF_INVALID" });
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
test("public appointment GET/POST need no session or CSRF but forbid foreign origin", async () => {
  await server(
    async (base) => {
      for (const method of ["GET", "POST"]) {
        const result = await fetch(base + path(appointmentApiRoutes.public), {
          method,
          headers: { "content-type": "application/json" },
          ...(method === "POST" ? { body: '{"action":"confirm"}' } : {}),
        });
        assert.equal(result.status, 404);
        assert.equal(result.headers.get("cache-control"), "no-store");
        assert.equal(result.headers.get("referrer-policy"), "no-referrer");
        const foreign = await fetch(base + path(appointmentApiRoutes.public), {
          method,
          headers: {
            "content-type": "application/json",
            origin: "https://foreign.invalid",
          },
          ...(method === "POST" ? { body: '{"action":"confirm"}' } : {}),
        });
        assert.equal(foreign.status, 403);
      }
    },
    {
      ...invalidRepo,
      async publicAccess(_token, _command, actor) {
        assert.equal(actor.userId, null);
        return { ok: false, error: "APPOINTMENT_TOKEN_INVALID" };
      },
    },
    null,
  );
});
test("public appointment access is rate limited", async () => {
  await server(
    async (base) => {
      const url = base + path(appointmentApiRoutes.public);
      assert.equal((await fetch(url)).status, 404);
      assert.equal((await fetch(url)).status, 429);
    },
    {
      ...invalidRepo,
      async publicAccess() {
        return { ok: false, error: "APPOINTMENT_TOKEN_INVALID" };
      },
    },
    null,
    1,
  );
});
test("appointment HTTP rejects mass assignment and generic status PATCH", async () => {
  await server(async (base) => {
    const result = await fetch(base + path(appointmentApiRoutes.confirm), {
      method: "POST",
      headers,
      body: '{"status":"completed","quantityConsumed":0}',
    });
    assert.equal(result.status, 400);
    assert.equal(
      (
        await fetch(base + path(appointmentApiRoutes.detail), {
          method: "PATCH",
          headers,
          body: '{"status":"completed"}',
        })
      ).status,
      404,
    );
  });
});
test("appointment failures are typed and internal exceptions never disclose details", async () => {
  for (const error of [
    "APPOINTMENT_TOKEN_EXPIRED",
    "APPOINTMENT_TOKEN_REVOKED",
    "APPOINTMENT_TOKEN_CONSUMED",
  ] as const)
    await server(
      async (base) => {
        const result = await fetch(base + path(appointmentApiRoutes.public));
        assert.equal(result.status, 410);
        assert.deepEqual(await result.json(), { error });
      },
      {
        ...invalidRepo,
        async publicAccess() {
          return { ok: false, error };
        },
      },
    );
  await server(
    async (base) => {
      const result = await fetch(base + path(appointmentApiRoutes.detail));
      assert.equal(result.status, 500);
      assert.deepEqual(await result.json(), {
        error: "APPOINTMENT_ROUTE_UNEXPECTED_FAILURE",
      });
    },
    {
      ...invalidRepo,
      async execute() {
        throw new Error("Synthetic private SQL and token data");
      },
    },
  );
});

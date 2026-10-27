import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { DashboardAnalyticsController } from "../controllers/analytics.controller.js";
import { DashboardAnalyticsService } from "../services/analytics.service.js";
import { createExpressDashboardAnalyticsRouter } from "../routes/express-analytics.router.js";

const admin: AuthenticatedSessionContext = {
  userId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
  role: "admin",
};
async function withServer(
  run: (url: string) => Promise<void>,
  session: AuthenticatedSessionContext | null = admin,
  fail = false,
) {
  const app = express();
  const service = new DashboardAnalyticsService({
    async snapshot() {
      if (fail) throw new Error("private database credentials");
      return {
        subscriptions: [],
        statuses: [],
        pauses: [],
        cadenceHistory: [],
        followUps: [],
        appointments: [],
        requests: [],
        contactedIds: new Set<string>(),
        qualifiedIds: new Set<string>(),
        finance: [],
      };
    },
  });
  app.use(
    createExpressDashboardAnalyticsRouter({
      controller: new DashboardAnalyticsController(service, {
        async alerts() {
          if (fail) throw new Error("private health data");
          return { asOf: "2026-10-22T10:00:00Z", alerts: [] };
        },
      }),
      resolveSession: () => session,
    }),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
for (const [session, expected] of [
  [null, 401],
  [{ ...admin, role: "coach" }, 403],
] as const)
  test(`new dashboard GET endpoints reject session with ${expected}`, async () => {
    await withServer(async (url) => {
      for (const route of ["analytics", "alerts"])
        assert.equal(
          (await fetch(`${url}/admin/dashboard/${route}`)).status,
          expected,
        );
    }, session);
  });
test("new dashboard GET endpoints permit admin and never register mutations", async () => {
  await withServer(async (url) => {
    for (const route of ["analytics", "alerts"]) {
      const response = await fetch(`${url}/admin/dashboard/${route}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      for (const method of ["POST", "PATCH", "DELETE"])
        assert.equal(
          (await fetch(`${url}/admin/dashboard/${route}`, { method })).status,
          404,
        );
    }
  });
});
test("dashboard analytics rejects invalid or repeated periods with a stable error", async () => {
  await withServer(async (url) => {
    for (const query of ["periode=1w", "periode=4w&periode=8w", "periode="]) {
      const response = await fetch(`${url}/admin/dashboard/analytics?${query}`);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "DASHBOARD_INVALID_INPUT",
      });
    }
  });
});
test("dashboard unexpected failures redact all private details", async () => {
  await withServer(
    async (url) => {
      for (const route of ["analytics", "alerts"]) {
        const response = await fetch(`${url}/admin/dashboard/${route}`);
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), {
          error: "DASHBOARD_ROUTE_UNEXPECTED_FAILURE",
        });
      }
    },
    admin,
    true,
  );
});

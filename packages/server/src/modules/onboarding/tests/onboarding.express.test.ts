import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  authCookieNames,
  onboardingApiRoutes,
  type OnboardingDetail,
} from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { OnboardingController } from "../controllers/onboarding.controller.js";
import { createExpressOnboardingRouter } from "../routes/express-onboarding.router.js";
import {
  OnboardingService,
  type OnboardingRepository,
} from "../services/onboarding.service.js";

const id = "11111111-1111-1111-1111-111111111111";
const session: AuthenticatedSessionContext = {
  userId: id,
  sessionId: id,
  role: "admin",
};
const csrf = "synthetic-onboarding-csrf";
const headers = {
  "content-type": "application/json",
  cookie: `${authCookieNames.csrfToken}=${csrf}`,
  "x-csrf-token": csrf,
};
const detail: OnboardingDetail = {
  subscription: {
    id,
    reference: "SUB-SYNTHETIC",
    status: "onboarding",
    plannedStartDate: "2026-11-01T00:00:00.000Z",
    capacityReservedUntil: null,
  },
  service: {
    id,
    name: "Synthetic Service",
    variantId: null,
    variantName: null,
  },
  policy: { source: "none", questionnaireRequired: false },
  capacity: {
    mode: "unlimited",
    limit: null,
    scope: "service",
    occupied: 0,
    expired: false,
    valid: true,
  },
  initialized: false,
  onboardingState: "blocked",
  canReady: false,
  items: [],
};
const routes = Object.entries(onboardingApiRoutes).map(([action, path]) => ({
  action,
  path: path.replace(":subscriptionId", id).replace(":itemId", id),
  method:
    action === "detail" ? "GET" : action === "reservation" ? "PUT" : "POST",
}));
async function withServer(
  run: (base: string) => Promise<void>,
  repository: OnboardingRepository,
  auth: AuthenticatedSessionContext | null = session,
) {
  const app = express();
  app.use(express.json());
  app.use(
    createExpressOnboardingRouter({
      controller: new OnboardingController(new OnboardingService(repository)),
      resolveSession: () => auth,
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
for (const role of [null, "coach"] as const) {
  test(`all onboarding routes deny ${role ?? "unauthenticated"} callers`, async () => {
    await withServer(
      async (base) => {
        for (const route of routes) {
          const response = await fetch(base + route.path, {
            method: route.method,
            headers,
            ...(route.method !== "GET" ? { body: "{}" } : {}),
          });
          assert.equal(response.status, role ? 403 : 401);
        }
      },
      {
        async execute() {
          assert.fail("unauthorized write/read");
        },
      },
      role ? { ...session, role } : null,
    );
  });
}
test("all onboarding mutations, including PUT reservation, require origin and CSRF checks", async () => {
  await withServer(
    async (base) => {
      for (const route of routes.filter((route) => route.method !== "GET")) {
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
        assert.deepEqual(await foreign.json(), {
          error: "AUTH_ORIGIN_INVALID",
        });
      }
    },
    {
      async execute() {
        assert.fail("unprotected write");
      },
    },
  );
});
test("onboarding HTTP commands serialize shared responses and authenticated actor context", async () => {
  const actions: string[] = [];
  await withServer(
    async (base) => {
      for (const route of routes) {
        const body =
          route.action === "waive"
            ? { reason: "Synthetic reason" }
            : route.action === "reservation"
              ? { capacityReservedUntil: "2026-11-01T00:00:00Z" }
              : {};
        const response = await fetch(base + route.path, {
          method: route.method,
          headers: { ...headers, origin: base },
          ...(route.method !== "GET" ? { body: JSON.stringify(body) } : {}),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { onboarding: detail });
      }
    },
    {
      async execute(subscriptionId, command, actor) {
        assert.equal(subscriptionId, id);
        assert.equal(actor.userId, id);
        actions.push(command.action);
        return { status: "ok", onboarding: detail };
      },
    },
  );
  assert.deepEqual(
    actions.sort(),
    ["read", "initialize", "complete", "waive", "reserve", "ready"].sort(),
  );
});
for (const [status, code, expected] of [
  ["item_forbidden", "ONBOARDING_ITEM_FORBIDDEN", 403],
  ["blocked", "ONBOARDING_BLOCKED", 409],
  ["capacity_exhausted", "ONBOARDING_CAPACITY_EXHAUSTED", 409],
  ["not_found", "ONBOARDING_NOT_FOUND", 404],
  ["invalid_state", "ONBOARDING_INVALID_STATE", 409],
] as const) {
  test(`onboarding HTTP maps ${status} to a stable error`, async () => {
    await withServer(
      async (base) => {
        const response = await fetch(base + routes[1]!.path, {
          method: "POST",
          headers,
          body: "{}",
        });
        assert.equal(response.status, expected);
        assert.deepEqual(await response.json(), { error: code });
      },
      {
        async execute() {
          return { status };
        },
      },
    );
  });
}
test("onboarding HTTP rejects malformed inputs before repository and hides persistence failures", async () => {
  await withServer(
    async (base) => {
      const waiver = routes.find((route) => route.action === "waive")!;
      const response = await fetch(base + waiver.path, {
        method: "POST",
        headers,
        body: '{"reason":" "}',
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "ONBOARDING_REASON_REQUIRED",
      });
    },
    {
      async execute() {
        assert.fail("invalid command reached persistence");
      },
    },
  );
  await withServer(
    async (base) => {
      const response = await fetch(base + routes[0]!.path);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        error: "ONBOARDING_ROUTE_UNEXPECTED_FAILURE",
      });
    },
    {
      async execute() {
        throw new Error("Synthetic internal detail");
      },
    },
  );
});

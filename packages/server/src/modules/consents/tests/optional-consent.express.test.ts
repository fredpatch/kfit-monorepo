import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  authCookieNames,
  consentApiRoutes,
  consentDefinitionApiRoutes,
} from "@kfit/shared";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import type { FreshOtpCheck } from "../../questionnaires/controllers/questionnaire.controller.js";
import { ConsentController } from "../controllers/consent.controller.js";
import { createExpressConsentRouter } from "../routes/express-consent.router.js";
import {
  ConsentDefinitionService,
  ConsentService,
  type ConsentDefinitionCommand,
  type ConsentDefinitionRepository,
  type ConsentRepository,
} from "../services/consent.service.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";

const id = randomUUID();
const csrf = "synthetic-consent-definition-csrf";
const session: AuthenticatedSessionContext = {
  userId: id,
  sessionId: id,
  role: "admin",
};
const headers = {
  "content-type": "application/json",
  cookie: `${authCookieNames.csrfToken}=${csrf}`,
  "x-csrf-token": csrf,
};
const consents: ConsentRepository = {
  async execute() {
    return { ok: true, body: { accepted: true } };
  },
  async publicAccess() {
    return { ok: false, error: "CONSENT_TYPE_NOT_REQUESTED" };
  },
};
const routes = [
  { method: "GET", path: consentDefinitionApiRoutes.list },
  { method: "POST", path: consentDefinitionApiRoutes.list },
  {
    method: "GET",
    path: consentDefinitionApiRoutes.detail.replace(":definitionId", id),
  },
  {
    method: "PATCH",
    path: consentDefinitionApiRoutes.detail.replace(":definitionId", id),
  },
  {
    method: "DELETE",
    path: consentDefinitionApiRoutes.detail.replace(":definitionId", id),
  },
  {
    method: "GET",
    path: consentDefinitionApiRoutes.publishImpact.replace(":definitionId", id),
  },
  {
    method: "POST",
    path: consentDefinitionApiRoutes.publish.replace(":definitionId", id),
  },
];
const fresh: FreshOtpCheck = {
  async lastConsumedAt() {
    return new Date();
  },
  windowMs: 300000,
};
async function withServer(
  run: (base: string, seen: ConsentDefinitionCommand[]) => Promise<void>,
  options: {
    auth?: AuthenticatedSessionContext | null;
    freshOtp?: FreshOtpCheck;
  } = {},
) {
  const seen: ConsentDefinitionCommand[] = [];
  const definitions: ConsentDefinitionRepository = {
    async definitions(command) {
      seen.push(command);
      return { ok: true, body: { deleted: true } };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    createExpressConsentRouter({
      controller: new ConsentController(
        new ConsentService(consents),
        new ConsentDefinitionService(definitions),
        options.freshOtp,
      ),
      resolveSession: () =>
        options.auth === undefined ? session : options.auth,
      rateLimiter: new IpRateLimiter({ windowMs: 60000, maxPerWindow: 100 }),
    }),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      seen,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
const send = (
  base: string,
  route: { method: string; path: string },
  extra: Record<string, string> = headers,
  body = "{}",
) =>
  fetch(base + route.path, {
    method: route.method,
    headers: extra,
    ...(route.method === "GET" ? {} : { body }),
  });

for (const role of [null, "coach"] as const)
  test(`CONS-02 consent text routes reject ${role ?? "unauthenticated"} callers`, async () => {
    await withServer(
      async (base, seen) => {
        for (const route of routes)
          assert.equal(
            (await send(base, route)).status,
            role ? 403 : 401,
            `${route.method} ${route.path}`,
          );
        assert.equal(seen.length, 0);
      },
      { auth: role ? { ...session, role } : null, freshOtp: fresh },
    );
  });

test("CONS-02 consent text mutations require CSRF and same origin", async () => {
  await withServer(
    async (base, seen) => {
      for (const route of routes.filter((r) => r.method !== "GET")) {
        assert.equal(
          (await send(base, route, { "content-type": "application/json" }))
            .status,
          403,
        );
        assert.equal(
          (
            await send(base, route, {
              ...headers,
              origin: "https://foreign.invalid",
            })
          ).status,
          403,
        );
      }
      assert.equal(seen.length, 0);
    },
    { freshOtp: fresh },
  );
});

test("CONS-02 publish needs a fresh sensitive-action OTP, and fails closed without an OTP lookup (D7)", async () => {
  const publish = routes.at(-1)!;
  for (const freshOtp of [
    undefined,
    {
      async lastConsumedAt() {
        return null;
      },
      windowMs: 300000,
    },
    {
      async lastConsumedAt() {
        return new Date(Date.now() - 600000);
      },
      windowMs: 300000,
    },
  ]) {
    await withServer(
      async (base, seen) => {
        const response = await send(base, publish);
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), {
          error: "AUTH_FRESH_OTP_REQUIRED",
        });
        assert.equal(seen.length, 0);
      },
      freshOtp ? { freshOtp } : {},
    );
  }
  await withServer(
    async (base, seen) => {
      assert.equal((await send(base, publish)).status, 200);
      assert.deepEqual(seen, [
        { action: "definition_publish", definitionId: id },
      ]);
    },
    { freshOtp: fresh },
  );
});

test("CONS-02 admin routes reach the definition service with server-chosen versions only", async () => {
  await withServer(
    async (base, seen) => {
      assert.equal(
        (
          await send(
            base,
            routes[1]!,
            headers,
            JSON.stringify({
              consentType: "health_data",
              title: "T",
              content: "C",
            }),
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await send(
            base,
            routes[1]!,
            headers,
            JSON.stringify({
              consentType: "health_data",
              title: "T",
              content: "C",
              version: "7",
            }),
          )
        ).status,
        400,
      );
      assert.equal(
        (await send(base, routes[3]!, headers, JSON.stringify({ title: "T2" })))
          .status,
        200,
      );
      assert.equal((await send(base, routes[4]!)).status, 200);
      assert.deepEqual(
        seen.map((c) => c.action),
        ["definition_create", "definition_update", "definition_delete"],
      );
    },
    { freshOtp: fresh },
  );
});

test("CONS-02 public submission of a type outside the link answers 400 CONSENT_TYPE_NOT_REQUESTED", async () => {
  await withServer(
    async (base) => {
      const response = await fetch(
        base + consentApiRoutes.public.replace(":token", "synthetic"),
        {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({ decisions: { marketing: "granted" } }),
        },
      );
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "CONSENT_TYPE_NOT_REQUESTED",
      });
    },
    { auth: null },
  );
});

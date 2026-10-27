import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { authApiRoutes, devToolsApiRoutes } from "@kfit/shared";
import { db, pool } from "../db/client.js";
import {
  auditEvents,
  authSessions,
  trustedDevices,
  users,
} from "../db/schema/auth.js";
import { CANONICAL_UUID_PATTERN } from "../http/request-id.middleware.js";
import { PasswordService } from "../modules/auth/services/password.service.js";
import {
  digestDeviceToken,
  generateDeviceToken,
} from "../modules/auth/services/crypto/device-token.crypto.js";
import { assertLocalTestDatabase } from "../testing/integration-fixtures.js";
import {
  createRuntime,
  PRODUCTION_TRUST_PROXY,
  type RuntimeMode,
} from "../runtime.js";
import { DevToolsController } from "../modules/dev-tools/controllers/dev-tools.controller.js";
import { DrizzleTestDataRepository } from "../modules/dev-tools/repositories/test-data.repository.js";
import { TestDataService } from "../modules/dev-tools/services/test-data.service.js";

const userId = randomUUID(),
  email = `runtime-${userId}@example.invalid`,
  password = "Synthetic-runtime-password-2026!";
// The integration step has no .env in CI: a synthetic environment drives the runtime; NODE_ENV stays non-production
// so this exercises the production composition without the entry script's refuse-to-start path.
const env: NodeJS.ProcessEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: "test",
  AUTH_OTP_PEPPER: "synthetic-runtime-pepper-0123456789abcdef",
  AUTH_DEVICE_PEPPER: "synthetic-runtime-device-pepper-0123456789",
};
// SEC-02: these tests cover the session cookies, so the browser is a trusted device (without SMTP an unknown one gets 503).
const deviceToken = generateDeviceToken();
let safe = false;

before(async () => {
  assertLocalTestDatabase();
  safe = true;
  await db.insert(users).values({
    id: userId,
    email,
    passwordHash: await new PasswordService().hash(password),
    role: "admin",
    status: "active",
  });
  await db.insert(trustedDevices).values({
    userId,
    deviceFingerprintHash: digestDeviceToken(
      deviceToken,
      env.AUTH_DEVICE_PEPPER!,
    ),
    label: "Autre · Autre",
    trustedUntil: new Date(Date.now() + 24 * 60 * 60_000),
  });
});
after(async () => {
  try {
    if (safe) {
      await db.delete(authSessions).where(eq(authSessions.userId, userId));
      await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
      await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  } finally {
    await pool.end();
  }
});

// The same factory as dev-app.ts: production must ignore it.
const appFor = (mode: RuntimeMode) =>
  createRuntime({
    mode,
    env,
    devToolsController: ({ auditHashPepper, removePrivateFile, warn }) =>
      new DevToolsController(
        new TestDataService(
          new DrizzleTestDataRepository(db, { auditHashPepper }),
          removePrivateFile,
          warn,
        ),
      ),
  }).app;

async function serve(app: Express, run: (url: string) => Promise<void>) {
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

const login = (url: string, requestId: string) =>
  fetch(url + authApiRoutes.login, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      cookie: `kfit_device=${deviceToken}`,
    },
    body: JSON.stringify({ email, password }),
  });

test("S7.4 D1: the production runtime sets Secure on every login cookie, trusts the loopback proxy only and never mounts dev tools", async () => {
  const app = appFor("production");
  assert.equal(app.get("trust proxy"), PRODUCTION_TRUST_PROXY);
  await serve(app, async (url) => {
    const response = await login(url, randomUUID());
    assert.equal(response.status, 200, await response.clone().text());
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.length >= 3);
    for (const cookie of cookies)
      assert.match(cookie, /;\s*Secure/i, cookie.split("=")[0]);
    assert.equal((await fetch(url + devToolsApiRoutes.testData)).status, 404);
  });
});

test("S7.4 D1: the development runtime is unchanged - cookies without Secure, no trusted proxy, dev tools mounted", async () => {
  const app = appFor("development");
  assert.equal(Boolean(app.get("trust proxy")), false);
  await serve(app, async (url) => {
    const response = await login(url, randomUUID());
    assert.equal(response.status, 200);
    for (const cookie of response.headers.getSetCookie())
      assert.doesNotMatch(cookie, /;\s*Secure/i);
    assert.notEqual(
      (await fetch(url + devToolsApiRoutes.testData)).status,
      404,
    );
  });
});

test("S7.4 D4: an audited write with a non-UUID X-Request-Id succeeds and audits the generated UUID", async () => {
  await serve(appFor("production"), async (url) => {
    const response = await login(url, "not-a-uuid");
    assert.equal(
      response.status,
      200,
      "was 500: audit_events.request_id is a uuid column",
    );
    const echoed = response.headers.get("x-request-id") ?? "";
    assert.match(echoed, CANONICAL_UUID_PATTERN);
    const [row] = await db
      .select({ requestId: auditEvents.requestId })
      .from(auditEvents)
      .where(eq(auditEvents.requestId, echoed));
    assert.equal(row?.requestId, echoed);
  });
});

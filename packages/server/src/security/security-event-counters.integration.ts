import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { businessDateKey, requestsApiRoutes } from "@kfit/shared";
import { createServerApp } from "../app.js";
import { db, pool } from "../db/client.js";
import { securityEventCounters } from "../db/schema/operations.js";
import { AuthController } from "../modules/auth/controllers/auth.controller.js";
import { RequestsController } from "../modules/requests/controllers/requests.controller.js";
import { assertLocalTestDatabase } from "../testing/integration-fixtures.js";
import { REQUEST_ENCODING_UNSUPPORTED } from "./reject-encoded-request-bodies.js";
import {
  createSecurityEventCounter,
  drizzleSecurityCounterStore,
  type SecurityEventCode,
} from "./security-event-counters.js";

const unused = async (): Promise<never> => {
  throw new Error("unused in this test");
};
const warnings: string[] = [];

before(() => assertLocalTestDatabase());
after(async () => {
  await pool.end();
});

const todayCount = async (code: SecurityEventCode) => {
  const [row] = await db
    .select({ count: securityEventCounters.count })
    .from(securityEventCounters)
    .where(
      and(
        eq(securityEventCounters.day, businessDateKey(new Date())),
        eq(securityEventCounters.code, code),
      ),
    );
  return row?.count ?? 0;
};
/** Increments are fire-and-forget: poll until the expected count lands (or fail after 5 s). */
async function waitForCount(code: SecurityEventCode, expected: number) {
  for (let i = 0; i < 100 && (await todayCount(code)) < expected; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await todayCount(code), expected, code);
}

async function withApp(run: (url: string) => Promise<void>) {
  const app = createServerApp({
    authController: new AuthController({
      otpChallengeService: { issue: unused, verify: unused },
    }),
    resolveAuthSession: () => null,
    requestsController: new RequestsController({
      submit: async () => {
        throw new Error("synthetic stop after the limiter");
      },
    }),
    recordSecurityEvent: createSecurityEventCounter(
      drizzleSecurityCounterStore(db),
      { warn: (line) => warnings.push(line) },
    ),
  });
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

test("S7.4b B9: a 415 increments today's REQUEST_ENCODING_UNSUPPORTED row (Libreville day); a 429 increments RATE_LIMITED:requests", async () => {
  const encodingBefore = await todayCount(REQUEST_ENCODING_UNSUPPORTED),
    limitedBefore = await todayCount("RATE_LIMITED:requests");
  await withApp(async (url) => {
    const send = (headers: Record<string, string> = {}) =>
      fetch(url + requestsApiRoutes.publicSubmit, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json", ...headers },
      });
    assert.equal((await send({ "content-encoding": "gzip" })).status, 415);
    assert.equal((await send({ "content-encoding": "br" })).status, 415);
    await waitForCount(REQUEST_ENCODING_UNSUPPORTED, encodingBefore + 2);
    for (let i = 0; i < 5; i += 1) assert.notEqual((await send()).status, 429);
    assert.equal((await send()).status, 429);
    await waitForCount("RATE_LIMITED:requests", limitedBefore + 1);
  });
  assert.deepEqual(warnings, []);
  const columns = Object.keys(
    (await db.select().from(securityEventCounters).limit(1))[0] ?? {
      day: 0,
      code: 0,
      count: 0,
    },
  ).sort();
  assert.deepEqual(
    columns,
    ["code", "count", "day"],
    "no IP, path or request id is stored",
  );
});

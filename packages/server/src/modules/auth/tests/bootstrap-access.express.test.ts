import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { authApiRoutes, bootstrapTokenHeaderName } from "@kfit/shared";
import { createServerApp } from "../../../app.js";
import { bootstrapTokenWarnings, readBootstrapToken } from "../../../runtime/production-guards.js";
import type { SecurityEventCode } from "../../../security/security-event-counters.js";
import { AuthController } from "../controllers/auth.controller.js";
import type { RecordAuditEventInput } from "../services/audit.service.js";
import { BOOTSTRAP_ATTEMPTS_PER_IP, bootstrapTokenPolicy, createBootstrapRateLimiter } from "../services/bootstrap-access.js";
import { BOOTSTRAP_ROLE, BootstrapService, type BootstrapRepository } from "../services/bootstrap.service.js";
import { PasswordService } from "../services/password.service.js";

const token = "synthetic-bootstrap-token-0123456789abcdef";
const body = { email: "Admin@Example.Invalid", password: "Synthetic-boot-2026!" };
const unused = async (): Promise<never> => { throw new Error("unused in this test"); };
const passwords = new PasswordService({ saltBytes: 8, keyLength: 32, cost: 1024, blockSize: 8, parallelization: 1, minLength: 12 });

async function withBootstrapApp(mode: "development" | "production", env: NodeJS.ProcessEnv, run: (send: (headers?: Record<string, string>) => Promise<{ status: number; body: unknown }>, state: { audit: RecordAuditEventInput[]; counted: SecurityEventCode[]; users: number }) => Promise<void>) {
  const state = { audit: [] as RecordAuditEventInput[], counted: [] as SecurityEventCode[], users: 0 };
  const repository: BootstrapRepository = {
    countUsers: async () => state.users,
    async createFirstUser(input) {
      state.users += 1;
      return { id: "11111111-1111-1111-1111-111111111111", email: input.email, passwordHash: input.passwordHash, role: input.role, status: "active" };
    },
  };
  const recordSecurityEvent = (code: SecurityEventCode) => { state.counted.push(code); };
  const bootstrapService = new BootstrapService(repository, passwords, { record: async (event) => { state.audit.push(event); } }, {
    defaultRole: BOOTSTRAP_ROLE,
    tokenPolicy: bootstrapTokenPolicy(mode, env),
    allowAttempt: createBootstrapRateLimiter(() => recordSecurityEvent("RATE_LIMITED:auth_bootstrap")),
  });
  const app = createServerApp({
    authController: new AuthController({ otpChallengeService: { issue: unused, verify: unused }, bootstrapService }),
    resolveAuthSession: () => null,
    recordSecurityEvent,
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = async (headers: Record<string, string> = {}) => {
    const response = await fetch(url + authApiRoutes.bootstrap, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    await run(send, state);
    if (mode === "production") {
      const status = await (await fetch(url + authApiRoutes.bootstrapStatus)).json();
      assert.equal((status as { tokenRequired: boolean }).tokenRequired, true);
    }
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("BOOT-01 B1: production without KFIT_BOOTSTRAP_TOKEN is closed (403 BOOTSTRAP_DISABLED, status enabled:false)", async () => {
  await withBootstrapApp("production", {}, async (send, state) => {
    assert.deepEqual(await send({ [bootstrapTokenHeaderName]: token }), { status: 403, body: { error: "BOOTSTRAP_DISABLED" } });
    assert.equal(state.users, 0);
  });
  const service = new BootstrapService({ countUsers: async () => 0, createFirstUser: unused }, passwords, { record: async () => undefined }, { defaultRole: "admin", tokenPolicy: bootstrapTokenPolicy("production", {}) });
  assert.deepEqual(await service.status(), { required: true, tokenRequired: true, enabled: false });
});

test("BOOT-01 B1/B2: a wrong token is refused and audited without its value; the right one creates the account once", async () => {
  await withBootstrapApp("production", { KFIT_BOOTSTRAP_TOKEN: token }, async (send, state) => {
    assert.deepEqual(await send(), { status: 403, body: { error: "BOOTSTRAP_TOKEN_INVALID" } });
    assert.deepEqual(await send({ [bootstrapTokenHeaderName]: `${token}x` }), { status: 403, body: { error: "BOOTSTRAP_TOKEN_INVALID" } });
    const rejected = state.audit.filter((event) => event.eventType === "auth.bootstrap.rejected");
    assert.deepEqual(rejected.map((event) => event.metadata), [{ reason: "token_invalid" }, { reason: "token_invalid" }]);
    assert.equal(JSON.stringify(state.audit).includes(token), false, "the token never reaches the audit");

    const created = await send({ [bootstrapTokenHeaderName]: token });
    assert.equal(created.status, 201);
    assert.equal((created.body as { user: { email: string; role: string } }).user.email, "admin@example.invalid");
    assert.equal((created.body as { user: { role: string } }).user.role, "superadmin", "ROLE-01 R4: production bootstrap creates the superadmin");
    assert.deepEqual(await send({ [bootstrapTokenHeaderName]: token }), { status: 409, body: { error: "BOOTSTRAP_ALREADY_COMPLETED" } });
  });
});

test("BOOT-01 B2: a foreign Origin is refused in development and production", async () => {
  for (const [mode, env] of [["development", {}], ["production", { KFIT_BOOTSTRAP_TOKEN: token }]] as const) {
    await withBootstrapApp(mode, env, async (send, state) => {
      assert.deepEqual(await send({ origin: "http://evil.example", [bootstrapTokenHeaderName]: token }), { status: 403, body: { error: "AUTH_ORIGIN_INVALID" } }, mode);
      assert.equal(state.users, 0);
    });
  }
});

test("BOOT-01 B2: more than 5 attempts per address in 15 minutes answer 429 and are counted", async () => {
  await withBootstrapApp("production", { KFIT_BOOTSTRAP_TOKEN: token }, async (send, state) => {
    for (let attempt = 1; attempt <= BOOTSTRAP_ATTEMPTS_PER_IP; attempt += 1) assert.equal((await send({ [bootstrapTokenHeaderName]: "wrong" })).status, 403);
    assert.deepEqual(await send({ [bootstrapTokenHeaderName]: token }), { status: 429, body: { error: "AUTH_RATE_LIMITED" } });
    assert.deepEqual(state.counted, ["RATE_LIMITED:auth_bootstrap"]);
    assert.equal(state.users, 0);
  });
});

test("BOOT-01 B1: development is unchanged (no token needed)", async () => {
  await withBootstrapApp("development", {}, async (send, state) => {
    const created = await send();
    assert.equal(created.status, 201);
    assert.equal((created.body as { user: { role: string } }).user.role, "superadmin", "ROLE-01 R4: development bootstrap creates the superadmin");
    assert.equal(state.users, 1);
  });
});

test("BOOT-01 B1/B3: short or example tokens are ignored; start-up warnings follow the users table", () => {
  assert.equal(readBootstrapToken({ KFIT_BOOTSTRAP_TOKEN: token }), token);
  assert.equal(readBootstrapToken({ KFIT_BOOTSTRAP_TOKEN: "too-short" }), null);
  assert.equal(readBootstrapToken({ KFIT_BOOTSTRAP_TOKEN: "change-me-bootstrap-token-at-least-32-characters" }), null);

  assert.deepEqual(bootstrapTokenWarnings({}, false), []);
  assert.deepEqual(bootstrapTokenWarnings({}, true), []);
  assert.match(bootstrapTokenWarnings({ KFIT_BOOTSTRAP_TOKEN: token }, false).join(), /no account exists/);
  assert.match(bootstrapTokenWarnings({ KFIT_BOOTSTRAP_TOKEN: token }, true).join(), /« retire KFIT_BOOTSTRAP_TOKEN »/);
  assert.match(bootstrapTokenWarnings({ KFIT_BOOTSTRAP_TOKEN: "too-short" }, false).join(), /bootstrap disabled/);
  for (const line of [...bootstrapTokenWarnings({ KFIT_BOOTSTRAP_TOKEN: token }, false), ...bootstrapTokenWarnings({ KFIT_BOOTSTRAP_TOKEN: token }, true)]) {
    assert.equal(line.includes(token), false, "the value is never logged");
  }
});

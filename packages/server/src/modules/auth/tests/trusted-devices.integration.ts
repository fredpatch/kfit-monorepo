import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { and, eq, inArray, or } from "drizzle-orm";
import { authApiRoutes, businessDateKey } from "@kfit/shared";
import { createServerApp } from "../../../app.js";
import { db, pool } from "../../../db/client.js";
import { auditEvents, authSessions, otpChallenges, trustedDevices, users } from "../../../db/schema/auth.js";
import { securityEventCounters } from "../../../db/schema/operations.js";
import { createSecurityEventCounter, drizzleSecurityCounterStore, rateLimitedCode, type SecurityEventCode } from "../../../security/security-event-counters.js";
import { assertLocalTestDatabase, cleanupInOrder } from "../../../testing/integration-fixtures.js";
import { AuthController } from "../controllers/auth.controller.js";
import {
  DrizzleAuthUserRepository,
  DrizzleOtpChallengeRepository,
  DrizzlePasswordRecoveryRepository,
  DrizzleSessionRepository,
  DrizzleTrustedDeviceRepository,
} from "../repositories/auth.repositories.js";
import { AccessTokenSessionResolver } from "../services/access-token-session.resolver.js";
import { AuditService } from "../services/audit.service.js";
import type { AuthMailDelivery } from "../services/auth-mail.delivery.js";
import { AuthRouteService } from "../services/auth-route.service.js";
import { DeviceLoginService } from "../services/device-login.service.js";
import { createLoginRateLimits, LOGIN_ATTEMPTS_PER_IP, LOGIN_OTP_ISSUES_PER_ACCOUNT, LOGIN_OTP_MAX_RESENDS, LOGIN_VERIFY_ATTEMPTS_PER_IP } from "../services/login-rate-limits.js";
import { OtpChallengeService } from "../services/otp-challenge.service.js";
import { InMemoryRecoveryRateLimiter, PasswordRecoveryService } from "../services/password-recovery.service.js";
import { PasswordService } from "../services/password.service.js";
import { SessionService } from "../services/session.service.js";

/*
 * SEC-02a on kfit_test through the real auth router and services. The OTP is read from the mail double only (E9).
 * Each test builds its own app, so the in-memory rate limits start empty.
 */

const pepper = "synthetic-sec02-pepper-0123456789abcdef";
const devicePepper = "synthetic-sec02-device-pepper-0123456789";
const password = "Synthetic-sec02-password-2026!";
const otpTtlMs = 5 * 60_000;
const trustedDeviceTtlMs = 30 * 24 * 60 * 60_000;
const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

const passwords = new PasswordService();
const userA = { id: randomUUID(), email: `sec02-a-${randomUUID()}@example.invalid` };
const userB = { id: randomUUID(), email: `sec02-b-${randomUUID()}@example.invalid` };
const userIds = [userA.id, userB.id];
const requestIds: string[] = [];
/** Request ids of the running test (reset by resetUser), so audit assertions never count rows of an earlier test. */
let testRequestIds: string[] = [];
let safe = false;

before(async () => {
  assertLocalTestDatabase(); safe = true;
  const passwordHash = await passwords.hash(password);
  await db.insert(users).values([userA, userB].map((user) => ({ ...user, passwordHash, role: "admin", status: "active" })));
});

after(async () => {
  try {
    if (safe) {
      await cleanupInOrder([
        ["audit_events", () => db.delete(auditEvents).where(or(inArray(auditEvents.actorUserId, userIds), inArray(auditEvents.requestId, requestIds)))],
        ["auth_sessions", () => db.delete(authSessions).where(inArray(authSessions.userId, userIds))],
        ["otp_challenges", () => db.delete(otpChallenges).where(inArray(otpChallenges.userId, userIds))],
        ["trusted_devices", () => db.delete(trustedDevices).where(inArray(trustedDevices.userId, userIds))],
        ["users", () => db.delete(users).where(inArray(users.id, userIds))],
      ]);
    }
  } finally {
    await pool.end();
  }
});

type SentMail = { kind: "login" | "recovery" | "sensitive"; to: string; code: string };
type Json = Record<string, unknown>;

function buildApp(options: { mail?: boolean } = {}) {
  const sent: SentMail[] = [];
  const mail: AuthMailDelivery = {
    async sendLoginCode({ to, code }) { sent.push({ kind: "login", to, code }); },
    async sendPasswordRecoveryCode({ to, code }) { sent.push({ kind: "recovery", to, code }); },
    async sendSensitiveActionCode({ to, code }) { sent.push({ kind: "sensitive", to, code }); },
  };
  const audit = new AuditService(db, { auditHashPepper: pepper });
  const sessionRepository = new DrizzleSessionRepository(db);
  const sessions = new SessionService(sessionRepository, audit, {
    refreshTokenPepper: pepper, auditHashPepper: pepper, refreshTokenTtlMs: 7 * 24 * 60 * 60_000, absoluteSessionTtlMs: 12 * 60 * 60_000, inactivityTimeoutMs: 30 * 60_000,
  });
  const userRepository = new DrizzleAuthUserRepository(db);
  const otpRepository = new DrizzleOtpChallengeRepository(db);
  const otp = new OtpChallengeService(otpRepository, audit, { otpPepper: pepper, otpTtlMs, otpMaxAttempts: 5 });
  const recordSecurityEvent = createSecurityEventCounter(drizzleSecurityCounterStore(db), { warn: () => {} });
  const devices = new DeviceLoginService(
    new DrizzleTrustedDeviceRepository(db), otpRepository, otp, userRepository, options.mail === false ? null : mail, audit,
    createLoginRateLimits((scope) => recordSecurityEvent(rateLimitedCode(scope))),
    { devicePepper, trustedDeviceTtlMs, otpTtlMs },
  );
  const authRouteService = new AuthRouteService(userRepository, sessions, ({ password: candidate, passwordHash }) => passwords.verify(candidate, passwordHash), audit, {
    accessTokenSecret: pepper, accessTokenTtlMs: 15 * 60_000, refreshTokenTtlMs: 7 * 24 * 60 * 60_000, cookieMode: "development",
  }, devices);
  const passwordRecoveryService = new PasswordRecoveryService(
    new DrizzlePasswordRecoveryRepository(db), otp, passwords, mail, audit,
    new InMemoryRecoveryRateLimiter({ windowMs: 15 * 60_000, requestMax: 5, verifyMax: 10, resetMax: 5 }),
    { recoveryTokenSecret: pepper, recoveryGrantTtlMs: 10 * 60_000 },
  );
  const resolver = new AccessTokenSessionResolver(sessionRepository, { accessTokenSecret: pepper, inactivityTimeoutMs: 30 * 60_000 });
  const app = createServerApp({
    authController: new AuthController({ otpChallengeService: otp, authRouteService, trustedDeviceService: devices, passwordRecoveryService }),
    resolveAuthSession: (request) => resolver.resolveFromRequest(request),
    recordSecurityEvent,
  });
  const lastCode = (to: string, kind: SentMail["kind"] = "login") => {
    const found = sent.filter((entry) => entry.to === to && entry.kind === kind).at(-1);
    assert.ok(found, `no ${kind} mail to the account`);
    return found.code;
  };
  return { app, sent, lastCode };
}

async function serve(app: ReturnType<typeof buildApp>["app"], run: (url: string) => Promise<void>) {
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

/** One browser profile: its own cookie jar, so its own kfit_device cookie. */
class Browser {
  readonly jar = new Map<string, string>();
  lastSetCookies: string[] = [];
  constructor(private readonly url: string, readonly userAgent = CHROME_WINDOWS) {}

  async send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
    const requestId = randomUUID();
    requestIds.push(requestId);
    testRequestIds.push(requestId);
    const cookie = [...this.jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    const response = await fetch(this.url + path, {
      method,
      headers: { "content-type": "application/json", "user-agent": this.userAgent, "x-request-id": requestId, ...(cookie ? { cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    this.lastSetCookies = response.headers.getSetCookie();
    for (const raw of this.lastSetCookies) {
      const [pair = ""] = raw.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator), value = decodeURIComponent(pair.slice(separator + 1));
      if (value === "" || /max-age=0(;|$)/i.test(raw)) this.jar.delete(name); else this.jar.set(name, value);
    }
    return { status: response.status, body: await response.json() as Json };
  }

  login(email: string, secret = password) { return this.send("POST", authApiRoutes.login, { email, password: secret }); }
  verify(challengeId: unknown, code: string, trustDevice: boolean, headers: Record<string, string> = {}) {
    return this.send("POST", authApiRoutes.verifyLogin, { challengeId, code, trustDevice }, headers);
  }
  resend(challengeId: unknown, headers: Record<string, string> = {}) { return this.send("POST", authApiRoutes.resendLoginOtp, { challengeId }, headers); }
  csrf(): Record<string, string> { return { "x-csrf-token": this.jar.get("kfit_csrf") ?? "" }; }
  forgetSession() { for (const name of ["kfit_access", "kfit_refresh", "kfit_csrf"]) this.jar.delete(name); }
}

/** Unknown device → 202 → code from the mail double → verify; the browser keeps its session cookies. */
async function signIn(browser: Browser, user: { email: string }, lastCode: (to: string) => string, trustDevice: boolean) {
  const login = await browser.login(user.email);
  assert.equal(login.status, 202, JSON.stringify(login.body));
  const verified = await browser.verify(login.body.challengeId, lastCode(user.email), trustDevice);
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
}

const auditOf = (userId: string, eventType: string) =>
  db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, userId), eq(auditEvents.eventType, eventType), inArray(auditEvents.requestId, testRequestIds)));
const devicesOf = (userId: string) => db.select().from(trustedDevices).where(eq(trustedDevices.userId, userId));
const todayCount = async (code: SecurityEventCode) => {
  const [row] = await db.select({ count: securityEventCounters.count }).from(securityEventCounters)
    .where(and(eq(securityEventCounters.day, businessDateKey(new Date())), eq(securityEventCounters.code, code)));
  return row?.count ?? 0;
};
async function waitForCount(code: SecurityEventCode, expected: number) {
  for (let i = 0; i < 100 && (await todayCount(code)) < expected; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await todayCount(code), expected, code);
}
async function resetUser(userId: string) {
  testRequestIds = [];
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
  await db.delete(otpChallenges).where(eq(otpChallenges.userId, userId));
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
}

test("SEC-02 E1–E3: an unknown device gets 202, the kfit_device cookie, no auth cookie and an e-mailed code; without trust the next login asks again", async () => {
  await resetUser(userA.id);
  const { app, sent, lastCode } = buildApp();
  await serve(app, async (url) => {
    const browser = new Browser(url);
    const login = await browser.login(userA.email);
    assert.equal(login.status, 202);
    assert.equal(login.body.status, "otp_required");
    assert.equal(typeof login.body.challengeId, "string");
    assert.ok(Date.parse(String(login.body.expiresAt)) > Date.now());
    assert.deepEqual([...browser.jar.keys()], ["kfit_device"], "no access, refresh or CSRF cookie before the code");
    const deviceCookie = browser.lastSetCookies.find((cookie) => cookie.startsWith("kfit_device="));
    assert.match(deviceCookie ?? "", /HttpOnly/i);
    assert.match(deviceCookie ?? "", /SameSite=Lax/i);
    assert.match(deviceCookie ?? "", /Max-Age=34560000/i);
    assert.doesNotMatch(deviceCookie ?? "", /Secure/i, "development mode");
    assert.deepEqual(sent.map((entry) => [entry.kind, entry.to]), [["login", userA.email]]);
    assert.match(lastCode(userA.email), /^\d{6}$/);
    assert.equal((await auditOf(userA.id, "auth.login.otp_required")).length, 1);

    const verified = await browser.verify(login.body.challengeId, lastCode(userA.email), false);
    assert.equal(verified.status, 200);
    assert.deepEqual(Object.keys(verified.body).sort(), ["session", "user"], "the 200 shape is unchanged");
    assert.ok(browser.jar.has("kfit_access") && browser.jar.has("kfit_refresh") && browser.jar.has("kfit_csrf"));
    assert.equal((await devicesOf(userA.id)).length, 0, "trusting is an explicit choice");
    assert.equal((await auditOf(userA.id, "auth.login.otp_succeeded")).length, 1);

    browser.forgetSession();
    const again = await browser.login(userA.email);
    assert.equal(again.status, 202);
    assert.equal(browser.lastSetCookies.length, 0, "the existing device cookie is kept");
  });
});

test("SEC-02 E4/E5: trustDevice=true stores a labelled 30-day row; the next login gets a session without a code and only moves last_used_at", async () => {
  await resetUser(userA.id);
  const { app, sent, lastCode } = buildApp();
  await serve(app, async (url) => {
    const browser = new Browser(url);
    const before = Date.now();
    await signIn(browser, userA, lastCode, true);
    const [row] = await devicesOf(userA.id);
    assert.ok(row);
    assert.equal(row.label, "Chrome · Windows");
    assert.equal(row.revokedAt, null);
    const days = (row.trustedUntil.getTime() - before) / (24 * 60 * 60_000);
    assert.ok(days > 29.99 && days < 30.01, `trusted for ${days} days`);
    assert.notEqual(row.deviceFingerprintHash, browser.jar.get("kfit_device"), "only the keyed hash is stored");
    assert.equal((await auditOf(userA.id, "auth.device.trusted")).length, 1);

    await db.update(trustedDevices).set({ lastUsedAt: new Date("2026-01-01T00:00:00Z") }).where(eq(trustedDevices.id, row.id));
    browser.forgetSession();
    const mailsBefore = sent.length;
    const login = await browser.login(userA.email);
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(sent.length, mailsBefore, "no code for a trusted device");
    const [used] = await devicesOf(userA.id);
    assert.ok(used && used.lastUsedAt.getTime() >= before);
    assert.equal(used.trustedUntil.getTime(), row.trustedUntil.getTime(), "no extension of trusted_until");
    assert.equal((await auditOf(userA.id, "auth.device.used")).length, 1);
    const [session] = await db.select().from(authSessions).where(eq(authSessions.id, String((login.body.session as Json).id)));
    assert.equal(session?.trustedDeviceId, row.id);
  });
});

test("SEC-02 E5: an expired or revoked trusted row, or a device trusted by another user, asks for a code", async () => {
  await resetUser(userA.id); await resetUser(userB.id);
  const { app, lastCode } = buildApp();
  await serve(app, async (url) => {
    const browser = new Browser(url);
    await signIn(browser, userA, lastCode, true);
    const [row] = await devicesOf(userA.id);
    assert.ok(row);

    browser.forgetSession();
    assert.equal((await browser.login(userB.email)).status, 202, "trusted by A gives nothing to B");

    await db.update(trustedDevices).set({ trustedUntil: new Date(Date.now() - 1000) }).where(eq(trustedDevices.id, row.id));
    assert.equal((await browser.login(userA.email)).status, 202, "expired");

    await db.update(trustedDevices).set({ trustedUntil: new Date(Date.now() + trustedDeviceTtlMs), revokedAt: new Date() }).where(eq(trustedDevices.id, row.id));
    assert.equal((await browser.login(userA.email)).status, 202, "revoked");

    await db.update(trustedDevices).set({ revokedAt: null }).where(eq(trustedDevices.id, row.id));
    assert.equal((await browser.login(userA.email)).status, 200, "the same row active again");
  });
});

test("SEC-02 E3/E4: five wrong codes lock the challenge (audited), an expired code is refused, another device cookie cannot use the challenge", async () => {
  await resetUser(userA.id);
  const { app, lastCode } = buildApp();
  await serve(app, async (url) => {
    const browser = new Browser(url);
    const login = await browser.login(userA.email);
    const code = lastCode(userA.email);
    const wrong = code === "000000" ? "111111" : "000000";

    const thief = new Browser(url, FIREFOX_LINUX);
    await thief.login(userB.email);
    const stolen = await thief.verify(login.body.challengeId, code, true);
    assert.deepEqual([stolen.status, stolen.body], [404, { error: "AUTH_OTP_REJECTED", reason: "not_found" }]);
    const noCookie = new Browser(url);
    assert.equal((await noCookie.verify(login.body.challengeId, code, false)).status, 404);
    const [untouched] = await db.select().from(otpChallenges).where(and(eq(otpChallenges.userId, userA.id), eq(otpChallenges.purpose, "suspicious_device_login")));
    assert.equal(untouched?.attemptCount, 0, "a foreign device never spends an attempt");

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      assert.deepEqual((await browser.verify(login.body.challengeId, wrong, false)).body, { error: "AUTH_OTP_REJECTED", reason: "invalid" });
    }
    const fifth = await browser.verify(login.body.challengeId, wrong, false);
    assert.deepEqual([fifth.status, fifth.body], [423, { error: "AUTH_OTP_REJECTED", reason: "locked" }]);
    assert.equal((await browser.verify(login.body.challengeId, code, false)).status, 423, "the right code no longer works");
    assert.ok((await auditOf(userA.id, "auth.login.otp_locked")).length >= 1);
    assert.equal((await auditOf(userA.id, "auth.login.otp_failed")).length, 4);

    const second = await browser.login(userA.email);
    await db.update(otpChallenges).set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(otpChallenges.userId, userA.id), eq(otpChallenges.purpose, "suspicious_device_login")));
    const expired = await browser.verify(second.body.challengeId, lastCode(userA.email), false);
    assert.deepEqual([expired.status, expired.body], [410, { error: "AUTH_OTP_REJECTED", reason: "expired" }]);
    assert.equal(browser.jar.has("kfit_access"), false);
  });
});

test("SEC-02 E3: a resend invalidates the previous code; the fourth resend is refused", async () => {
  await resetUser(userA.id);
  const { app, sent, lastCode } = buildApp();
  await serve(app, async (url) => {
    const browser = new Browser(url);
    const login = await browser.login(userA.email);
    const firstCode = lastCode(userA.email);

    let challengeId = login.body.challengeId;
    for (let resend = 1; resend <= LOGIN_OTP_MAX_RESENDS; resend += 1) {
      const resent = await browser.resend(challengeId);
      assert.equal(resent.status, 202, JSON.stringify(resent.body));
      assert.notEqual(resent.body.challengeId, challengeId);
      challengeId = resent.body.challengeId;
    }
    assert.equal(sent.filter((entry) => entry.kind === "login").length, 1 + LOGIN_OTP_MAX_RESENDS);
    assert.equal((await auditOf(userA.id, "auth.login.otp_resent")).length, LOGIN_OTP_MAX_RESENDS);
    const fourth = await browser.resend(challengeId);
    assert.deepEqual([fourth.status, fourth.body], [429, { error: "AUTH_RATE_LIMITED" }]);

    const old = await browser.verify(login.body.challengeId, firstCode, false);
    assert.deepEqual(old.body, { error: "AUTH_OTP_REJECTED", reason: "superseded" });
    if (firstCode !== lastCode(userA.email)) {
      assert.deepEqual((await browser.verify(challengeId, firstCode, false)).body, { error: "AUTH_OTP_REJECTED", reason: "invalid" });
    }
    assert.equal((await browser.verify(challengeId, lastCode(userA.email), false)).status, 200);
  });
});

test("SEC-02 E3: rate limits answer 429 AUTH_RATE_LIMITED and increment the security counters", async () => {
  await resetUser(userA.id); await resetUser(userB.id);

  const login = await todayCount("RATE_LIMITED:auth_login");
  await serve(buildApp().app, async (url) => {
    const browser = new Browser(url);
    for (let attempt = 1; attempt <= LOGIN_OTP_ISSUES_PER_ACCOUNT; attempt += 1) assert.equal((await browser.login(userA.email)).status, 202);
    assert.deepEqual((await browser.login(userA.email)).body, { error: "AUTH_RATE_LIMITED" }, "per account");
  });
  await waitForCount("RATE_LIMITED:auth_login", login + 1);
  await serve(buildApp().app, async (url) => {
    const browser = new Browser(url);
    for (let attempt = 1; attempt <= LOGIN_ATTEMPTS_PER_IP; attempt += 1) assert.equal((await browser.login(userB.email, "wrong-password-1")).status, 401);
    assert.equal((await browser.login(userB.email)).status, 429, "per address, before the password is checked");
  });
  await waitForCount("RATE_LIMITED:auth_login", login + 2);

  const verify = await todayCount("RATE_LIMITED:auth_verify");
  await serve(buildApp().app, async (url) => {
    const browser = new Browser(url);
    await browser.login(userB.email);
    const bogus = `${randomUUID()}.0.bogus-mac`;
    for (let attempt = 1; attempt <= LOGIN_VERIFY_ATTEMPTS_PER_IP; attempt += 1) assert.equal((await browser.verify(bogus, "123456", false)).status, 404);
    assert.deepEqual((await browser.verify(bogus, "123456", false)).body, { error: "AUTH_RATE_LIMITED" });
  });
  await waitForCount("RATE_LIMITED:auth_verify", verify + 1);

  await resetUser(userA.id);
  const resend = await todayCount("RATE_LIMITED:auth_resend");
  await serve(buildApp().app, async (url) => {
    const browser = new Browser(url);
    let challengeId = (await browser.login(userA.email)).body.challengeId;
    for (let attempt = 1; attempt <= 3; attempt += 1) challengeId = (await browser.resend(challengeId)).body.challengeId;
    const fresh = await browser.login(userA.email);
    assert.deepEqual((await browser.resend(fresh.body.challengeId)).body, { error: "AUTH_RATE_LIMITED" }, "3 resends per account per window");
  });
  await waitForCount("RATE_LIMITED:auth_resend", resend + 1);
});

test("SEC-02 E6: the devices list shows only the user's own active devices and marks the current one; revoking one or all keeps the session", async () => {
  await resetUser(userA.id); await resetUser(userB.id);
  const { app, lastCode } = buildApp();
  await serve(app, async (url) => {
    const laptop = new Browser(url), phone = new Browser(url, FIREFOX_LINUX), other = new Browser(url);
    await signIn(laptop, userA, lastCode, true);
    await signIn(phone, userA, lastCode, true);
    await signIn(other, userB, lastCode, true);

    const listed = await laptop.send("GET", authApiRoutes.trustedDevices);
    assert.equal(listed.status, 200);
    const devices = listed.body.devices as Array<{ id: string; label: string; current: boolean; lastUsedAt: string; trustedUntil: string }>;
    assert.deepEqual(devices.map((device) => [device.label, device.current]).sort(), [["Chrome · Windows", true], ["Firefox · Linux", false]]);
    const [otherRow] = await devicesOf(userB.id);
    assert.ok(otherRow && !devices.some((device) => device.id === otherRow.id));

    const phoneId = devices.find((device) => !device.current)?.id ?? "";
    assert.deepEqual((await laptop.send("DELETE", authApiRoutes.trustedDevice.replace(":id", otherRow.id), undefined, laptop.csrf())).body, { error: "AUTH_DEVICE_NOT_FOUND" }, "never another user's device");
    assert.deepEqual((await laptop.send("DELETE", authApiRoutes.trustedDevice.replace(":id", phoneId), undefined, laptop.csrf())).body, { revoked: true });
    assert.equal((await auditOf(userA.id, "auth.device.revoked")).length, 1);
    phone.forgetSession();
    assert.equal((await phone.login(userA.email)).status, 202, "a revoked device needs a code again");

    const all = await laptop.send("POST", authApiRoutes.revokeAllTrustedDevices, undefined, laptop.csrf());
    assert.deepEqual(all.body, { revokedCount: 1 });
    assert.equal((await laptop.send("GET", authApiRoutes.currentSession)).status, 200, "revoking does not end the current session");
    laptop.forgetSession();
    assert.equal((await laptop.login(userA.email)).status, 202);
    assert.equal((await devicesOf(userB.id)).filter((row) => row.revokedAt === null).length, 1, "B's device untouched");
    const reasons = (await auditOf(userA.id, "auth.device.revoked")).map((row) => (row.metadataJson as Json).reason);
    assert.deepEqual(reasons, ["user", "user"]);
  });
});

test("SEC-02 E6: a password reset revokes every trusted device of the user (audited password_reset)", async () => {
  await resetUser(userA.id);
  const { app, lastCode } = buildApp();
  await serve(app, async (url) => {
    const browser = new Browser(url);
    await signIn(browser, userA, lastCode, true);
    assert.equal((await devicesOf(userA.id)).filter((row) => row.revokedAt === null).length, 1);

    const anonymous = new Browser(url);
    assert.equal((await anonymous.send("POST", authApiRoutes.requestPasswordRecovery, { email: userA.email })).status, 202);
    const verified = await anonymous.send("POST", authApiRoutes.verifyPasswordRecovery, { email: userA.email, code: lastCode(userA.email, "recovery") });
    assert.equal(verified.status, 200);
    assert.equal((await anonymous.send("POST", authApiRoutes.resetPassword, { resetToken: verified.body.resetToken, password })).status, 200);

    assert.equal((await devicesOf(userA.id)).filter((row) => row.revokedAt === null).length, 0);
    const revoked = await auditOf(userA.id, "auth.device.revoked");
    assert.deepEqual(revoked.map((row) => (row.metadataJson as Json).reason), ["password_reset"]);
    browser.forgetSession();
    assert.equal((await browser.login(userA.email)).status, 202);
  });
});

test("SEC-02 E4/E6: origin is checked on verify and resend, CSRF and origin on device mutations; no mail transport answers 503", async () => {
  await resetUser(userA.id);
  const { app, lastCode } = buildApp();
  await serve(app, async (url) => {
    const browser = new Browser(url);
    const login = await browser.login(userA.email);
    const evil = { origin: "http://evil.example" };
    assert.deepEqual((await browser.verify(login.body.challengeId, lastCode(userA.email), true, evil)).body, { error: "AUTH_ORIGIN_INVALID" });
    assert.deepEqual((await browser.resend(login.body.challengeId, evil)).body, { error: "AUTH_ORIGIN_INVALID" });
    assert.equal((await browser.verify(login.body.challengeId, lastCode(userA.email), true, { origin: url })).status, 200);

    const [device] = await devicesOf(userA.id);
    const path = authApiRoutes.trustedDevice.replace(":id", device?.id ?? "");
    assert.deepEqual((await browser.send("DELETE", path)).body, { error: "AUTH_CSRF_INVALID" });
    assert.deepEqual((await browser.send("DELETE", path, undefined, { ...browser.csrf(), ...evil })).body, { error: "AUTH_ORIGIN_INVALID" });
    assert.deepEqual((await browser.send("POST", authApiRoutes.revokeAllTrustedDevices)).body, { error: "AUTH_CSRF_INVALID" });
    assert.deepEqual((await browser.send("POST", authApiRoutes.revokeAllTrustedDevices, undefined, { ...browser.csrf(), ...evil })).body, { error: "AUTH_ORIGIN_INVALID" });
    assert.equal((await new Browser(url).send("GET", authApiRoutes.trustedDevices)).status, 401);
    assert.equal((await devicesOf(userA.id)).filter((row) => row.revokedAt === null).length, 1, "nothing revoked by refused calls");
  });

  await resetUser(userA.id);
  await serve(buildApp({ mail: false }).app, async (url) => {
    const browser = new Browser(url);
    assert.deepEqual((await browser.login(userA.email)).body, { error: "AUTH_OTP_DELIVERY_FAILED" });
    assert.equal(browser.jar.has("kfit_access"), false, "no bypass without a mail transport (E9)");
  });
});

test("SEC-02 E7: no audit row holds the code, the device cookie value or the full User-Agent", async () => {
  await resetUser(userA.id);
  const { app, sent, lastCode } = buildApp();
  const browserCookies: string[] = [];
  await serve(app, async (url) => {
    const browser = new Browser(url);
    const login = await browser.login(userA.email);
    await browser.verify(login.body.challengeId, lastCode(userA.email) === "000000" ? "111111" : "000000", false);
    const resent = await browser.resend(login.body.challengeId);
    await browser.verify(resent.body.challengeId, lastCode(userA.email), true);
    browserCookies.push(browser.jar.get("kfit_device") ?? "missing");
  });
  const rows = await db.select().from(auditEvents).where(inArray(auditEvents.requestId, requestIds));
  assert.ok(rows.length > 5);
  const dump = JSON.stringify(rows);
  for (const code of sent.map((entry) => entry.code)) assert.equal(dump.includes(code), false, "an OTP code reached the audit");
  for (const cookie of browserCookies) assert.equal(dump.includes(cookie), false, "the device cookie reached the audit");
  assert.equal(dump.includes(CHROME_WINDOWS), false, "the full User-Agent reached the audit");
  assert.equal(dump.includes("Chrome/130"), false);
});

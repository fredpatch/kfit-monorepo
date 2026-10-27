import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { and, eq, gte, inArray, like, sql } from "drizzle-orm";
import { businessDateKey, supervisionApiRoutes, type SupervisionOverviewResponse, type SupervisionSecurityResponse } from "@kfit/shared";
import { createServerApp } from "../../../app.js";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { documents, documentVersions, externalAccessEvents } from "../../../db/schema/documents.js";
import { notificationEmailOutbox, notifications } from "../../../db/schema/notifications.js";
import { retentionHolds, scheduledJobRuns, securityEventCounters } from "../../../db/schema/operations.js";
import type { SecurityEventCode } from "../../../security/security-event-counters.js";
import { assertLocalTestDatabase, cleanupInOrder } from "../../../testing/integration-fixtures.js";
import { AuthController } from "../../auth/controllers/auth.controller.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { DrizzleNotificationsRepository } from "../../notifications/repositories/notifications.repository.js";
import { NotificationJobsService } from "../../notifications/services/notification-jobs.service.js";
import { DrizzlePrivacyRepository } from "../../privacy/repositories/privacy.repository.js";
import { SupervisionController } from "../controllers/supervision.controller.js";
import { DrizzleSupervisionRepository } from "../repositories/supervision.repository.js";
import { supervisionCandidates } from "../services/supervision.policy.js";
import { SupervisionService } from "../services/supervision.service.js";

const pepper = "synthetic-ops01-pepper-0123456789abcdef";
const testStart = new Date();
const superadmins = [{ id: randomUUID(), email: `ops01-superadmin-a-${randomUUID()}@example.invalid` }, { id: randomUUID(), email: `ops01-superadmin-b-${randomUUID()}@example.invalid` }];
/** ROLE-01 R2/R3: an admin (the coach in V1) is refused Supervision and never receives its alerts. */
const admin = { id: randomUUID(), email: `ops01-admin-${randomUUID()}@example.invalid` };
const coach = { id: randomUUID(), email: `ops01-coach-${randomUUID()}@example.invalid` };
const allUsers = [...superadmins, admin, coach];
const seededRunIds: string[] = [], auditIds: string[] = [], accessIds: string[] = [], documentIds: string[] = [], holdIds: string[] = [];
const TEST_COUNTER = "RATE_LIMITED:ops01_test_scope" as SecurityEventCode;
let journalDir = "", storageDir = "", safe = false;
const unused = async (): Promise<never> => { throw new Error("unused in this test"); };

before(async () => {
  assertLocalTestDatabase(); safe = true;
  await db.insert(users).values([...superadmins.map((u) => ({ ...u, role: "superadmin" })), { ...admin, role: "admin" }, { ...coach, role: "coach" }].map((u) => ({ ...u, passwordHash: "unused", status: "active" })));
  journalDir = await mkdtemp(path.join(os.tmpdir(), "kfit-ops01-journal-"));
  storageDir = await mkdtemp(path.join(os.tmpdir(), "kfit-ops01-storage-"));
});

after(async () => {
  try {
    if (safe) {
      const ids = allUsers.map((u) => u.id);
      await cleanupInOrder([
        // reconcile writes for every active admin of kfit_test, including fixtures other suites may have left: clean them all.
        ["outbox", () => db.delete(notificationEmailOutbox).where(sql`${inArray(notificationEmailOutbox.recipientUserId, ids)} or ${like(notificationEmailOutbox.dedupeKey, "supervision:%")}`)],
        ["notifications", () => db.delete(notifications).where(sql`${inArray(notifications.recipientUserId, ids)} or ${eq(notifications.kind, "supervision_alert")}`)],
        ["audit", () => db.delete(auditEvents).where(sql`${inArray(auditEvents.actorUserId, ids)} or ${auditIds.length ? inArray(auditEvents.id, auditIds) : sql`false`}`)],
        ["access events", () => accessIds.length ? db.delete(externalAccessEvents).where(inArray(externalAccessEvents.id, accessIds)) : Promise.resolve()],
        ["counter", () => db.delete(securityEventCounters).where(eq(securityEventCounters.code, TEST_COUNTER))],
        ["manual runs", () => db.delete(scheduledJobRuns).where(and(like(scheduledJobRuns.runKey, "manual:%"), gte(scheduledJobRuns.startedAt, testStart)))],
        ["seeded runs", () => seededRunIds.length ? db.delete(scheduledJobRuns).where(inArray(scheduledJobRuns.id, seededRunIds)) : Promise.resolve()],
        ["holds", () => holdIds.length ? db.delete(retentionHolds).where(inArray(retentionHolds.id, holdIds)) : Promise.resolve()],
        ["versions", () => documentIds.length ? db.delete(documentVersions).where(inArray(documentVersions.documentId, documentIds)) : Promise.resolve()],
        ["documents", () => documentIds.length ? db.delete(documents).where(inArray(documents.id, documentIds)) : Promise.resolve()],
        ["users", () => db.delete(users).where(inArray(users.id, ids))],
      ]);
    }
    await rm(journalDir, { recursive: true, force: true });
    await rm(storageDir, { recursive: true, force: true });
  } finally {
    await pool.end();
  }
});

function buildService(mode: "development" | "production", runners: Record<string, () => Promise<Record<string, number>>> = {}, counted: SecurityEventCode[] = []) {
  return new SupervisionService({
    repository: new DrizzleSupervisionRepository(db, { auditHashPepper: pepper }),
    privacy: new DrizzlePrivacyRepository(db, { auditHashPepper: pepper }),
    pool, db, mode, env: {}, journalDir, manualRunners: runners,
    onManualRunRateLimited: () => { counted.push("RATE_LIMITED:supervision_run"); },
  });
}

async function serve(service: SupervisionService, run: (call: (method: string, route: string, as?: string) => Promise<{ status: number; body: unknown; text: string }>) => Promise<void>) {
  const sessions = new Map<string, AuthenticatedSessionContext>([
    ...superadmins.map((u) => [u.id, { userId: u.id, sessionId: randomUUID(), role: "superadmin" as const }] as const),
    [admin.id, { userId: admin.id, sessionId: randomUUID(), role: "admin" as const }],
    [coach.id, { userId: coach.id, sessionId: randomUUID(), role: "coach" as const }],
  ]);
  const app = createServerApp({
    authController: new AuthController({ otpChallengeService: { issue: unused, verify: unused } }),
    resolveAuthSession: (request) => sessions.get(String(request.headers["x-test-user"] ?? "")) ?? null,
    supervisionController: new SupervisionController(service),
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(async (method, route, as = superadmins[0]!.id) => {
      const response = await fetch(url + route, { method, headers: { "x-test-user": as, cookie: "kfit_csrf=ops01", "x-csrf-token": "ops01", "content-type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) });
      const text = await response.text();
      return { status: response.status, body: JSON.parse(text) as unknown, text };
    });
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function seedRun(jobKey: string, status: "succeeded" | "failed", hoursAgo: number, resultJson: Record<string, number | string> = {}, errorCode: string | null = null) {
  const at = new Date(Date.now() - hoursAgo * 3_600_000);
  const [row] = await db.insert(scheduledJobRuns).values({ jobKey, runKey: `ops01:${randomUUID()}`, status, startedAt: at, finishedAt: at, resultJson, errorCode }).returning({ id: scheduledJobRuns.id });
  seededRunIds.push(row!.id);
}

const assertNoPersonalData = (text: string) => {
  for (const user of allUsers) assert.equal(text.includes(user.email), false, "no e-mail in a supervision response");
  assert.equal(/\b\d{1,3}(\.\d{1,3}){3}\b/.test(text.replace(/v\d+\.\d+\.\d+/g, "")), false, "no IP address");
  assert.equal(text.includes(journalDir) || text.includes(path.basename(journalDir)), false, "no journal path");
};

test("OPS-01 O5/O6: overview reports a 30-hour-old backup (BACKUP_STALE) and a failed restore check (RESTORE_CHECK_FAILED)", async () => {
  await seedRun("ops.backup", "succeeded", 30, { bundleBytes: 1234, durationMs: 900, keptPrimary: 7, deletedPrimary: 1 });
  await seedRun("ops.restore_drill", "failed", 1, { tables: 40 }, "DRILL_MISMATCH");
  await serve(buildService("production"), async (call) => {
    const response = await call("GET", supervisionApiRoutes.overview);
    assert.equal(response.status, 200);
    const overview = response.body as SupervisionOverviewResponse;
    const codes = overview.alerts.map((a) => a.code);
    assert.ok(codes.includes("BACKUP_STALE"), codes.join());
    assert.ok(codes.includes("RESTORE_CHECK_FAILED"), codes.join());
    assert.ok(overview.backup.ageHours! >= 29.9 && overview.backup.ageHours! <= 30.1);
    assert.deepEqual([overview.backup.bytes, overview.backup.rotation], [1234, { kept: 7, deleted: 1 }]);
    assert.deepEqual([overview.restoreCheck?.status, overview.restoreCheck?.errorCode], ["failed", "DRILL_MISMATCH"]);
    assert.deepEqual(overview.jobs.map((j) => j.jobKey), ["notifications.reconcile", "notifications.email-delivery", "privacy.purge"]);
    assert.deepEqual(overview.privacy.journal, { configured: true, writable: true });
    assert.equal(overview.runtime.mode, "production");
    assert.ok(overview.runtime.guards && !overview.runtime.guards.ok, "env {} fails the production guards");
    assertNoPersonalData(response.text);
  });
});

test("OPS-01 O2: security series are zero-filled for 7 and 30 Libreville days and count rows on the right day", async () => {
  const now = new Date();
  const today = businessDateKey(now), yesterday = businessDateKey(new Date(now.getTime() - 86_400_000));
  // 00:30 Libreville yesterday = 23:30 UTC the day before: it must count on « yesterday ».
  const yesterdayEarly = new Date(`${yesterday}T00:30:00+01:00`);
  await serve(buildService("development"), async (call) => {
    const before = (await call("GET", `${supervisionApiRoutes.security}?days=7`)).body as SupervisionSecurityResponse;
    const audit = await db.insert(auditEvents).values([
      { actorType: "anonymous", eventType: "auth.login.rejected", entityType: "user", result: "failure", createdAt: now },
      { actorType: "anonymous", eventType: "auth.login.otp_failed", entityType: "user", result: "failure", createdAt: yesterdayEarly },
      { actorType: "anonymous", eventType: "auth.bootstrap.rejected", entityType: "user", result: "blocked", createdAt: now },
    ]).returning({ id: auditEvents.id });
    auditIds.push(...audit.map((row) => row.id));
    await db.insert(securityEventCounters).values({ day: today, code: TEST_COUNTER, count: 4 });
    const access = await db.insert(externalAccessEvents).values({ eventType: "quote.view", result: "QUOTE_LINK_EXPIRED", createdAt: now }).returning({ id: externalAccessEvents.id });
    accessIds.push(...access.map((row) => row.id));

    const week = await call("GET", `${supervisionApiRoutes.security}?days=7`);
    const month = await call("GET", `${supervisionApiRoutes.security}?days=30`);
    assert.equal(week.status, 200);
    const series = (week.body as SupervisionSecurityResponse).days;
    assert.equal(series.length, 7);
    assert.equal((month.body as SupervisionSecurityResponse).days.length, 30);
    assert.equal(series.at(-1)?.date, today);
    assert.deepEqual(series.map((d) => d.date), [...series.map((d) => d.date)].sort(), "oldest first");
    const day = (list: SupervisionSecurityResponse, date: string) => list.days.find((d) => d.date === date)!.series;
    const delta = (date: string, key: "loginRejected" | "otpFailed" | "bootstrapRejected" | "publicLinkInvalid") => day(week.body as SupervisionSecurityResponse, date)[key] - day(before, date)[key];
    assert.deepEqual([delta(today, "loginRejected"), delta(today, "bootstrapRejected"), delta(today, "publicLinkInvalid")], [1, 1, 1]);
    assert.equal(delta(yesterday, "otpFailed"), 1, "Libreville day, not UTC");
    assert.equal(day(week.body as SupervisionSecurityResponse, today).rateLimited.ops01_test_scope, 4);
    assert.deepEqual(Object.keys(series[0]!.series).sort(), ["bootstrapRejected", "encodingRejected", "loginRejected", "otpFailed", "otpLocked", "publicLinkInvalid", "rateLimited"]);
    assertNoPersonalData(week.text);
    for (const bad of ["", "?days=14", "?days=7&x=1", "?days=abc"]) assert.equal((await call("GET", `${supervisionApiRoutes.security}${bad}`)).status, 400, bad);
  });
});

test("OPS-01 O1 / ROLE-01 R2: a superadmin gets 200, an admin or a coach 403 SUPERVISION_SUPERADMIN_FORBIDDEN, an anonymous caller 401 on every route; POST needs CSRF and same origin", async () => {
  await serve(buildService("development"), async (call) => {
    const routes: Array<[string, string]> = [
      ["GET", supervisionApiRoutes.overview], ["GET", supervisionApiRoutes.status], ["GET", `${supervisionApiRoutes.security}?days=7`],
      ["POST", supervisionApiRoutes.runJob.replace(":jobKey", "notifications.reconcile")], ["POST", supervisionApiRoutes.simulatePurge],
    ];
    for (const route of [supervisionApiRoutes.overview, supervisionApiRoutes.status]) assert.equal((await call("GET", route)).status, 200, route);
    for (const [method, route] of routes) {
      for (const refused of [admin.id, coach.id]) assert.deepEqual(await call(method, route, refused).then((r) => [r.status, r.body]), [403, { error: "SUPERVISION_SUPERADMIN_FORBIDDEN" }], route);
      assert.equal((await call(method, route, "nobody")).status, 401, route);
    }
  });
  const app = createServerApp({ authController: new AuthController({ otpChallengeService: { issue: unused, verify: unused } }), resolveAuthSession: () => ({ userId: superadmins[0]!.id, sessionId: randomUUID(), role: "superadmin" }), supervisionController: new SupervisionController(buildService("development")) });
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${supervisionApiRoutes.simulatePurge}`;
    assert.deepEqual(await (await fetch(url, { method: "POST" })).json(), { error: "AUTH_CSRF_INVALID" });
    assert.deepEqual(await (await fetch(url, { method: "POST", headers: { origin: "http://evil.example", cookie: "kfit_csrf=x", "x-csrf-token": "x" } })).json(), { error: "AUTH_ORIGIN_INVALID" });
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("OPS-01 O4: a manual run writes one manual:* row and an audit row; a second within 60 s is 429 (counted); held lock → 409; others → 400", async () => {
  const counted: SecurityEventCode[] = [];
  const service = buildService("development", { "notifications.email-delivery": async () => ({ claimed: 0 }), "notifications.reconcile": async () => ({ opened: 0 }) }, counted);
  await serve(service, async (call) => {
    const first = await call("POST", supervisionApiRoutes.runJob.replace(":jobKey", "notifications.email-delivery"));
    assert.equal(first.status, 200, first.text);
    assert.deepEqual({ ...(first.body as Record<string, unknown>), durationMs: 0 }, { jobKey: "notifications.email-delivery", outcome: "succeeded", durationMs: 0, result: { claimed: 0 }, errorCode: null });
    const rows = await db.select().from(scheduledJobRuns).where(and(eq(scheduledJobRuns.jobKey, "notifications.email-delivery"), like(scheduledJobRuns.runKey, "manual:%"), gte(scheduledJobRuns.startedAt, testStart)));
    assert.deepEqual(rows.map((r) => r.status), ["succeeded"]);
    const audit = await db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, superadmins[0]!.id), eq(auditEvents.eventType, "ops.job.manual_run")));
    assert.equal(audit.length, 1);
    assert.deepEqual([(audit[0]!.metadataJson as Record<string, unknown>).jobKey, (audit[0]!.metadataJson as Record<string, unknown>).outcome], ["notifications.email-delivery", "succeeded"]);

    assert.deepEqual(await call("POST", supervisionApiRoutes.runJob.replace(":jobKey", "notifications.email-delivery")).then((r) => [r.status, r.body]), [429, { error: "SUPERVISION_RATE_LIMITED" }]);
    assert.deepEqual(counted, ["RATE_LIMITED:supervision_run"]);

    const holder = await pool.connect();
    try {
      await holder.query("select pg_advisory_lock(hashtextextended($1, 0))", ["kfit:job:notifications.reconcile"]);
      assert.deepEqual(await call("POST", supervisionApiRoutes.runJob.replace(":jobKey", "notifications.reconcile")).then((r) => [r.status, r.body]), [409, { error: "SUPERVISION_JOB_BUSY" }]);
    } finally {
      await holder.query("select pg_advisory_unlock(hashtextextended($1, 0))", ["kfit:job:notifications.reconcile"]);
      holder.release();
    }
    for (const jobKey of ["privacy.purge", "ops.backup", "unknown.job", "constructor"]) {
      assert.deepEqual(await call("POST", supervisionApiRoutes.runJob.replace(":jobKey", jobKey)).then((r) => [r.status, r.body]), [400, { error: "SUPERVISION_JOB_NOT_RUNNABLE" }], jobKey);
    }
  });
});

test("OPS-01 O4: simulating the purge counts the eligible documents and changes nothing", async () => {
  const past = new Date(Date.now() - 3_600_000);
  const service = buildService("development");
  await serve(service, async (call) => {
    const baseline = (await call("POST", supervisionApiRoutes.simulatePurge)).body as Record<string, number>;
    const seeded = await db.insert(documents).values([0, 1, 2].map(() => ({ ownerType: "subscription", ownerId: randomUUID(), documentType: "medical_clearance", status: "pending_purge", purgeAfter: past })))
      .returning({ id: documents.id });
    documentIds.push(...seeded.map((d) => d.id));
    const keys: string[] = [];
    for (const [index, doc] of seeded.entries()) {
      for (let version = 1; version <= (index === 0 ? 2 : 1); version += 1) {
        const storageKey = `ops01-${randomUUID()}`;
        keys.push(storageKey);
        await db.insert(documentVersions).values({ documentId: doc.id, versionNumber: version, storageKey, originalFilename: "synthetic.pdf", mimeType: "application/pdf", sizeBytes: 100, sha256: "0".repeat(64), uploadedByType: "user" });
        await writeFile(path.join(storageDir, storageKey), "x");
      }
    }
    const [hold] = await db.insert(retentionHolds).values({ scopeType: "document", scopeId: seeded[2]!.id, holdType: "legal", reason: "synthetic" }).returning({ id: retentionHolds.id });
    holdIds.push(hold!.id);

    const countRows = async () => ({
      documents: (await db.select({ n: sql<number>`count(*)::int` }).from(documents).where(inArray(documents.id, documentIds)))[0]!.n,
      pending: (await db.select({ n: sql<number>`count(*)::int` }).from(documents).where(and(inArray(documents.id, documentIds), eq(documents.status, "pending_purge"))))[0]!.n,
      versions: (await db.select({ n: sql<number>`count(*)::int` }).from(documentVersions).where(inArray(documentVersions.documentId, documentIds)))[0]!.n,
      purgeRuns: (await db.select({ n: sql<number>`count(*)::int` }).from(scheduledJobRuns).where(eq(scheduledJobRuns.jobKey, "privacy.purge")))[0]!.n,
      files: (await readdir(storageDir)).sort().join(),
    });
    const beforeCounts = await countRows();
    const simulated = await call("POST", supervisionApiRoutes.simulatePurge);
    assert.equal(simulated.status, 200);
    const counts = simulated.body as Record<string, number>;
    assert.deepEqual({
      subjectsDue: counts.subjectsDue! - baseline.subjectsDue!, filesDue: counts.filesDue! - baseline.filesDue!,
      bytesDue: counts.bytesDue! - baseline.bytesDue!, heldBack: counts.heldBack! - baseline.heldBack!,
    }, { subjectsDue: 2, filesDue: 3, bytesDue: 300, heldBack: 1 });
    assert.deepEqual(await countRows(), beforeCounts, "nothing deleted, no run row, storage untouched");
    assert.equal(beforeCounts.files.split(",").length, keys.length);
    const audit = await db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, superadmins[0]!.id), eq(auditEvents.eventType, "ops.purge.simulated")));
    assert.equal(audit.length, 2);
    assertNoPersonalData(simulated.text);
    assert.equal(simulated.text.includes("synthetic.pdf"), false, "no file name");
  });
});

test("OPS-01 O9 / ROLE-01 R3: reconcile opens supervision_alert for every active superadmin only, resolves an admin's stale row, dedupes, e-mails once per day, resolves when cleared; status levels", async () => {
  await seedRun("ops.backup", "succeeded", 40, { bundleBytes: 1 });
  const service = buildService("development");
  const repository = new DrizzleNotificationsRepository(db, { auditHashPepper: pepper, appBaseUrl: "http://localhost:5173" });
  const jobs = new NotificationJobsService(repository, async () => [], null, () => new Date(), async () => supervisionCandidates(await service.alerts()));
  const staleKey = "supervision:BACKUP_STALE";
  const openFor = async (userId: string) => db.select().from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.kind, "supervision_alert"), eq(notifications.dedupeKey, staleKey), sql`${notifications.resolvedAt} is null`));
  const mailsFor = async (userId: string) => db.select().from(notificationEmailOutbox).where(and(eq(notificationEmailOutbox.recipientUserId, userId), like(notificationEmailOutbox.dedupeKey, `supervision:%:${staleKey}:%`)));

  // A row opened for an admin before ROLE-01: the next reconcile resolves it.
  await db.insert(notifications).values({ recipientUserId: admin.id, kind: "supervision_alert", resourceType: "supervision", resourceId: randomUUID(), dedupeKey: staleKey,
    title: "Alerte de supervision", summary: "synthetic", deepLink: "/admin/supervision", severity: "warning", occurredAt: testStart, firstDetectedAt: testStart, lastDetectedAt: testStart });
  await jobs.reconcile();
  assert.equal((await openFor(admin.id)).length, 0, "an admin's open supervision row is resolved");
  assert.equal((await db.select().from(notifications).where(and(eq(notifications.recipientUserId, admin.id), eq(notifications.kind, "supervision_alert")))).length, 1, "never a new row for an admin");
  assert.equal((await mailsFor(admin.id)).length, 0, "never an e-mail to an admin");
  for (const superadmin of superadmins) {
    const rows = await openFor(superadmin.id);
    assert.equal(rows.length, 1, "one open alert per superadmin");
    assert.deepEqual([rows[0]!.severity, rows[0]!.resourceType, rows[0]!.deepLink, rows[0]!.customerId], ["warning", "supervision", "/admin/supervision", null]);
    assert.equal((await mailsFor(superadmin.id)).length, 1);
  }
  assert.equal((await db.select().from(notifications).where(eq(notifications.recipientUserId, coach.id))).length, 0, "never a coach");

  await jobs.reconcile();
  for (const superadmin of superadmins) {
    assert.equal(await openFor(superadmin.id).then((r) => r.length), 1, "dedupe across runs");
    assert.equal((await mailsFor(superadmin.id)).length, 1, "one e-mail per alert per Libreville day");
  }

  await serve(service, async (call) => {
    const status = await call("GET", supervisionApiRoutes.status);
    assert.equal(status.status, 200);
    assert.equal((status.body as { level: string }).level, "critical");
    assert.ok((status.body as { alertCount: number }).alertCount >= 1);
    assertNoPersonalData(status.text);
  });

  await seedRun("ops.backup", "succeeded", 0.1, { bundleBytes: 2 });
  await jobs.reconcile();
  for (const superadmin of superadmins) {
    assert.equal(await openFor(superadmin.id).then((r) => r.length), 0, "resolved once a fresh backup exists");
    const resolved = await db.select().from(notifications).where(and(eq(notifications.recipientUserId, superadmin.id), eq(notifications.dedupeKey, staleKey)));
    assert.ok(resolved.every((row) => row.resolvedAt !== null));
  }
  await serve(service, async (call) => {
    const open = await db.select().from(notifications).where(and(eq(notifications.recipientUserId, superadmins[0]!.id), eq(notifications.kind, "supervision_alert"), sql`${notifications.resolvedAt} is null`));
    const status = (await call("GET", supervisionApiRoutes.status)).body as { level: string; alertCount: number };
    assert.equal(status.alertCount, open.length);
    if (open.length === 0) assert.equal(status.level, "ok");
  });
});

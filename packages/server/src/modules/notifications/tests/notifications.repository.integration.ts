import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, count, eq, inArray, like, or } from "drizzle-orm";
import { notificationSettingKeys } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { subscriptions } from "../../../db/schema/customers.js";
import {
  notificationEmailOutbox,
  notifications,
  operationalSettings,
} from "../../../db/schema/notifications.js";
import { scheduledJobRuns } from "../../../db/schema/operations.js";
import { runScheduledJob } from "../jobs/scheduled-job.runner.js";
import { DrizzleNotificationsRepository } from "../repositories/notifications.repository.js";
import { NotificationJobsService } from "../services/notification-jobs.service.js";
import type { NotificationCandidate } from "../services/notification.policy.js";

// Far-future clock so local rows (demo data, other runs) never share a digest date or a reminder window.
const t0 = new Date("2031-05-12T06:00:00.000Z"); // 07:00 Libreville
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const run = randomUUID().slice(0, 8);
const admin = randomUUID(),
  inactive = randomUUID(),
  archived = randomUUID(),
  coach = randomUUID();
const resourceA = randomUUID(),
  resourceB = randomUUID();
const repository = new DrizzleNotificationsRepository(db, {
  auditHashPepper: "integration-pepper",
  appBaseUrl: "https://app.kfit.example",
});
const actor = {
  userId: admin,
  requestId: randomUUID(),
  ipAddress: null,
  userAgent: null,
};
const jobKeys = [`it.lock.${run}`, `it.fail.${run}`];

const candidate = (
  resourceId: string,
  over: Partial<NotificationCandidate> = {},
): NotificationCandidate => ({
  kind: "request_to_contact",
  severity: "warning",
  resourceType: "request",
  resourceId,
  subscriptionId: null,
  customerId: null,
  customerDisplayName: "Synthétique IT",
  title: "Demande à contacter",
  summary: "Coaching 12 semaines",
  deepLink: `/admin/demandes?demande=${resourceId}`,
  dedupeKey: `request_to_contact:${resourceId}`,
  occurredAt: t0,
  ...over,
});
const mine = async () =>
  db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, admin),
        inArray(notifications.resourceId, [resourceA, resourceB]),
      ),
    );
const myMail = async () =>
  db
    .select()
    .from(notificationEmailOutbox)
    .where(eq(notificationEmailOutbox.recipientUserId, admin));
const setSettings = async (values: Record<string, boolean | number>) =>
  repository.updateSettings(values as never, actor, t0);

before(async () => {
  assertLocalTestDatabase();
  await db
    .delete(operationalSettings)
    .where(inArray(operationalSettings.key, notificationSettingKeys));
  await db.insert(users).values([
    {
      id: admin,
      email: `notif-admin-${run}@example.invalid`,
      passwordHash: "synthetic",
      role: "admin",
      status: "active",
    },
    {
      id: inactive,
      email: `notif-inactive-${run}@example.invalid`,
      passwordHash: "synthetic",
      role: "admin",
      status: "disabled",
    },
    {
      id: archived,
      email: `notif-archived-${run}@example.invalid`,
      passwordHash: "synthetic",
      role: "admin",
      status: "active",
      archivedAt: t0,
    },
    {
      id: coach,
      email: `notif-coach-${run}@example.invalid`,
      passwordHash: "synthetic",
      role: "coach",
      status: "active",
    },
  ]);
});
after(async () => {
  const ours = or(
    inArray(notifications.resourceId, [resourceA, resourceB]),
    inArray(notifications.recipientUserId, [admin, inactive, archived, coach]),
  );
  const ids = (
    await db.select({ id: notifications.id }).from(notifications).where(ours)
  ).map((r) => r.id);
  await db
    .delete(notificationEmailOutbox)
    .where(
      or(
        like(notificationEmailOutbox.dedupeKey, "digest:%:2031-%"),
        inArray(notificationEmailOutbox.recipientUserId, [admin]),
        ids.length
          ? inArray(notificationEmailOutbox.notificationId, ids)
          : undefined,
      ),
    );
  if (ids.length)
    await db.delete(notifications).where(inArray(notifications.id, ids));
  await db
    .delete(operationalSettings)
    .where(inArray(operationalSettings.key, notificationSettingKeys));
  await db
    .delete(scheduledJobRuns)
    .where(inArray(scheduledJobRuns.jobKey, jobKeys));
  await db.delete(auditEvents).where(eq(auditEvents.actorUserId, admin));
  await db
    .delete(users)
    .where(inArray(users.id, [admin, inactive, archived, coach]));
  await pool.end();
});

test("reconcile: one open notification per condition, active admins only, read never resolves, resolution keeps history, recurrence reopens", async () => {
  const [{ value: subscriptionsBefore }] = (await db
    .select({ value: count() })
    .from(subscriptions)) as [{ value: number }];
  await setSettings({ "notifications.email.enabled": false });
  await repository.reconcile([candidate(resourceA)], at(0));
  await Promise.all([
    repository.reconcile([candidate(resourceA)], at(1)),
    repository.reconcile([candidate(resourceA)], at(1)),
  ]);
  let rows = await mine();
  assert.equal(
    rows.length,
    1,
    "duplicate/concurrent reconcile keeps one open row",
  );
  assert.equal(rows[0]!.firstDetectedAt.toISOString(), at(0).toISOString());
  const others = await db
    .select()
    .from(notifications)
    .where(
      and(inArray(notifications.recipientUserId, [inactive, archived, coach])),
    );
  assert.equal(
    others.length,
    0,
    "inactive, archived admins and coaches receive nothing",
  );
  assert.equal(
    (await myMail()).length,
    0,
    "e-mail disabled still creates in-app notifications but no outbox",
  );

  const active = (await repository.list(admin, "active", null, 30)).items;
  const before = await repository.counts(admin);
  assert.deepEqual(before, {
    unread: active.filter((i) => !i.readAt).length,
    open: active.length,
  });
  const read = await repository.markRead(rows[0]!.id, actor, at(2));
  assert.ok(read?.readAt && !read.resolvedAt, "read does not resolve");
  const after = await repository.counts(admin);
  assert.deepEqual(
    after,
    { unread: before.unread - 1, open: before.open },
    "POL-01 D7: a read but unresolved notification leaves the badge and stays open",
  );
  assert.ok(after.open >= after.unread);
  assert.equal(
    (await repository.markRead(rows[0]!.id, actor, at(3)))?.readAt,
    read.readAt,
    "read is idempotent",
  );
  assert.equal(
    await repository.markRead(rows[0]!.id, { ...actor, userId: coach }, at(3)),
    null,
    "another user cannot read it",
  );
  await repository.reconcile([candidate(resourceA)], at(4));
  rows = await mine();
  assert.equal(rows.length, 1);
  assert.ok(rows[0]!.readAt, "refresh keeps read state");

  await repository.reconcile([], at(5));
  rows = await mine();
  assert.equal(rows.length, 1);
  assert.equal(
    rows[0]!.resolvedAt?.toISOString(),
    at(5).toISOString(),
    "vanished condition is resolved, not deleted",
  );
  const resolvedPage = await repository.list(admin, "resolved", null, 30);
  assert.ok(resolvedPage.items.some((i) => i.id === rows[0]!.id));

  await repository.reconcile([candidate(resourceA)], at(6));
  rows = (await mine()).sort(
    (a, b) => a.firstDetectedAt.getTime() - b.firstDetectedAt.getTime(),
  );
  assert.equal(rows.length, 2, "recurrence after resolution opens a new row");
  assert.ok(rows[0]!.resolvedAt && !rows[1]!.resolvedAt && !rows[1]!.readAt);

  const audits = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.actorUserId, admin));
  assert.deepEqual(audits.map((a) => a.eventType).sort(), [
    "notification.read",
    "notification.settings_updated",
  ]);
  assert.ok(
    !JSON.stringify(audits.map((a) => a.metadataJson)).includes("Synthétique"),
    "audit metadata carries no customer name",
  );
  const [{ value: subscriptionsAfter }] = (await db
    .select({ value: count() })
    .from(subscriptions)) as [{ value: number }];
  assert.equal(subscriptionsAfter, subscriptionsBefore, "no business mutation");
  await repository.reconcile([], at(7));
});

test("reminders follow category switches and reminder windows; digest is one per recipient and Libreville date from 08:00", async () => {
  await setSettings({
    "notifications.email.enabled": true,
    "notifications.daily_digest.enabled": true,
    "notifications.daily_digest.hour": 8,
  });
  const followUp = candidate(resourceB, {
    kind: "follow_up_overdue",
    resourceType: "subscription",
    dedupeKey: `follow_up_overdue:${resourceB}`,
    title: "Suivi en retard",
  });
  await repository.reconcile([followUp], at(10)); // 07:10 Libreville, category off by default
  assert.equal(
    (await myMail()).length,
    0,
    "category disabled and digest not yet due → no e-mail",
  );

  await setSettings({
    "notifications.follow_up_overdue.email_enabled": true,
    "notifications.follow_up_overdue.reminder_days": 3,
  });
  await repository.reconcile([followUp], at(20));
  await repository.reconcile([followUp], at(25));
  let mail = await myMail();
  assert.deepEqual(
    mail.map((m) => m.messageKind),
    ["reminder"],
    "one reminder for window 0, no duplicate",
  );
  assert.equal(mail[0]!.subject, "K'FIT - Suivi en retard - Synthétique IT");

  await repository.reconcile([followUp], at(60)); // 08:00 Libreville
  await repository.reconcile([followUp], at(75));
  mail = await myMail();
  const digests = mail.filter((m) => m.messageKind === "digest");
  assert.equal(digests.length, 1, "one digest per recipient and date");
  assert.equal(digests[0]!.dedupeKey, `digest:${admin}:2031-05-12`);
  assert.match(digests[0]!.bodyText, /1 suivi en retard/);
  assert.match(digests[0]!.bodyText, /https:\/\/app\.kfit\.example\/admin/);

  await repository.reconcile([followUp], at(3 * 24 * 60 + 75)); // three days later, 08:15 Libreville → window 1
  mail = await myMail();
  assert.equal(mail.filter((m) => m.messageKind === "reminder").length, 2);
  assert.ok(mail.some((m) => m.subject.startsWith("K'FIT - Rappel : ")));
  assert.equal(
    mail.filter((m) => m.messageKind === "digest").length,
    2,
    "next business date gets its own digest",
  );
  for (const m of mail)
    assert.ok(
      !/FCFA|questionnaire|santé/i.test(`${m.subject} ${m.bodyText}`),
      "privacy-safe e-mail",
    );
});

test("delivery: SMTP failure retries on schedule, sends once, concurrent claims never double-send, dead letter after bounded attempts", async () => {
  const sendAt = at(4 * 24 * 60);
  let outage = true;
  const sent: string[] = [];
  const mail = {
    async send(input: { to: string; subject: string }) {
      if (outage)
        throw Object.assign(new Error("down"), { code: "ECONNREFUSED" });
      sent.push(`${input.to}|${input.subject}`);
      return { messageId: `<${randomUUID()}@it>` };
    },
  };
  const jobs = (now: Date) =>
    new NotificationJobsService(
      repository,
      async () => [],
      mail,
      () => now,
    );
  await jobs(sendAt).deliver(500);
  let rows = await myMail();
  assert.ok(
    rows.length >= 4 &&
      rows.every(
        (r) =>
          r.status === "failed" &&
          r.attemptCount === 1 &&
          r.lastErrorCode === "SMTP_ECONNREFUSED",
      ),
  );
  assert.ok(
    rows.every(
      (r) => r.nextAttemptAt.getTime() === sendAt.getTime() + 5 * 60_000,
    ),
  );
  assert.equal(
    (await repository.claimDue(at(4 * 24 * 60 + 1), 500)).filter(
      (r) => r.recipientUserId === admin,
    ).length,
    0,
    "not due before the retry delay",
  );

  outage = false;
  const retryAt = new Date(sendAt.getTime() + 5 * 60_000);
  const [a, b] = await Promise.all([
    repository.claimDue(retryAt, 500),
    repository.claimDue(retryAt, 500),
  ]);
  const claimed = [...a, ...b].filter((r) => r.recipientUserId === admin);
  assert.equal(
    new Set(claimed.map((r) => r.id)).size,
    claimed.length,
    "SKIP LOCKED: no row claimed twice",
  );
  for (const row of [...a, ...b])
    await repository.markSent(row.id, "<it>", retryAt);
  await jobs(new Date(retryAt.getTime() + 24 * 3_600_000)).deliver(500);
  rows = await myMail();
  assert.ok(
    rows.every((r) => r.status === "sent" && r.attemptCount === 2),
    "sent rows are never claimed again",
  );

  // A new row that keeps failing: +5m, +30m, +2h, +12h, then dead letter on the 5th attempt.
  await db.insert(notificationEmailOutbox).values({
    recipientUserId: admin,
    toEmail: `notif-admin-${run}@example.invalid`,
    subject: "s",
    bodyText: "b",
    messageKind: "digest",
    dedupeKey: `digest:${admin}:2031-06-01`,
    status: "pending",
    nextAttemptAt: at(10 * 24 * 60),
  });
  outage = true;
  let clock = at(10 * 24 * 60);
  for (let attempt = 1; attempt <= 5; attempt++) {
    await jobs(clock).deliver(500);
    const [row] = (await myMail()).filter((r) =>
      r.dedupeKey.endsWith("2031-06-01"),
    );
    assert.equal(row!.attemptCount, attempt);
    assert.equal(row!.status, attempt < 5 ? "failed" : "dead_letter");
    clock = row!.nextAttemptAt;
  }
  await jobs(new Date(clock.getTime() + 48 * 3_600_000)).deliver(500);
  assert.equal(
    (await myMail()).find((r) => r.dedupeKey.endsWith("2031-06-01"))!
      .attemptCount,
    5,
    "dead letter is never retried",
  );
});

test("scheduled jobs: advisory lock gives one owner, a succeeded run is not repeated, a failed run is retried", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = runScheduledJob(pool, db, jobKeys[0]!, "w1", async () => {
    await gate;
    return { done: 1 };
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await runScheduledJob(pool, db, jobKeys[0]!, "w1", async () => ({
      done: 2,
    })),
    { outcome: "skipped_locked" },
  );
  release();
  assert.deepEqual(await slow, { outcome: "succeeded", result: { done: 1 } });
  assert.deepEqual(
    await runScheduledJob(pool, db, jobKeys[0]!, "w1", async () => ({
      done: 3,
    })),
    { outcome: "skipped_done" },
  );

  assert.deepEqual(
    await runScheduledJob(pool, db, jobKeys[1]!, "w1", async () => {
      throw new Error("SOURCE_UNAVAILABLE");
    }),
    { outcome: "failed", errorCode: "SOURCE_UNAVAILABLE" },
  );
  assert.deepEqual(
    await runScheduledJob(pool, db, jobKeys[1]!, "w1", async () => ({ ok: 1 })),
    { outcome: "succeeded", result: { ok: 1 } },
  );
  const [runRow] = await db
    .select()
    .from(scheduledJobRuns)
    .where(eq(scheduledJobRuns.jobKey, jobKeys[1]!));
  assert.equal(runRow!.attempt, 2);
  assert.equal(runRow!.status, "succeeded");
  assert.equal(runRow!.errorCode, null);
});

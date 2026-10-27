import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { services } from "../../../db/schema/catalogue.js";
import { externalAccessEvents } from "../../../db/schema/documents.js";
import {
  notificationEmailOutbox,
  notifications,
} from "../../../db/schema/notifications.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import {
  assertLocalTestDatabase,
  cleanupInOrder,
} from "../../../testing/integration-fixtures.js";
import { DrizzleNotificationsRepository } from "../../notifications/repositories/notifications.repository.js";
import { NotificationJobsService } from "../../notifications/services/notification-jobs.service.js";
import { DrizzleSupervisionRepository } from "../../supervision/repositories/supervision.repository.js";
import { supervisionCandidates } from "../../supervision/services/supervision.policy.js";
import { SupervisionService } from "../../supervision/services/supervision.service.js";
import { DrizzlePrivacyRepository } from "../repositories/privacy.repository.js";
import {
  DrizzleRetentionRepository,
  inactiveProspects,
  readRetentionCutoffs,
  retentionCounts,
} from "../repositories/retention.repository.js";
import { REDACTED } from "../services/retention.policy.js";

/*
 * RET-01 on kfit_test. The steps act on the whole table, so every seeded row is dated in 1999-2000 (or today) and the
 * assertions read only this suite's rows; the counts compared (simulate vs run) are global on purpose.
 */

const pepper = "synthetic-ret01-pepper-0123456789abcdef";
const tag = randomUUID().slice(0, 8);
const OLD = new Date("2000-01-01T00:00:00.000Z");
const recent = () => new Date(Date.now() - 86_400_000);
const user = { id: randomUUID(), email: `ret01-${tag}@example.invalid` };
const superadmin = {
  id: randomUUID(),
  email: `ret01-super-${tag}@example.invalid`,
};
const evidenceId = randomUUID();
const prospectIds: string[] = [];
const requestIds: string[] = [];
const accessType = `ret01.${tag}`;
const testStart = new Date();
let serviceId = "";
let safe = false;

before(async () => {
  assertLocalTestDatabase();
  safe = true;
  await db.insert(users).values([
    { ...user, passwordHash: "unused", role: "admin", status: "active" },
    {
      ...superadmin,
      passwordHash: "unused",
      role: "superadmin",
      status: "active",
    },
  ]);
  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .limit(1);
  assert.ok(
    service,
    "kfit_test has a seeded catalogue service (npm run db:test:prepare)",
  );
  serviceId = service.id;
});

after(async () => {
  try {
    if (safe) {
      const ids = [user.id, superadmin.id];
      await cleanupInOrder([
        [
          "outbox",
          () =>
            db
              .delete(notificationEmailOutbox)
              .where(
                sql`${inArray(notificationEmailOutbox.recipientUserId, ids)} or ${like(notificationEmailOutbox.dedupeKey, "supervision:%")}`,
              ),
        ],
        [
          "notifications",
          () =>
            db
              .delete(notifications)
              .where(
                sql`${inArray(notifications.recipientUserId, ids)} or ${eq(notifications.kind, "supervision_alert")}`,
              ),
        ],
        [
          "audit",
          () =>
            db.delete(auditEvents).where(eq(auditEvents.entityId, evidenceId)),
        ],
        [
          "access",
          () =>
            db
              .delete(externalAccessEvents)
              .where(eq(externalAccessEvents.eventType, accessType)),
        ],
        [
          "requests",
          () =>
            requestIds.length
              ? db
                  .delete(serviceRequests)
                  .where(inArray(serviceRequests.id, requestIds))
              : Promise.resolve(),
        ],
        [
          "prospects",
          () =>
            prospectIds.length
              ? db.delete(prospects).where(inArray(prospects.id, prospectIds))
              : Promise.resolve(),
        ],
        ["users", () => db.delete(users).where(inArray(users.id, ids))],
      ]);
    }
  } finally {
    await pool.end();
  }
});

type OutboxSeed = Partial<typeof notificationEmailOutbox.$inferInsert> & {
  status: string;
};
async function outbox(seed: OutboxSeed) {
  const [row] = await db
    .insert(notificationEmailOutbox)
    .values({
      recipientUserId: user.id,
      toEmail: user.email,
      subject: "Sujet synthétique",
      bodyText: "Corps synthétique",
      messageKind: "reminder",
      dedupeKey: `ret01:${randomUUID()}`,
      nextAttemptAt: OLD,
      ...seed,
    })
    .returning();
  return row!;
}
const outboxRow = async (id: string) =>
  (
    await db
      .select()
      .from(notificationEmailOutbox)
      .where(eq(notificationEmailOutbox.id, id))
  )[0]!;

async function notification(resolvedAt: Date | null) {
  const [row] = await db
    .insert(notifications)
    .values({
      recipientUserId: user.id,
      kind: "follow_up_overdue",
      severity: "warning",
      resourceType: "subscription",
      resourceId: randomUUID(),
      title: "Synthétique",
      summary: "Synthétique",
      deepLink: "/admin",
      dedupeKey: `ret01:${randomUUID()}`,
      firstDetectedAt: OLD,
      lastDetectedAt: OLD,
      resolvedAt,
    })
    .returning();
  return row!;
}

async function prospectWithRequest(
  submittedAt: Date,
  extra: { archived?: boolean; anonymized?: boolean; converted?: boolean } = {},
) {
  const [prospect] = await db
    .insert(prospects)
    .values({
      fullName: `Synthetic Ret01 ${tag}`,
      whatsapp: "+24100000000",
      email: `ret01-prospect-${tag}@example.invalid`,
      ...(extra.archived ? { archivedAt: OLD } : {}),
      ...(extra.anonymized ? { anonymizedAt: OLD } : {}),
    })
    .returning({ id: prospects.id });
  prospectIds.push(prospect!.id);
  const [request] = await db
    .insert(serviceRequests)
    .values({
      reference: `RET01-${tag}-${prospectIds.length}`,
      submissionToken: randomUUID(),
      prospectId: prospect!.id,
      serviceId,
      submittedAt,
      ...(extra.converted
        ? { status: "converted", convertedSubscriptionId: randomUUID() }
        : {}),
    })
    .returning({ id: serviceRequests.id });
  requestIds.push(request!.id);
  return { prospectId: prospect!.id, requestId: request!.id };
}

test("RET-01 T1: only old sent / dead-letter rows are redacted (content only); pending, sending, failed and recent rows are untouched; a rerun changes nothing; the key still blocks a resend", async () => {
  const cutoff = new Date("2001-01-01T00:00:00.000Z");
  const sent = await outbox({
    status: "sent",
    sentAt: OLD,
    lastAttemptAt: OLD,
    attemptCount: 1,
    bodyHtml: "<p>html</p>",
  });
  const dead = await outbox({
    status: "dead_letter",
    lastAttemptAt: OLD,
    attemptCount: 5,
    lastErrorCode: "SMTP_DOWN",
  });
  // Anonymization moves never-claimed rows to dead_letter: no last attempt, final since updated_at.
  const anonymized = await outbox({
    status: "dead_letter",
    lastErrorCode: "SUBJECT_ANONYMIZED",
    updatedAt: OLD,
  });
  const untouched = [
    await outbox({
      status: "dead_letter",
      lastErrorCode: "SUBJECT_ANONYMIZED",
      updatedAt: recent(),
    }),
    await outbox({ status: "failed", lastAttemptAt: OLD, attemptCount: 2 }),
    await outbox({ status: "pending" }),
    await outbox({ status: "sending", lastAttemptAt: OLD, attemptCount: 1 }),
    await outbox({
      status: "sent",
      sentAt: recent(),
      lastAttemptAt: recent(),
      attemptCount: 1,
    }),
  ];
  const repository = new DrizzleRetentionRepository(db);
  const now = new Date();
  assert.ok((await repository.redactOutboxBatch(cutoff, now, 50)) >= 3);

  const redacted = await outboxRow(sent.id);
  assert.deepEqual(
    [redacted.toEmail, redacted.subject, redacted.bodyText, redacted.bodyHtml],
    [REDACTED, REDACTED, REDACTED, REDACTED],
  );
  assert.deepEqual(
    [
      redacted.status,
      redacted.dedupeKey,
      redacted.attemptCount,
      redacted.sentAt?.toISOString(),
      redacted.lastAttemptAt?.toISOString(),
    ],
    [
      sent.status,
      sent.dedupeKey,
      sent.attemptCount,
      sent.sentAt?.toISOString(),
      sent.lastAttemptAt?.toISOString(),
    ],
  );
  const deadRow = await outboxRow(dead.id);
  assert.deepEqual(
    [deadRow.toEmail, deadRow.bodyHtml, deadRow.status, deadRow.lastErrorCode],
    [REDACTED, null, "dead_letter", "SMTP_DOWN"],
  );
  const anonymizedRow = await outboxRow(anonymized.id);
  assert.deepEqual(
    [anonymizedRow.toEmail, anonymizedRow.subject, anonymizedRow.lastAttemptAt],
    [REDACTED, REDACTED, null],
    "a dead_letter row never claimed is redacted once final for longer than the cutoff",
  );
  for (const row of untouched)
    assert.deepEqual(await outboxRow(row.id), row, row.status);

  assert.equal(
    await repository.redactOutboxBatch(cutoff, now, 50),
    0,
    "a rerun finds nothing",
  );
  const again = await db
    .insert(notificationEmailOutbox)
    .values({
      recipientUserId: user.id,
      toEmail: user.email,
      subject: "s",
      bodyText: "b",
      messageKind: "reminder",
      dedupeKey: sent.dedupeKey,
      status: "pending",
      nextAttemptAt: now,
    })
    .onConflictDoNothing({ target: notificationEmailOutbox.dedupeKey })
    .returning({ id: notificationEmailOutbox.id });
  assert.equal(
    again.length,
    0,
    "the redacted row's dedupe key still blocks a re-enqueue",
  );
});

test("RET-01 T2: old resolved notifications are deleted after their outbox rows are unlinked; open and recently resolved ones survive", async () => {
  const cutoff = new Date("2001-01-01T00:00:00.000Z");
  const old = await notification(OLD);
  const open = await notification(null);
  const fresh = await notification(recent());
  const linked = await outbox({
    status: "sent",
    sentAt: recent(),
    lastAttemptAt: recent(),
    notificationId: old.id,
  });
  assert.ok(
    (await new DrizzleRetentionRepository(db).deleteNotificationsBatch(
      cutoff,
      50,
    )) >= 1,
  );
  const left = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(inArray(notifications.id, [old.id, open.id, fresh.id]));
  assert.deepEqual(left.map((r) => r.id).sort(), [open.id, fresh.id].sort());
  const unlinked = await outboxRow(linked.id);
  assert.deepEqual(
    [unlinked.notificationId, unlinked.status, unlinked.toEmail],
    [null, "sent", user.email],
  );
});

test("RET-01 T3: old auth.* / ops.* audit events go except the evidence keep-list; other prefixes and recent rows stay; old access events go", async () => {
  const cutoff = new Date("2001-01-01T00:00:00.000Z");
  const types = [
    "auth.login.rejected",
    "ops.job.manual_run",
    "auth.user.created",
    "auth.bootstrap.created",
    "auth.user.role_changed",
    "privacy.anonymized",
    "consent.recorded",
    "payment.recorded",
    "receipt.issued",
    "quote.issued",
  ];
  await db.insert(auditEvents).values([
    ...types.map((eventType) => ({
      actorType: "system",
      eventType,
      entityType: "user",
      entityId: evidenceId,
      result: "success",
      createdAt: OLD,
    })),
    {
      actorType: "system",
      eventType: "auth.login.rejected",
      entityType: "user",
      entityId: evidenceId,
      result: "failure",
      createdAt: recent(),
    },
  ]);
  const [oldAccess] = await db
    .insert(externalAccessEvents)
    .values({
      eventType: accessType,
      result: "DOCUMENT_LINK_INVALID",
      createdAt: OLD,
    })
    .returning({ id: externalAccessEvents.id });
  const [freshAccess] = await db
    .insert(externalAccessEvents)
    .values({
      eventType: accessType,
      result: "DOCUMENT_LINK_INVALID",
      createdAt: recent(),
    })
    .returning({ id: externalAccessEvents.id });

  const repository = new DrizzleRetentionRepository(db);
  assert.ok((await repository.deleteAuditBatch(cutoff, 500)) >= 2);
  assert.ok((await repository.deleteAccessBatch(cutoff, 500)) >= 1);

  const kept = await db
    .select({ type: auditEvents.eventType, at: auditEvents.createdAt })
    .from(auditEvents)
    .where(eq(auditEvents.entityId, evidenceId));
  assert.deepEqual(
    kept
      .filter((r) => r.at.getTime() === OLD.getTime())
      .map((r) => r.type)
      .sort(),
    [
      "auth.bootstrap.created",
      "auth.user.created",
      "auth.user.role_changed",
      "consent.recorded",
      "payment.recorded",
      "privacy.anonymized",
      "quote.issued",
      "receipt.issued",
    ],
  );
  assert.equal(
    kept.filter((r) => r.at.getTime() !== OLD.getTime()).length,
    1,
    "the recent login rejection stays",
  );
  const access = await db
    .select({ id: externalAccessEvents.id })
    .from(externalAccessEvents)
    .where(eq(externalAccessEvents.eventType, accessType));
  assert.deepEqual(
    access.map((r) => r.id),
    [freshAccess!.id],
  );
  assert.notEqual(oldAccess!.id, freshAccess!.id);
});

test("RET-01 T4: inactive prospects at the exact boundary, exclusions, max 20 oldest first, request reference and date only", async () => {
  const cutoff = new Date("2001-01-01T00:00:00.000Z");
  const exactly = await prospectWithRequest(cutoff);
  const justBefore = await prospectWithRequest(new Date(cutoff.getTime() - 1));
  for (const extra of [
    { archived: true },
    { anonymized: true },
    { converted: true },
  ])
    await prospectWithRequest(OLD, extra);
  const oldest: string[] = [];
  for (let i = 0; i < 21; i += 1)
    oldest.push(
      (await prospectWithRequest(new Date(Date.UTC(1999, 0, 1 + i)))).requestId,
    );

  const result = await inactiveProspects(db, cutoff);
  assert.equal(result.count, 22, "21 old + the one just before the cutoff");
  assert.equal(result.items.length, 20);
  assert.deepEqual(
    result.items.map((i) => i.requestId),
    oldest.slice(0, 20),
    "oldest first",
  );
  assert.ok(
    !result.items.some(
      (i) =>
        i.requestId === exactly.requestId ||
        i.requestId === justBefore.requestId,
    ),
  );
  for (const item of result.items)
    assert.deepEqual(Object.keys(item).sort(), [
      "lastRequestAt",
      "reference",
      "requestId",
    ]);
  const payload = JSON.stringify(result);
  assert.ok(
    !payload.includes("Synthetic Ret01") &&
      !payload.includes("+241") &&
      !payload.includes("@example.invalid"),
    "no name, phone or e-mail",
  );

  const boundary = await inactiveProspects(db, new Date(cutoff.getTime() + 1));
  assert.equal(
    boundary.count,
    23,
    "one millisecond later the boundary request is inactive too",
  );
});

test("RET-01 R7: « Simuler » counts equal the following run, writes nothing; a second run finds nothing", async () => {
  await outbox({
    status: "sent",
    sentAt: OLD,
    lastAttemptAt: OLD,
    attemptCount: 1,
  });
  await notification(OLD);
  await db.insert(auditEvents).values({
    actorType: "system",
    eventType: "auth.login.rejected",
    entityType: "user",
    entityId: evidenceId,
    result: "failure",
    createdAt: OLD,
  });
  await db.insert(externalAccessEvents).values({
    eventType: accessType,
    result: "QUOTE_LINK_EXPIRED",
    createdAt: OLD,
  });

  const now = new Date();
  const privacy = new DrizzlePrivacyRepository(db, { auditHashPepper: pepper });
  const first = await privacy.simulatePurge(now);
  const second = await privacy.simulatePurge(now);
  assert.deepEqual(second, first, "simulate writes nothing");
  assert.ok(
    first.outboxToRedact >= 1 &&
      first.notificationsToDelete >= 1 &&
      first.auditEventsToDelete >= 1 &&
      first.accessEventsToDelete >= 1,
  );

  const run = await new DrizzleRetentionRepository(db).run(now, 50);
  assert.deepEqual(
    [
      run.outboxRedacted,
      run.notificationsDeleted,
      run.auditEventsDeleted,
      run.accessEventsDeleted,
      run.retentionStepsFailed,
    ],
    [
      first.outboxToRedact,
      first.notificationsToDelete,
      first.auditEventsToDelete,
      first.accessEventsToDelete,
      0,
    ],
  );
  const rerun = await new DrizzleRetentionRepository(db).run(now, 50);
  assert.deepEqual(rerun, {
    outboxRedacted: 0,
    notificationsDeleted: 0,
    auditEventsDeleted: 0,
    accessEventsDeleted: 0,
    retentionStepsFailed: 0,
  });
  assert.deepEqual(
    await retentionCounts(db, await readRetentionCutoffs(db, now)),
    {
      outboxToRedact: 0,
      notificationsToDelete: 0,
      auditEventsToDelete: 0,
      accessEventsToDelete: 0,
    },
  );
});

test("RET-01 T4: PROSPECTS_INACTIVE (warning) is raised by reconcile for the superadmin and resolved once no prospect is inactive", async () => {
  const clock = () => new Date("2001-06-01T00:00:00.000Z");
  const service = new SupervisionService({
    repository: new DrizzleSupervisionRepository(db, {
      auditHashPepper: pepper,
    }),
    privacy: new DrizzlePrivacyRepository(db, { auditHashPepper: pepper }),
    pool,
    db,
    mode: "development",
    env: {},
    journalDir: null,
    manualRunners: {},
    onManualRunRateLimited: () => undefined,
    clock,
  });
  const jobs = new NotificationJobsService(
    new DrizzleNotificationsRepository(db, {
      auditHashPepper: pepper,
      appBaseUrl: "http://localhost:5173",
    }),
    async () => [],
    null,
    () => new Date(),
    async () => supervisionCandidates(await service.alerts()),
  );
  const open = () =>
    db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, superadmin.id),
          eq(notifications.dedupeKey, "supervision:PROSPECTS_INACTIVE"),
          sql`${notifications.resolvedAt} is null`,
        ),
      );

  const alert = (await service.alerts()).find(
    (a) => a.code === "PROSPECTS_INACTIVE",
  );
  assert.equal(alert?.severity, "warning");
  assert.match(alert!.message, /sans nouvelle demande depuis plus de 12 mois/);
  await jobs.reconcile();
  assert.equal((await open()).length, 1, "raised for the superadmin");

  await db
    .update(prospects)
    .set({ archivedAt: testStart })
    .where(inArray(prospects.id, prospectIds));
  assert.equal(
    (await service.alerts()).some((a) => a.code === "PROSPECTS_INACTIVE"),
    false,
  );
  await jobs.reconcile();
  assert.equal(
    (await open()).length,
    0,
    "resolved once every prospect is archived",
  );
});

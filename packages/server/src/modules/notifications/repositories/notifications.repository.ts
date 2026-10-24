import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  emailEnabledKey,
  notificationSettingDefaults,
  notificationSettingKeys,
  reminderDaysKey,
  type NotificationItem,
  type NotificationKind,
  type NotificationListView,
  type NotificationSettings,
} from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { users } from "../../../db/schema/auth.js";
import { notificationEmailOutbox, notifications, operationalSettings } from "../../../db/schema/notifications.js";
import { AuditService } from "../../auth/services/audit.service.js";
import {
  digestDedupeKey,
  digestDue,
  digestMail,
  reminderDedupeKey,
  reminderMail,
  reminderWindow,
  type NotificationCandidate,
} from "../services/notification.policy.js";

type Db = typeof appDb;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Row = typeof notifications.$inferSelect;
export type OutboxRow = typeof notificationEmailOutbox.$inferSelect;
export type NotificationActor = { userId: string; requestId: string; ipAddress: string | null; userAgent: string | null };
export type ReconcileResult = { recipients: number; opened: number; refreshed: number; resolved: number; emailsQueued: number };

export function toItem(row: Row): NotificationItem {
  return {
    id: row.id, kind: row.kind as NotificationKind, severity: row.severity as NotificationItem["severity"], title: row.title, summary: row.summary,
    customerDisplayName: row.customerDisplayName, deepLink: row.deepLink, occurredAt: row.occurredAt?.toISOString() ?? null,
    firstDetectedAt: row.firstDetectedAt.toISOString(), lastDetectedAt: row.lastDetectedAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/** Stored overrides merged over registry defaults; unknown or malformed stored values are ignored (registry wins). */
export async function readSettings(db: Db | Tx): Promise<{ settings: NotificationSettings; updatedAt: Date | null }> {
  const settings = notificationSettingDefaults();
  let updatedAt: Date | null = null;
  for (const row of await db.select().from(operationalSettings).where(inArray(operationalSettings.key, notificationSettingKeys))) {
    const key = row.key as keyof NotificationSettings;
    if (typeof row.valueJson === typeof settings[key]) settings[key] = row.valueJson as NotificationSettings[typeof key];
    if (!updatedAt || row.updatedAt > updatedAt) updatedAt = row.updatedAt;
  }
  return { settings, updatedAt };
}

export class DrizzleNotificationsRepository {
  constructor(private readonly db: Db, private readonly options: { auditHashPepper: string; appBaseUrl: string }) {}

  private audit(tx: Tx, actor: NotificationActor, eventType: string, entityId: string | null, metadata: Record<string, string | number | boolean | null>) {
    return new AuditService(tx, this.options).record({ actorType: "user", actorUserId: actor.userId, requestId: actor.requestId, ipAddress: actor.ipAddress,
      userAgent: actor.userAgent, eventType, entityType: "notification", entityId, result: "success", metadata });
  }

  /** Active internal recipients (Gate 1 § Recipients): admin users only, active, not archived. Customers never receive these e-mails. */
  async recipients(tx: Db | Tx) {
    return tx.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active"), isNull(users.archivedAt)));
  }

  /**
   * One reconciliation (Gate 1 § Reconciliation behavior), in one transaction: open/refresh by stable dedupe, resolve vanished
   * conditions, queue reminder/digest e-mails with stable delivery keys. No SMTP here, no write to any business table.
   */
  async reconcile(candidates: NotificationCandidate[], now: Date): Promise<ReconcileResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('kfit:notifications:reconcile', 0))`);
      const { settings } = await readSettings(tx);
      const result: ReconcileResult = { recipients: 0, opened: 0, refreshed: 0, resolved: 0, emailsQueued: 0 };
      const recipients = await this.recipients(tx);
      result.recipients = recipients.length;
      const wanted = new Map(candidates.map((c) => [c.dedupeKey, c]));
      for (const recipient of recipients) {
        const open = await tx.select().from(notifications).where(and(eq(notifications.recipientUserId, recipient.id), isNull(notifications.resolvedAt))).for("update");
        const openByKey = new Map(open.map((row) => [row.dedupeKey, row]));
        const active: Row[] = [];
        for (const candidate of candidates) {
          const existing = openByKey.get(candidate.dedupeKey);
          const fields = { title: candidate.title, summary: candidate.summary, customerDisplayName: candidate.customerDisplayName, deepLink: candidate.deepLink,
            severity: candidate.severity, occurredAt: candidate.occurredAt, lastDetectedAt: now, updatedAt: now };
          if (existing) {
            const [row] = await tx.update(notifications).set(fields).where(eq(notifications.id, existing.id)).returning();
            active.push(row!); result.refreshed++;
          } else {
            const [row] = await tx.insert(notifications).values({ ...fields, recipientUserId: recipient.id, kind: candidate.kind, resourceType: candidate.resourceType,
              resourceId: candidate.resourceId, subscriptionId: candidate.subscriptionId, customerId: candidate.customerId, dedupeKey: candidate.dedupeKey,
              firstDetectedAt: now }).returning();
            active.push(row!); result.opened++;
          }
        }
        const vanished = open.filter((row) => !wanted.has(row.dedupeKey)).map((row) => row.id);
        if (vanished.length) {
          await tx.update(notifications).set({ resolvedAt: now, updatedAt: now }).where(inArray(notifications.id, vanished));
          result.resolved += vanished.length;
        }
        if (!settings["notifications.email.enabled"]) continue;
        const queue = async (values: Omit<typeof notificationEmailOutbox.$inferInsert, "recipientUserId" | "toEmail" | "status" | "nextAttemptAt">) => {
          const inserted = await tx.insert(notificationEmailOutbox).values({ ...values, recipientUserId: recipient.id, toEmail: recipient.email, status: "pending", nextAttemptAt: now })
            .onConflictDoNothing({ target: notificationEmailOutbox.dedupeKey }).returning({ id: notificationEmailOutbox.id });
          result.emailsQueued += inserted.length;
        };
        for (const row of active) {
          const kind = row.kind as NotificationKind;
          if (!settings[emailEnabledKey(kind)]) continue;
          const daysKey = reminderDaysKey(kind);
          const window = reminderWindow(now, row.firstDetectedAt, daysKey ? (settings[daysKey] as number) : null);
          const mail = reminderMail({ kind, title: row.title, summary: row.summary, customerDisplayName: row.customerDisplayName, deepLink: row.deepLink }, window, this.options.appBaseUrl);
          await queue({ notificationId: row.id, messageKind: "reminder", dedupeKey: reminderDedupeKey(row.id, window), subject: mail.subject, bodyText: mail.bodyText });
        }
        if (settings["notifications.daily_digest.enabled"] && active.length > 0 && digestDue(now, settings["notifications.daily_digest.hour"] as number)) {
          const counts: Partial<Record<NotificationKind, number>> = {};
          for (const row of active) counts[row.kind as NotificationKind] = (counts[row.kind as NotificationKind] ?? 0) + 1;
          const key = digestDedupeKey(recipient.id, now);
          const mail = digestMail(counts, key.slice(-10), this.options.appBaseUrl);
          await queue({ notificationId: null, messageKind: "digest", dedupeKey: key, subject: mail.subject, bodyText: mail.bodyText });
        }
      }
      return result;
    });
  }

  async list(userId: string, view: NotificationListView, cursor: { at: Date; id: string } | null, limit: number) {
    if (view === "active") {
      const rows = await this.db.select().from(notifications).where(and(eq(notifications.recipientUserId, userId), isNull(notifications.resolvedAt)))
        .orderBy(sql`${notifications.readAt} is not null`, desc(notifications.severity), desc(notifications.firstDetectedAt), asc(notifications.id)).limit(200);
      return { items: rows.map(toItem), nextCursor: null };
    }
    const where = [eq(notifications.recipientUserId, userId), isNotNull(notifications.resolvedAt)];
    if (cursor) where.push(or(lt(notifications.resolvedAt, cursor.at), and(eq(notifications.resolvedAt, cursor.at), lt(notifications.id, cursor.id)))!);
    const rows = await this.db.select().from(notifications).where(and(...where)).orderBy(desc(notifications.resolvedAt), desc(notifications.id)).limit(limit + 1);
    const page = rows.slice(0, limit), last = page.at(-1);
    return { items: page.map(toItem), nextCursor: rows.length > limit && last?.resolvedAt ? Buffer.from(`${last.resolvedAt.toISOString()}|${last.id}`).toString("base64url") : null };
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(notifications)
      .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.resolvedAt), isNull(notifications.readAt)));
    return row?.n ?? 0;
  }

  /** Read never resolves (Gate 1). Idempotent: a second read keeps the first readAt and writes no new audit. */
  async markRead(id: string, actor: NotificationActor, now: Date): Promise<NotificationItem | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.recipientUserId, actor.userId))).for("update");
      if (!row) return null;
      if (row.readAt) return toItem(row);
      const [updated] = await tx.update(notifications).set({ readAt: now, updatedAt: now }).where(eq(notifications.id, id)).returning();
      await this.audit(tx, actor, "notification.read", id, { kind: row.kind });
      return toItem(updated!);
    });
  }

  async markAllRead(actor: NotificationActor, now: Date): Promise<number> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.update(notifications).set({ readAt: now, updatedAt: now })
        .where(and(eq(notifications.recipientUserId, actor.userId), isNull(notifications.readAt), isNull(notifications.resolvedAt))).returning({ id: notifications.id });
      if (rows.length) await this.audit(tx, actor, "notification.read_all", null, { count: rows.length });
      return rows.length;
    });
  }

  async settings() { return readSettings(this.db); }

  async updateSettings(update: Partial<NotificationSettings>, actor: NotificationActor, now: Date) {
    return this.db.transaction(async (tx) => {
      const before = (await readSettings(tx)).settings;
      const changed: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(update)) {
        await tx.insert(operationalSettings).values({ key, valueJson: value, updatedAt: now, updatedByUserId: actor.userId })
          .onConflictDoUpdate({ target: operationalSettings.key, set: { valueJson: value, updatedAt: now, updatedByUserId: actor.userId } });
        if (before[key as keyof NotificationSettings] !== value) changed[key] = value as boolean | number;
      }
      if (Object.keys(changed).length) await this.audit(tx, actor, "notification.settings_updated", null, changed);
      return readSettings(tx);
    });
  }

  /* --------------------------- E-mail outbox --------------------------- */

  /** Claims due rows with FOR UPDATE SKIP LOCKED, so two workers never take the same row; the claim itself counts the attempt. */
  async claimDue(now: Date, limit: number): Promise<OutboxRow[]> {
    return this.db.transaction(async (tx) => {
      const due = await tx.select({ id: notificationEmailOutbox.id }).from(notificationEmailOutbox)
        .where(and(inArray(notificationEmailOutbox.status, ["pending", "failed"]), lte(notificationEmailOutbox.nextAttemptAt, now)))
        .orderBy(asc(notificationEmailOutbox.nextAttemptAt), asc(notificationEmailOutbox.id)).limit(limit).for("update", { skipLocked: true });
      if (!due.length) return [];
      return tx.update(notificationEmailOutbox).set({ status: "sending", attemptCount: sql`${notificationEmailOutbox.attemptCount} + 1`, lastAttemptAt: now, updatedAt: now })
        .where(inArray(notificationEmailOutbox.id, due.map((r) => r.id))).returning();
    });
  }

  async markSent(id: string, providerMessageId: string | null, now: Date) {
    await this.db.update(notificationEmailOutbox).set({ status: "sent", sentAt: now, providerMessageId, lastErrorCode: null, updatedAt: now })
      .where(and(eq(notificationEmailOutbox.id, id), eq(notificationEmailOutbox.status, "sending")));
  }

  async markFailed(id: string, errorCode: string, nextAttemptAt: Date | null, now: Date) {
    await this.db.update(notificationEmailOutbox).set(nextAttemptAt
      ? { status: "failed", nextAttemptAt, lastErrorCode: errorCode, updatedAt: now }
      : { status: "dead_letter", lastErrorCode: errorCode, updatedAt: now })
      .where(and(eq(notificationEmailOutbox.id, id), eq(notificationEmailOutbox.status, "sending")));
  }

  /**
   * A row left in « sending » (process stopped mid-send) may or may not have reached SMTP. It is never retried automatically
   * (a sent row is never resent): it goes to dead letter for a human decision.
   */
  async interruptStale(olderThan: Date, now: Date): Promise<number> {
    const rows = await this.db.update(notificationEmailOutbox).set({ status: "dead_letter", lastErrorCode: "SENDING_INTERRUPTED", updatedAt: now })
      .where(and(eq(notificationEmailOutbox.status, "sending"), lt(notificationEmailOutbox.lastAttemptAt, olderThan))).returning({ id: notificationEmailOutbox.id });
    return rows.length;
  }
}

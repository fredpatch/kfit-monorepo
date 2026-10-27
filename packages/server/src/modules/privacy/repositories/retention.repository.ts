import {
  and,
  eq,
  inArray,
  isNotNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import { auditEvents } from "../../../db/schema/auth.js";
import { externalAccessEvents } from "../../../db/schema/documents.js";
import {
  notificationEmailOutbox,
  notifications,
} from "../../../db/schema/notifications.js";
import { readSettings } from "../../notifications/repositories/notifications.repository.js";
import {
  INACTIVE_PROSPECTS_LIST_LIMIT,
  REDACTED,
  RETENTION_EVIDENCE_EVENT_TYPES,
  RETENTION_MAX_BATCHES,
  RETENTION_SECURITY_LOG_PREFIXES,
  retentionCutoffs,
  retentionSettingsOf,
  type RetentionCutoffs,
} from "../services/retention.policy.js";

type Db = typeof appDb;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type RetentionRunResult = {
  outboxRedacted: number;
  notificationsDeleted: number;
  auditEventsDeleted: number;
  accessEventsDeleted: number;
  /** R6: steps that threw this run (their committed batches stay; the run is then marked failed). */
  retentionStepsFailed: number;
};

export type RetentionCounts = {
  outboxToRedact: number;
  notificationsToDelete: number;
  auditEventsToDelete: number;
  accessEventsToDelete: number;
};

/*
 * R2: `sent`, or `dead_letter` (the only final failure: `failed` rows are claimed again by the delivery worker), older than
 * the cutoff and not yet redacted. A `dead_letter` row moved there by anonymization was never claimed (no last attempt), so
 * its age is the time it became final (`updated_at`).
 */
const outboxDue = (cutoff: Date): SQL =>
  and(
    sql`${notificationEmailOutbox.toEmail} <> ${REDACTED}`,
    or(
      and(
        eq(notificationEmailOutbox.status, "sent"),
        lt(notificationEmailOutbox.sentAt, cutoff),
      ),
      and(
        eq(notificationEmailOutbox.status, "dead_letter"),
        sql`coalesce(${notificationEmailOutbox.lastAttemptAt}, ${notificationEmailOutbox.updatedAt}) < ${cutoff}`,
      ),
    ),
  )!;
/** R3: resolved for longer than the cutoff; an open notification (resolved_at null) never matches. */
const notificationsDue = (cutoff: Date): SQL =>
  and(
    isNotNull(notifications.resolvedAt),
    lt(notifications.resolvedAt, cutoff),
  )!;
/** R4: `auth.*` / `ops.*` only, minus the evidence keep-list. */
const auditDue = (cutoff: Date): SQL =>
  and(
    or(
      ...RETENTION_SECURITY_LOG_PREFIXES.map(
        (prefix) => sql`${auditEvents.eventType} like ${`${prefix}%`}`,
      ),
    ),
    notInArray(auditEvents.eventType, [...RETENTION_EVIDENCE_EVENT_TYPES]),
    lt(auditEvents.createdAt, cutoff),
  )!;
const accessDue = (cutoff: Date): SQL =>
  lt(externalAccessEvents.createdAt, cutoff);

const count = async (query: Promise<Array<{ n: number }>>) =>
  (await query)[0]?.n ?? 0;

/** R6/R7: the same predicates for the daily steps and for « Simuler ». */
export async function retentionCounts(
  db: Db | Tx,
  cutoffs: RetentionCutoffs,
): Promise<RetentionCounts> {
  const n = sql<number>`count(*)::int`;
  return {
    outboxToRedact: await count(
      db
        .select({ n })
        .from(notificationEmailOutbox)
        .where(outboxDue(cutoffs.outbox)),
    ),
    notificationsToDelete: await count(
      db
        .select({ n })
        .from(notifications)
        .where(notificationsDue(cutoffs.notifications)),
    ),
    auditEventsToDelete: await count(
      db.select({ n }).from(auditEvents).where(auditDue(cutoffs.securityLogs)),
    ),
    accessEventsToDelete: await count(
      db
        .select({ n })
        .from(externalAccessEvents)
        .where(accessDue(cutoffs.securityLogs)),
    ),
  };
}

export async function readRetentionCutoffs(
  db: Db | Tx,
  now: Date,
): Promise<RetentionCutoffs & { prospectMonths: number }> {
  const settings = retentionSettingsOf((await readSettings(db)).settings);
  return {
    ...retentionCutoffs(now, settings),
    prospectMonths: settings.prospectInactiveMonths,
  };
}

export type InactiveProspects = {
  count: number;
  items: Array<{ requestId: string; reference: string; lastRequestAt: string }>;
};

/**
 * R5 (read-only): prospects never converted (no converted request, no customer), not archived, not anonymized, whose latest
 * request is older than the cutoff. Each item is that latest request's id, reference and date - no name, phone or e-mail.
 */
export async function inactiveProspects(
  db: Db | Tx,
  cutoff: Date,
): Promise<InactiveProspects> {
  const result = await db.execute<{
    total: number;
    id: string | null;
    reference: string | null;
    last_at: Date | string | null;
  }>(sql`
    with inactive as (
      select r.prospect_id, max(r.submitted_at) as last_at
      from service_requests r
      join prospects p on p.id = r.prospect_id
      where p.archived_at is null and p.anonymized_at is null
        and not exists (select 1 from service_requests c where c.prospect_id = p.id and c.converted_subscription_id is not null)
        and not exists (select 1 from customers cu where cu.prospect_id = p.id)
      group by r.prospect_id
      having max(r.submitted_at) < ${cutoff}
    ), listed as (
      select latest.id, latest.reference, i.last_at
      from inactive i
      join lateral (
        select s.id, s.reference from service_requests s where s.prospect_id = i.prospect_id
        order by s.submitted_at desc, s.id desc limit 1
      ) latest on true
      order by i.last_at asc, latest.id asc
      limit ${INACTIVE_PROSPECTS_LIST_LIMIT}
    )
    select (select count(*)::int from inactive) as total, listed.id, listed.reference, listed.last_at
    from (select 1) one left join listed on true
  `);
  const rows = result.rows;
  return {
    count: Number(rows[0]?.total ?? 0),
    items: rows
      .filter(
        (row) =>
          row.id !== null && row.reference !== null && row.last_at !== null,
      )
      .map((row) => ({
        requestId: row.id!,
        reference: row.reference!,
        lastRequestAt: new Date(row.last_at!).toISOString(),
      })),
  };
}

/** RET-01 T1-T3 inside the daily `privacy.purge` job. Every batch commits on its own: a rerun converges to the same state. */
export class DrizzleRetentionRepository {
  constructor(private readonly db: Db) {}

  /** T1: content replaced by « [purgé] »; status, dedupe key, attempts and dates untouched (the key keeps blocking a resend). */
  async redactOutboxBatch(
    cutoff: Date,
    now: Date,
    limit: number,
  ): Promise<number> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select({ id: notificationEmailOutbox.id })
        .from(notificationEmailOutbox)
        .where(outboxDue(cutoff))
        .orderBy(notificationEmailOutbox.id)
        .limit(limit)
        .for("update", { skipLocked: true });
      if (!due.length) return 0;
      const rows = await tx
        .update(notificationEmailOutbox)
        .set({
          toEmail: REDACTED,
          subject: REDACTED,
          bodyText: REDACTED,
          bodyHtml: sql`case when ${notificationEmailOutbox.bodyHtml} is null then null else ${REDACTED} end`,
          updatedAt: now,
        })
        .where(
          inArray(
            notificationEmailOutbox.id,
            due.map((row) => row.id),
          ),
        )
        .returning({ id: notificationEmailOutbox.id });
      return rows.length;
    });
  }

  /** T2: one transaction per batch - unlink the outbox rows (FK restrict), then delete the notifications. */
  async deleteNotificationsBatch(cutoff: Date, limit: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(notificationsDue(cutoff))
        .orderBy(notifications.id)
        .limit(limit)
        .for("update", { skipLocked: true });
      if (!due.length) return 0;
      const ids = due.map((row) => row.id);
      await tx
        .update(notificationEmailOutbox)
        .set({ notificationId: null })
        .where(inArray(notificationEmailOutbox.notificationId, ids));
      const rows = await tx
        .delete(notifications)
        .where(inArray(notifications.id, ids))
        .returning({ id: notifications.id });
      return rows.length;
    });
  }

  /** T3: security audit events (keep-list excluded). */
  async deleteAuditBatch(cutoff: Date, limit: number): Promise<number> {
    const due = this.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(auditDue(cutoff))
      .limit(limit);
    const rows = await this.db
      .delete(auditEvents)
      .where(inArray(auditEvents.id, due))
      .returning({ id: auditEvents.id });
    return rows.length;
  }

  /** T3: public-link access events (they point to their token; nothing points to them). */
  async deleteAccessBatch(cutoff: Date, limit: number): Promise<number> {
    const due = this.db
      .select({ id: externalAccessEvents.id })
      .from(externalAccessEvents)
      .where(accessDue(cutoff))
      .limit(limit);
    const rows = await this.db
      .delete(externalAccessEvents)
      .where(inArray(externalAccessEvents.id, due))
      .returning({ id: externalAccessEvents.id });
    return rows.length;
  }

  /**
   * R6: T1 → T2 → T3 with the settings read at run time, each step looping batches until a short batch or
   * RETENTION_MAX_BATCHES. A step that throws is counted and the next steps still run.
   */
  async run(now: Date, batchSize: number): Promise<RetentionRunResult> {
    const cutoffs = await readRetentionCutoffs(this.db, now);
    const result: RetentionRunResult = {
      outboxRedacted: 0,
      notificationsDeleted: 0,
      auditEventsDeleted: 0,
      accessEventsDeleted: 0,
      retentionStepsFailed: 0,
    };
    const steps: Array<
      [
        keyof Omit<RetentionRunResult, "retentionStepsFailed">,
        () => Promise<number>,
      ]
    > = [
      [
        "outboxRedacted",
        () => this.redactOutboxBatch(cutoffs.outbox, now, batchSize),
      ],
      [
        "notificationsDeleted",
        () => this.deleteNotificationsBatch(cutoffs.notifications, batchSize),
      ],
      [
        "auditEventsDeleted",
        () => this.deleteAuditBatch(cutoffs.securityLogs, batchSize),
      ],
      [
        "accessEventsDeleted",
        () => this.deleteAccessBatch(cutoffs.securityLogs, batchSize),
      ],
    ];
    for (const [key, batch] of steps) {
      try {
        for (let i = 0; i < RETENTION_MAX_BATCHES; i += 1) {
          const done = await batch();
          result[key] += done;
          if (done < batchSize) break;
        }
      } catch {
        result.retentionStepsFailed += 1;
      }
    }
    return result;
  }
}

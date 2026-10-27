import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { businessDateKey, type SupervisionBackup, type SupervisionRestoreCheck, type SupervisionSecurityResponse, type SupervisionSecuritySeries } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { auditEvents } from "../../../db/schema/auth.js";
import { documents, externalAccessEvents } from "../../../db/schema/documents.js";
import { notifications } from "../../../db/schema/notifications.js";
import { anonymizationEvents, retentionHolds, scheduledJobRuns, securityEventCounters } from "../../../db/schema/operations.js";
import { OPS_JOB_KEYS } from "../../../ops/run-records.js";
import { REQUEST_ENCODING_UNSUPPORTED } from "../../../security/reject-encoded-request-bodies.js";
import { AuditService } from "../../auth/services/audit.service.js";
import { PURGE_JOB_KEY } from "../../privacy/services/privacy.policy.js";
import { FAILURE_RATE_WINDOW_DAYS, JOB_FAILING_RECENT_RUNS, type JobRunFacts } from "../services/supervision.policy.js";

type Db = typeof appDb;
type RunRow = typeof scheduledJobRuns.$inferSelect;
export type SupervisionActor = { userId: string; requestId: string; ipAddress: string | null; userAgent: string | null };

const DAY_MS = 86_400_000;
const BUSINESS_ZONE = "Africa/Libreville";

/** O8 (security series): audit event types counted per Libreville day. */
export const SECURITY_AUDIT_EVENTS = {
  loginRejected: "auth.login.rejected",
  otpFailed: "auth.login.otp_failed",
  otpLocked: "auth.login.otp_locked",
  bootstrapRejected: "auth.bootstrap.rejected",
} as const;

/** O8: external_access_events.result values meaning « invalid or expired public link » (grep of every insert, 2026-10-27). */
export const PUBLIC_LINK_REFUSAL_RESULTS = [
  "APPOINTMENT_TOKEN_INVALID", "APPOINTMENT_TOKEN_EXPIRED",
  "CONSENT_LINK_INVALID", "CONSENT_LINK_EXPIRED",
  "DOCUMENT_LINK_INVALID", "DOCUMENT_LINK_EXPIRED",
  "PAYMENT_PROOF_LINK_INVALID", "PAYMENT_PROOF_LINK_EXPIRED",
  "QUESTIONNAIRE_LINK_INVALID", "QUESTIONNAIRE_LINK_EXPIRED",
  "QUOTE_LINK_INVALID", "QUOTE_LINK_EXPIRED",
  "RECEIPT_LINK_INVALID", "RECEIPT_LINK_EXPIRED",
] as const;

const RATE_LIMITED_PREFIX = "RATE_LIMITED:";
const numberOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const result = (row: RunRow | undefined) => (row?.resultJson ?? {}) as Record<string, unknown>;
const libreville = (column: unknown) => sql<string>`to_char(${column} at time zone ${BUSINESS_ZONE}, 'YYYY-MM-DD')`;

const emptySeries = (): SupervisionSecuritySeries => ({ loginRejected: 0, otpFailed: 0, otpLocked: 0, bootstrapRejected: 0, rateLimited: {}, encodingRejected: 0, publicLinkInvalid: 0 });

/** OPS-01: read-only facts for the Supervision page; the only write is its own audit row. */
export class DrizzleSupervisionRepository {
  constructor(private readonly db: Db, private readonly options: { auditHashPepper: string }) {}

  async jobFacts(jobKey: string, now: Date): Promise<JobRunFacts> {
    const [last] = await this.db.select().from(scheduledJobRuns).where(eq(scheduledJobRuns.jobKey, jobKey)).orderBy(desc(scheduledJobRuns.startedAt)).limit(1);
    const [succeeded] = await this.db.select({ at: sql<Date | null>`max(coalesce(${scheduledJobRuns.finishedAt}, ${scheduledJobRuns.startedAt}))` }).from(scheduledJobRuns)
      .where(and(eq(scheduledJobRuns.jobKey, jobKey), eq(scheduledJobRuns.status, "succeeded")));
    const [window] = await this.db.select({ total: sql<number>`count(*)::int`, failed: sql<number>`(count(*) filter (where ${scheduledJobRuns.status} = 'failed'))::int` })
      .from(scheduledJobRuns).where(and(eq(scheduledJobRuns.jobKey, jobKey), gte(scheduledJobRuns.startedAt, new Date(now.getTime() - FAILURE_RATE_WINDOW_DAYS * DAY_MS))));
    const recent = await this.db.select({ status: scheduledJobRuns.status }).from(scheduledJobRuns)
      .where(and(eq(scheduledJobRuns.jobKey, jobKey), inArray(scheduledJobRuns.status, ["succeeded", "failed"]))).orderBy(desc(scheduledJobRuns.startedAt)).limit(JOB_FAILING_RECENT_RUNS);
    return {
      lastRun: last ? { status: last.status as "running" | "succeeded" | "failed", startedAt: last.startedAt, finishedAt: last.finishedAt, attempt: last.attempt, errorCode: last.errorCode } : null,
      lastSucceededAt: succeeded?.at ? new Date(succeeded.at) : null,
      runs30d: window?.total ?? 0,
      failed30d: window?.failed ?? 0,
      recentFinished: recent.map((row) => row.status as "succeeded" | "failed"),
    };
  }

  private async latest(jobKey: string, status?: "succeeded" | "failed") {
    const [row] = await this.db.select().from(scheduledJobRuns)
      .where(and(eq(scheduledJobRuns.jobKey, jobKey), ...(status ? [eq(scheduledJobRuns.status, status)] : []))).orderBy(desc(scheduledJobRuns.startedAt)).limit(1);
    return row;
  }

  /** O5. A successful backup has already copied and verified its secondary copy (backup.ts fails with SECONDARY_COPY_FAILED otherwise). */
  async backup(now: Date): Promise<SupervisionBackup> {
    const succeeded = await this.latest(OPS_JOB_KEYS.backup, "succeeded");
    const failed = await this.latest(OPS_JOB_KEYS.backup, "failed");
    const at = succeeded ? succeeded.finishedAt ?? succeeded.startedAt : null;
    const values = result(succeeded);
    const kept = numberOf(values.keptPrimary), deleted = numberOf(values.deletedPrimary);
    return {
      lastSucceededAt: at?.toISOString() ?? null,
      ageHours: at ? Math.round(((now.getTime() - at.getTime()) / 3_600_000) * 10) / 10 : null,
      bytes: numberOf(values.bundleBytes),
      durationMs: numberOf(values.durationMs),
      secondaryVerified: Boolean(succeeded),
      rotation: kept === null || deleted === null ? null : { kept, deleted },
      lastFailed: failed ? { at: (failed.finishedAt ?? failed.startedAt).toISOString(), errorCode: failed.errorCode } : null,
    };
  }

  /** O6. */
  async restoreCheck(): Promise<SupervisionRestoreCheck> {
    const row = await this.latest(OPS_JOB_KEYS.drill);
    if (!row) return null;
    const values = result(row);
    return {
      at: (row.finishedAt ?? row.startedAt).toISOString(), status: row.status as "running" | "succeeded" | "failed",
      tablesMatched: numberOf(values.tables), filesMatched: numberOf(values.files), replayEvents: numberOf(values.replayEvents), errorCode: row.errorCode,
    };
  }

  /** O7, without the journal (checked on disk by the service). */
  async privacyFacts(now: Date) {
    const purge = await this.latest(PURGE_JOB_KEY);
    const [replay] = await this.db.select({ at: auditEvents.createdAt, metadata: auditEvents.metadataJson }).from(auditEvents)
      .where(eq(auditEvents.eventType, "privacy.replay_run")).orderBy(desc(auditEvents.createdAt)).limit(1);
    const [holds] = await this.db.select({ n: sql<number>`count(*)::int` }).from(retentionHolds).where(eq(retentionHolds.status, "active"));
    const [due] = await this.db.select({ n: sql<number>`count(*)::int` }).from(documents)
      .where(and(eq(documents.status, "pending_purge"), lte(documents.purgeAfter, new Date(now.getTime() + 7 * DAY_MS))));
    const [anonymized] = await this.db.select({ n: sql<number>`count(*)::int` }).from(anonymizationEvents).where(eq(anonymizationEvents.status, "executed"));
    return {
      lastPurge: purge ? { at: (purge.finishedAt ?? purge.startedAt).toISOString(), status: purge.status as "running" | "succeeded" | "failed", filesDeleted: numberOf(result(purge).purged) } : null,
      lastReplay: replay ? { at: replay.at.toISOString(), events: numberOf((replay.metadata as Record<string, unknown> | null)?.events) } : null,
      activeHolds: holds?.n ?? 0,
      purgesDue7d: due?.n ?? 0,
      anonymizedTotal: anonymized?.n ?? 0,
    };
  }

  /** O2: one entry per Libreville day, oldest first, zero-filled. Counts only. */
  async securitySeries(days: number, now: Date): Promise<SupervisionSecurityResponse> {
    const dates = Array.from({ length: days }, (_, index) => businessDateKey(new Date(now.getTime() - (days - 1 - index) * DAY_MS)));
    const byDate = new Map(dates.map((date) => [date, emptySeries()]));
    const since = new Date(now.getTime() - (days + 1) * DAY_MS);

    const eventToSeries = new Map<string, keyof typeof SECURITY_AUDIT_EVENTS>(Object.entries(SECURITY_AUDIT_EVENTS).map(([key, type]) => [type, key as keyof typeof SECURITY_AUDIT_EVENTS]));
    const audit = await this.db.select({ date: libreville(auditEvents.createdAt), type: auditEvents.eventType, n: sql<number>`count(*)::int` }).from(auditEvents)
      .where(and(inArray(auditEvents.eventType, Object.values(SECURITY_AUDIT_EVENTS)), gte(auditEvents.createdAt, since))).groupBy(sql`1`, auditEvents.eventType);
    for (const row of audit) {
      const series = byDate.get(row.date), key = eventToSeries.get(row.type);
      if (series && key) series[key] += row.n;
    }

    const counters = await this.db.select({ date: sql<string>`to_char(${securityEventCounters.day}, 'YYYY-MM-DD')`, code: securityEventCounters.code, n: securityEventCounters.count })
      .from(securityEventCounters).where(gte(securityEventCounters.day, dates[0]!));
    for (const row of counters) {
      const series = byDate.get(row.date);
      if (!series) continue;
      if (row.code === REQUEST_ENCODING_UNSUPPORTED) series.encodingRejected += row.n;
      else if (row.code.startsWith(RATE_LIMITED_PREFIX)) {
        const scope = row.code.slice(RATE_LIMITED_PREFIX.length);
        series.rateLimited[scope] = (series.rateLimited[scope] ?? 0) + row.n;
      }
    }

    const links = await this.db.select({ date: libreville(externalAccessEvents.createdAt), n: sql<number>`count(*)::int` }).from(externalAccessEvents)
      .where(and(inArray(externalAccessEvents.result, [...PUBLIC_LINK_REFUSAL_RESULTS]), gte(externalAccessEvents.createdAt, since))).groupBy(sql`1`);
    for (const row of links) {
      const series = byDate.get(row.date);
      if (series) series.publicLinkInvalid += row.n;
    }
    return { days: dates.map((date) => ({ date, series: byDate.get(date)! })) };
  }

  /** O9 menu dot: the admin's own open supervision notifications (dedupe keys only). */
  async openSupervisionKeys(userId: string): Promise<string[]> {
    const rows = await this.db.select({ key: notifications.dedupeKey }).from(notifications)
      .where(and(eq(notifications.recipientUserId, userId), eq(notifications.kind, "supervision_alert"), isNull(notifications.resolvedAt)));
    return rows.map((row) => row.key);
  }

  async audit(actor: SupervisionActor, eventType: string, metadata: Record<string, string | number | boolean | null>) {
    await new AuditService(this.db, this.options).record({
      actorType: "user", actorUserId: actor.userId, requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
      eventType, entityType: "supervision", entityId: null, result: "success", metadata,
    });
  }
}

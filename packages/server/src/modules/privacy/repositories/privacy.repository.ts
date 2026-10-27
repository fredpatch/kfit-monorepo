import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  privacyPurgeDelayDaysKey,
  type PrivacySubjectType,
  type UnarchiveReason,
  type RetentionHoldItem,
  type RetentionHoldScopeType,
  type RetentionHoldType,
} from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import {
  documents,
  documentVersions,
  secureAccessTokens,
} from "../../../db/schema/documents.js";
import { appointments } from "../../../db/schema/coaching.js";
import {
  installments,
  paymentPlans,
  paymentProofs,
  quotes,
  quoteVersions,
  receipts,
} from "../../../db/schema/finance.js";
import {
  anonymizationEvents,
  retentionHolds,
} from "../../../db/schema/operations.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { AuditService } from "../../auth/services/audit.service.js";
import { readSettings } from "../../notifications/repositories/notifications.repository.js";
import {
  readRetentionCutoffs,
  retentionCounts,
  type RetentionCounts,
} from "./retention.repository.js";
import {
  ANONYMIZATION_PLAN_VERSION,
  ANONYMIZATION_REASON,
  OPEN_OUTBOX_STATUSES,
  OUTBOX_ANONYMIZED_ERROR_CODE,
  REDACTED_TEXT,
  anonymizeDecision,
  customerArchiveRefusal,
  planFor,
  prospectArchiveRefusal,
  pseudonymFor,
  purgeAfter,
  whatsappPlaceholderFor,
  type ColumnAction,
  type PlanLink,
} from "../services/privacy.policy.js";

type Db = typeof appDb;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type PrivacyActor = {
  userId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};
export type LinkedSubject = {
  subjectType: PrivacySubjectType;
  subjectId: string;
};
/** What the journal and replay need; IDs only (D11). */
export type ExecutedPrivacyEvent = {
  eventId: string;
  subjectType: PrivacySubjectType;
  subjectId: string;
  executedAt: Date;
  planVersion: number;
  linkedSubjects: LinkedSubject[];
};
export type PlanTouch = { table: string; columns: string[]; rows: number };

export type ArchiveResult =
  | { ok: true; archivedAt: Date; tokensRevoked: number }
  | {
      ok: false;
      error:
        | "PRIVACY_SUBJECT_NOT_FOUND"
        | "PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION"
        | "PRIVACY_SUBJECT_HAS_OPEN_REQUEST";
    };
export type UnarchiveResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "PRIVACY_SUBJECT_NOT_FOUND"
        | "PRIVACY_SUBJECT_NOT_ARCHIVED"
        | "PRIVACY_SUBJECT_ANONYMIZED";
    };
export type AnonymizeResult =
  | { ok: true; event: ExecutedPrivacyEvent; alreadyAnonymized: boolean }
  | {
      ok: false;
      error:
        | "PRIVACY_SUBJECT_NOT_FOUND"
        | "PRIVACY_SUBJECT_NOT_ARCHIVED"
        | "PRIVACY_CONFIRMATION_MISMATCH"
        | "PRIVACY_RETENTION_HOLD_ACTIVE";
    };
export type HoldResult =
  | { ok: true; hold: RetentionHoldItem }
  | {
      ok: false;
      error:
        | "PRIVACY_SUBJECT_NOT_FOUND"
        | "PRIVACY_HOLD_ALREADY_ACTIVE"
        | "PRIVACY_HOLD_NOT_FOUND"
        | "PRIVACY_HOLD_ALREADY_RELEASED";
    };
export type PurgeBatchResult = {
  scanned: number;
  purged: number;
  skippedHold: number;
  failed: number;
};
/** Deletes one stored object; must be idempotent (missing file = success). */
export type RemoveStoredObject = (storageKey: string) => Promise<void>;

/** Subject lock shared by archive, anonymize and hold writers: they serialize per subject. */
const lockSubject = (tx: Tx, type: PrivacySubjectType, id: string) =>
  tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`privacy-subject:${type}:${id}`}, 0))`,
  );
/** Ids are database UUIDs, passed as one array parameter. */
const uuidArray = (ids: readonly string[]) =>
  sql`${`{${ids.join(",")}}`}::uuid[]`;

function holdItem(row: typeof retentionHolds.$inferSelect): RetentionHoldItem {
  return {
    id: row.id,
    scopeType: row.scopeType as RetentionHoldScopeType,
    scopeId: row.scopeId,
    holdType: row.holdType as RetentionHoldType,
    reason: row.reason,
    status: row.status as RetentionHoldItem["status"],
    startedAt: row.startedAt.toISOString(),
    releasedAt: row.releasedAt?.toISOString() ?? null,
  };
}

type Scope = {
  customerId: string | null;
  prospectId: string | null;
  subscriptionIds: string[];
  requestIds: string[];
};

export class DrizzlePrivacyRepository {
  constructor(
    private readonly db: Db,
    private readonly options: { auditHashPepper: string },
  ) {}

  private audit(
    tx: Tx,
    actor: PrivacyActor | null,
    eventType: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, string | number | boolean | null>,
  ) {
    return new AuditService(tx, this.options).record({
      actorType: actor ? "user" : "system",
      actorUserId: actor?.userId ?? null,
      requestId: actor?.requestId ?? null,
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
      eventType,
      entityType,
      entityId,
      result: "success",
      metadata,
    });
  }

  /* ------------------------------ Archive (D1) ------------------------------ */

  async archive(
    subjectType: PrivacySubjectType,
    subjectId: string,
    actor: PrivacyActor,
    now: Date,
  ): Promise<ArchiveResult> {
    return this.db.transaction(async (tx) => {
      await lockSubject(tx, subjectType, subjectId);
      const table = subjectType === "customer" ? customers : prospects;
      const [row] = await tx
        .select({ archivedAt: table.archivedAt })
        .from(table)
        .where(eq(table.id, subjectId))
        .for("update");
      if (row?.archivedAt) {
        // ARCH-01 D5: re-archiving stays idempotent and closes links left open by an archive made before ARCH-01.
        const tokensRevoked = await this.revokeArchivedSubjectLinks(
          tx,
          subjectType,
          subjectId,
          now,
        );
        if (tokensRevoked)
          await this.audit(
            tx,
            actor,
            "privacy.subject_links_revoked",
            subjectType,
            subjectId,
            { subjectType, tokensRevoked },
          );
        return { ok: true, archivedAt: row.archivedAt, tokensRevoked };
      }
      const refusal =
        subjectType === "customer"
          ? customerArchiveRefusal(
              { exists: Boolean(row) },
              (
                await tx
                  .select({ status: subscriptions.status })
                  .from(subscriptions)
                  .where(eq(subscriptions.customerId, subjectId))
              ).map((s) => s.status),
            )
          : prospectArchiveRefusal(
              { exists: Boolean(row) },
              (
                await tx
                  .select({ status: serviceRequests.status })
                  .from(serviceRequests)
                  .where(eq(serviceRequests.prospectId, subjectId))
              ).map((r) => r.status),
            );
      if (refusal === "not_found")
        return { ok: false, error: "PRIVACY_SUBJECT_NOT_FOUND" };
      if (refusal === "has_active_subscription")
        return { ok: false, error: "PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION" };
      if (refusal === "has_open_request")
        return { ok: false, error: "PRIVACY_SUBJECT_HAS_OPEN_REQUEST" };
      await tx
        .update(table)
        .set({ archivedAt: now })
        .where(eq(table.id, subjectId));
      const tokensRevoked = await this.revokeArchivedSubjectLinks(
        tx,
        subjectType,
        subjectId,
        now,
      );
      await this.audit(
        tx,
        actor,
        "privacy.subject_archived",
        subjectType,
        subjectId,
        { subjectType, tokensRevoked },
      );
      return { ok: true, archivedAt: now, tokensRevoked };
    });
  }

  /**
   * ARCH-01 D5: every live public link of the archived subject. A customer covers its subscriptions, documents, proofs, quotes
   * and receipts (not the requests of its source prospect); a prospect covers its requests. Links stay revoked after unarchive.
   */
  private async revokeArchivedSubjectLinks(
    tx: Tx,
    subjectType: PrivacySubjectType,
    subjectId: string,
    now: Date,
  ): Promise<number> {
    const scope = await this.scopeOf(
      tx,
      subjectType,
      subjectId,
      subjectType === "prospect" ? subjectId : null,
    );
    const docs = await this.documentIdsOf(tx, scope);
    return this.revokeLinks(
      tx,
      await this.tokenResourceIds(tx, scope, docs.all),
      now,
    );
  }

  private async revokeLinks(
    tx: Tx,
    resourceIds: string[],
    now: Date,
  ): Promise<number> {
    if (!resourceIds.length) return 0;
    const revoked = await tx
      .update(secureAccessTokens)
      .set({ revokedAt: now })
      .where(
        and(
          isNull(secureAccessTokens.revokedAt),
          inArray(secureAccessTokens.resourceId, resourceIds),
        ),
      )
      .returning({ id: secureAccessTokens.id });
    return revoked.length;
  }

  /** ARCH-01 D6: same locks as archive. Anonymization is irreversible; active holds do not block. Only the reason code is audited. */
  async unarchive(
    subjectType: PrivacySubjectType,
    subjectId: string,
    reason: UnarchiveReason,
    actor: PrivacyActor,
  ): Promise<UnarchiveResult> {
    return this.db.transaction(async (tx) => {
      await lockSubject(tx, subjectType, subjectId);
      const table = subjectType === "customer" ? customers : prospects;
      const [row] = await tx
        .select({
          archivedAt: table.archivedAt,
          anonymizedAt: table.anonymizedAt,
        })
        .from(table)
        .where(eq(table.id, subjectId))
        .for("update");
      if (!row) return { ok: false, error: "PRIVACY_SUBJECT_NOT_FOUND" };
      if (row.anonymizedAt)
        return { ok: false, error: "PRIVACY_SUBJECT_ANONYMIZED" };
      if (!row.archivedAt)
        return { ok: false, error: "PRIVACY_SUBJECT_NOT_ARCHIVED" };
      await tx
        .update(table)
        .set({ archivedAt: null })
        .where(eq(table.id, subjectId));
      await this.audit(
        tx,
        actor,
        "privacy.subject_unarchived",
        subjectType,
        subjectId,
        { subjectType, reason },
      );
      return { ok: true };
    });
  }

  /* --------------------------- Anonymize (rules 2-4) --------------------------- */

  private async scopeOf(
    tx: Tx,
    subjectType: PrivacySubjectType,
    subjectId: string,
    prospectId: string | null,
  ): Promise<Scope> {
    const subscriptionIds =
      subjectType === "customer"
        ? (
            await tx
              .select({ id: subscriptions.id })
              .from(subscriptions)
              .where(eq(subscriptions.customerId, subjectId))
          ).map((r) => r.id)
        : [];
    const requestIds = prospectId
      ? (
          await tx
            .select({ id: serviceRequests.id })
            .from(serviceRequests)
            .where(eq(serviceRequests.prospectId, prospectId))
        ).map((r) => r.id)
      : [];
    return {
      customerId: subjectType === "customer" ? subjectId : null,
      prospectId,
      subscriptionIds,
      requestIds,
    };
  }

  /** Every document of the subject: its subscriptions' private files plus its proofs, receipts and quotes. */
  private async documentIdsOf(
    tx: Tx,
    scope: Scope,
  ): Promise<{ owned: string[]; all: string[] }> {
    if (!scope.customerId) return { owned: [], all: [] };
    const owned = scope.subscriptionIds.length
      ? (
          await tx
            .select({ id: documents.id })
            .from(documents)
            .where(
              and(
                eq(documents.ownerType, "subscription"),
                inArray(documents.ownerId, scope.subscriptionIds),
              ),
            )
        ).map((r) => r.id)
      : [];
    const proofDocs = (
      await tx
        .select({ id: paymentProofs.documentId })
        .from(paymentProofs)
        .where(eq(paymentProofs.customerId, scope.customerId))
    ).map((r) => r.id);
    const receiptDocs = (
      await tx
        .select({ id: receipts.pdfDocumentId })
        .from(receipts)
        .where(eq(receipts.customerId, scope.customerId))
    ).map((r) => r.id);
    const quoteDocs = (
      await tx
        .select({ id: quoteVersions.pdfDocumentId })
        .from(quoteVersions)
        .innerJoin(quotes, eq(quotes.id, quoteVersions.quoteId))
        .where(eq(quotes.customerId, scope.customerId))
    ).map((r) => r.id);
    return {
      owned,
      all: [
        ...new Set(
          [...owned, ...proofDocs, ...receiptDocs, ...quoteDocs].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ],
    };
  }

  private async activeHoldCount(
    tx: Tx,
    scope: Scope,
    documentIds: string[],
  ): Promise<number> {
    const scopes: SQL[] = [];
    if (scope.customerId)
      scopes.push(
        and(
          eq(retentionHolds.scopeType, "customer"),
          eq(retentionHolds.scopeId, scope.customerId),
        )!,
      );
    if (scope.prospectId)
      scopes.push(
        and(
          eq(retentionHolds.scopeType, "prospect"),
          eq(retentionHolds.scopeId, scope.prospectId),
        )!,
      );
    if (documentIds.length)
      scopes.push(
        and(
          eq(retentionHolds.scopeType, "document"),
          inArray(retentionHolds.scopeId, documentIds),
        )!,
      );
    if (!scopes.length) return 0;
    const rows = await tx
      .select({ id: retentionHolds.id })
      .from(retentionHolds)
      .where(and(eq(retentionHolds.status, "active"), or(...scopes)));
    return rows.length;
  }

  private linkCondition(link: PlanLink, table: string, scope: Scope): SQL {
    const subs = uuidArray(scope.subscriptionIds),
      reqs = uuidArray(scope.requestIds);
    const notification = sql`(customer_id = ${scope.customerId} or subscription_id = any(${subs}) or (resource_type = 'request' and resource_id = any(${reqs})))`;
    switch (link) {
      case "subject":
        return sql`id = ${scope.customerId}`;
      case "prospect":
        return table === "prospects"
          ? sql`id = ${scope.prospectId}`
          : sql`prospect_id = ${scope.prospectId}`;
      case "request":
        return sql`request_id = any(${reqs})`;
      case "subscription":
        return sql`subscription_id = any(${subs})`;
      case "subscription_component":
        return sql`subscription_component_id in (select id from subscription_components where subscription_id = any(${subs}))`;
      case "submission":
        return sql`submission_id in (select id from questionnaire_submissions where subscription_id = any(${subs}))`;
      case "customer":
        return sql`customer_id = ${scope.customerId}`;
      case "notification":
        return notification;
      case "outbox":
        return sql`notification_id in (select id from notifications where ${notification})`;
    }
  }

  private columnValue(
    action: ColumnAction,
    column: string,
    ownerId: string,
    now: Date,
  ): SQL {
    switch (action) {
      case "pseudonym":
        return sql`${pseudonymFor(ownerId)}`;
      case "whatsapp_placeholder":
        return sql`${whatsappPlaceholderFor(ownerId)}`;
      case "null":
        return sql`null`;
      case "redacted_text":
        return sql`${REDACTED_TEXT}`;
      case "empty_json":
        return sql`case when jsonb_typeof(${sql.raw(`"${column}"`)}) = 'array' then '[]'::jsonb else '{}'::jsonb end`;
      case "now":
        return sql`${now}`;
    }
  }

  /** Applies the declarative plan; identifiers come only from ANONYMIZATION_PLAN constants, values are parameters. */
  private async applyPlan(
    tx: Tx,
    subjectType: PrivacySubjectType,
    subjectId: string,
    scope: Scope,
    now: Date,
  ): Promise<PlanTouch[]> {
    const touched: PlanTouch[] = [];
    for (const step of planFor(subjectType)) {
      if (step.link === "prospect" && !scope.prospectId) continue;
      const ownerId =
        step.table === "prospects" ? scope.prospectId! : subjectId;
      const assignments = sql.join(
        Object.entries(step.columns).map(
          ([column, action]) =>
            sql`${sql.raw(`"${column}"`)} = ${this.columnValue(action, column, ownerId, now)}`,
        ),
        sql`, `,
      );
      const result = await tx.execute(
        sql`update ${sql.raw(`"${step.table}"`)} set ${assignments} where ${this.linkCondition(step.link, step.table, scope)}`,
      );
      touched.push({
        table: step.table,
        columns: Object.keys(step.columns),
        rows: result.rowCount ?? 0,
      });
    }
    return touched;
  }

  /** Every resource id a secure link of this subject can point at (subscription, request, document, version, appointment, installment, proof, quote, receipt). */
  private async tokenResourceIds(
    tx: Tx,
    scope: Scope,
    documentIds: string[],
  ): Promise<string[]> {
    const ids = new Set<string>([
      ...scope.subscriptionIds,
      ...scope.requestIds,
      ...documentIds,
    ]);
    const add = (rows: { id: string | null }[]) => {
      for (const row of rows) if (row.id) ids.add(row.id);
    };
    if (documentIds.length)
      add(
        await tx
          .select({ id: documentVersions.id })
          .from(documentVersions)
          .where(inArray(documentVersions.documentId, documentIds)),
      );
    if (scope.subscriptionIds.length) {
      add(
        await tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(inArray(appointments.subscriptionId, scope.subscriptionIds)),
      );
      add(
        await tx
          .select({ id: installments.id })
          .from(installments)
          .innerJoin(
            paymentPlans,
            eq(paymentPlans.id, installments.paymentPlanId),
          )
          .where(inArray(paymentPlans.subscriptionId, scope.subscriptionIds)),
      );
    }
    if (scope.customerId) {
      add(
        await tx
          .select({ id: paymentProofs.id })
          .from(paymentProofs)
          .where(eq(paymentProofs.customerId, scope.customerId)),
      );
      add(
        await tx
          .select({ id: quotes.id })
          .from(quotes)
          .where(eq(quotes.customerId, scope.customerId)),
      );
      add(
        await tx
          .select({ id: quoteVersions.id })
          .from(quoteVersions)
          .innerJoin(quotes, eq(quotes.id, quoteVersions.quoteId))
          .where(eq(quotes.customerId, scope.customerId)),
      );
      add(
        await tx
          .select({ id: receipts.id })
          .from(receipts)
          .where(eq(receipts.customerId, scope.customerId)),
      );
    }
    return [...ids];
  }

  private async existingEvent(
    tx: Tx | Db,
    subjectType: PrivacySubjectType,
    subjectId: string,
  ): Promise<ExecutedPrivacyEvent | null> {
    const [row] = await tx
      .select()
      .from(anonymizationEvents)
      .where(
        and(
          eq(anonymizationEvents.subjectType, subjectType),
          eq(anonymizationEvents.subjectId, subjectId),
          eq(anonymizationEvents.status, "executed"),
        ),
      );
    return row ? toExecutedEvent(row) : null;
  }

  /**
   * One transaction, Gate 1 lock order: subject advisory lock → subject row → source prospect lock and row (D8) → hold check →
   * column plan → documents to pending_purge → secure links revoked → anonymization_events + audit. Any failure rolls back all.
   */
  async anonymize(
    subjectType: PrivacySubjectType,
    subjectId: string,
    confirmName: string,
    actor: PrivacyActor,
    now: Date,
  ): Promise<AnonymizeResult> {
    return this.db.transaction(async (tx) => {
      await lockSubject(tx, subjectType, subjectId);
      const table = subjectType === "customer" ? customers : prospects;
      const [subject] = await tx
        .select({
          fullName: table.fullName,
          archivedAt: table.archivedAt,
          anonymizedAt: table.anonymizedAt,
        })
        .from(table)
        .where(eq(table.id, subjectId))
        .for("update");
      let prospectId: string | null =
        subjectType === "prospect" ? subjectId : null;
      if (subject && subjectType === "customer") {
        const [link] = await tx
          .select({ prospectId: customers.prospectId })
          .from(customers)
          .where(eq(customers.id, subjectId));
        prospectId = link?.prospectId ?? null;
        if (prospectId) {
          await lockSubject(tx, "prospect", prospectId);
          await tx
            .select({ id: prospects.id })
            .from(prospects)
            .where(eq(prospects.id, prospectId))
            .for("update");
        }
      }
      const scope = subject
        ? await this.scopeOf(tx, subjectType, subjectId, prospectId)
        : null;
      const docs = scope
        ? await this.documentIdsOf(tx, scope)
        : { owned: [], all: [] };
      const decision = anonymizeDecision({
        subject: subject ?? null,
        activeHoldCount: scope
          ? await this.activeHoldCount(tx, scope, docs.all)
          : 0,
        confirmName,
      });
      if (decision.outcome === "already_anonymized") {
        const event = await this.existingEvent(tx, subjectType, subjectId);
        if (event) return { ok: true, event, alreadyAnonymized: true };
        return { ok: false, error: "PRIVACY_SUBJECT_NOT_FOUND" };
      }
      if (decision.outcome === "refused") {
        const error = (
          {
            not_found: "PRIVACY_SUBJECT_NOT_FOUND",
            not_archived: "PRIVACY_SUBJECT_NOT_ARCHIVED",
            confirmation_mismatch: "PRIVACY_CONFIRMATION_MISMATCH",
            hold_active: "PRIVACY_RETENTION_HOLD_ACTIVE",
          } as const
        )[decision.reason];
        return { ok: false, error };
      }
      const delayDays = Number(
        (await readSettings(tx)).settings[privacyPurgeDelayDaysKey],
      );
      const { touched, documentsMarked, tokensRevoked, outboxDeadLettered } =
        await this.applyAll(
          tx,
          subjectType,
          subjectId,
          scope!,
          docs,
          now,
          purgeAfter(now, delayDays),
        );
      const linkedSubjects: LinkedSubject[] =
        subjectType === "customer" && prospectId
          ? [{ subjectType: "prospect", subjectId: prospectId }]
          : [];
      const [eventRow] = await tx
        .insert(anonymizationEvents)
        .values({
          subjectType,
          subjectId,
          reason: ANONYMIZATION_REASON,
          status: "executed",
          requestedAt: now,
          executedAt: now,
          executedByUserId: actor.userId,
          metadataJson: {
            planVersion: ANONYMIZATION_PLAN_VERSION,
            tables: touched,
            documentsMarked,
            tokensRevoked,
            outboxDeadLettered,
            linkedSubjects,
          },
        })
        .returning();
      await this.audit(
        tx,
        actor,
        "privacy.subject_anonymized",
        subjectType,
        subjectId,
        {
          subjectType,
          anonymizationEventId: eventRow!.id,
          tablesTouched: touched.filter((t) => t.rows > 0).length,
          documentsMarked,
          tokensRevoked,
          linkedProspectId: linkedSubjects[0]?.subjectId ?? null,
        },
      );
      return {
        ok: true,
        event: toExecutedEvent(eventRow!),
        alreadyAnonymized: false,
      };
    });
  }

  /** The deterministic part shared by anonymize and replay: re-running it converges to the same end state. */
  private async applyAll(
    tx: Tx,
    subjectType: PrivacySubjectType,
    subjectId: string,
    scope: Scope,
    docs: { owned: string[]; all: string[] },
    now: Date,
    purgeAt: Date,
  ) {
    const touched = await this.applyPlan(
      tx,
      subjectType,
      subjectId,
      scope,
      now,
    );
    const outbox =
      await tx.execute(sql`update notification_email_outbox set status = 'dead_letter', last_error_code = ${OUTBOX_ANONYMIZED_ERROR_CODE}, updated_at = ${now}
      where status in (${sql.join(
        OPEN_OUTBOX_STATUSES.map((s) => sql`${s}`),
        sql`, `,
      )}) and ${this.linkCondition("outbox", "notification_email_outbox", scope)}`);
    // D3a: only anonymization marks documents; proofs, receipts and quotes are not subscription-owned and stay (D2c, D2d).
    const marked = docs.owned.length
      ? await tx
          .update(documents)
          .set({ status: "pending_purge", purgeAfter: purgeAt, updatedAt: now })
          .where(
            and(
              inArray(documents.id, docs.owned),
              notInArray(documents.status, ["pending_purge", "purged"]),
            ),
          )
          .returning({ id: documents.id })
      : [];
    const tokensRevoked = await this.revokeLinks(
      tx,
      await this.tokenResourceIds(tx, scope, docs.all),
      now,
    );
    return {
      touched,
      documentsMarked: marked.length,
      tokensRevoked,
      outboxDeadLettered: outbox.rowCount ?? 0,
    };
  }

  /**
   * Replay one executed event (rule 7, D11) after a restore: same plan, same pseudonyms, documents re-marked for purge.
   * The subject row may predate the anonymization in the restored DB, so no archived/confirmation/hold check: the event already
   * passed them when it executed. Returns false when the subject no longer exists.
   */
  async replay(event: ExecutedPrivacyEvent, now: Date): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await lockSubject(tx, event.subjectType, event.subjectId);
      const table = event.subjectType === "customer" ? customers : prospects;
      const [subject] = await tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.id, event.subjectId))
        .for("update");
      if (!subject) return false;
      const prospectId =
        event.subjectType === "prospect"
          ? event.subjectId
          : (event.linkedSubjects.find((s) => s.subjectType === "prospect")
              ?.subjectId ?? null);
      if (prospectId && event.subjectType === "customer")
        await lockSubject(tx, "prospect", prospectId);
      const scope = await this.scopeOf(
        tx,
        event.subjectType,
        event.subjectId,
        prospectId,
      );
      const docs = await this.documentIdsOf(tx, scope);
      // anonymized_at keeps the original execution time; files restored from a backup are purged at once.
      await this.applyAll(
        tx,
        event.subjectType,
        event.subjectId,
        scope,
        docs,
        event.executedAt,
        now,
      );
      const [existing] = await tx
        .select({ id: anonymizationEvents.id })
        .from(anonymizationEvents)
        .where(eq(anonymizationEvents.id, event.eventId));
      if (!existing) {
        await tx
          .insert(anonymizationEvents)
          .values({
            id: event.eventId,
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            reason: ANONYMIZATION_REASON,
            status: "executed",
            requestedAt: event.executedAt,
            executedAt: event.executedAt,
            metadataJson: {
              planVersion: event.planVersion,
              linkedSubjects: event.linkedSubjects,
              replayed: true,
            },
          })
          .onConflictDoNothing();
      }
      return true;
    });
  }

  async executedEventsSince(since: Date): Promise<ExecutedPrivacyEvent[]> {
    const rows = await this.db
      .select()
      .from(anonymizationEvents)
      .where(
        and(
          eq(anonymizationEvents.status, "executed"),
          sql`${anonymizationEvents.executedAt} >= ${since}`,
        ),
      )
      .orderBy(
        asc(anonymizationEvents.executedAt),
        asc(anonymizationEvents.id),
      );
    return rows.map(toExecutedEvent);
  }

  async recordReplayRun(counts: Record<string, number>) {
    await this.db.transaction((tx) =>
      this.audit(
        tx,
        null,
        "privacy.replay_run",
        "anonymization_event",
        null,
        counts,
      ),
    );
  }

  /* ------------------------------ Holds (rule 5) ------------------------------ */

  /**
   * Resolves the subject whose lock a hold takes. A document hold serializes on its customer's subject lock, so it cannot race
   * that customer's anonymization. `found: false` → unknown scope; `lock: null` → a document with no customer owner.
   */
  private async holdLockSubject(
    tx: Tx,
    scopeType: RetentionHoldScopeType,
    scopeId: string,
  ): Promise<{ found: boolean; lock: LinkedSubject | null }> {
    if (scopeType !== "document") {
      const table = scopeType === "customer" ? customers : prospects;
      const [row] = await tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.id, scopeId));
      return {
        found: Boolean(row),
        lock: row ? { subjectType: scopeType, subjectId: scopeId } : null,
      };
    }
    const [doc] = await tx
      .select({ ownerType: documents.ownerType, ownerId: documents.ownerId })
      .from(documents)
      .where(eq(documents.id, scopeId));
    if (!doc) return { found: false, lock: null };
    const customerId = await this.documentCustomerId(
      tx,
      doc.ownerType,
      doc.ownerId,
    );
    return {
      found: true,
      lock: customerId
        ? { subjectType: "customer", subjectId: customerId }
        : null,
    };
  }

  private async documentCustomerId(
    tx: Tx,
    ownerType: string,
    ownerId: string,
  ): Promise<string | null> {
    if (ownerType === "subscription")
      return (
        (
          await tx
            .select({ id: subscriptions.customerId })
            .from(subscriptions)
            .where(eq(subscriptions.id, ownerId))
        )[0]?.id ?? null
      );
    if (ownerType === "payment_proof")
      return (
        (
          await tx
            .select({ id: paymentProofs.customerId })
            .from(paymentProofs)
            .where(eq(paymentProofs.id, ownerId))
        )[0]?.id ?? null
      );
    if (ownerType === "receipt")
      return (
        (
          await tx
            .select({ id: receipts.customerId })
            .from(receipts)
            .where(eq(receipts.id, ownerId))
        )[0]?.id ?? null
      );
    if (ownerType === "quote_version")
      return (
        (
          await tx
            .select({ id: quotes.customerId })
            .from(quoteVersions)
            .innerJoin(quotes, eq(quotes.id, quoteVersions.quoteId))
            .where(eq(quoteVersions.id, ownerId))
        )[0]?.id ?? null
      );
    return null;
  }

  async createHold(
    input: {
      scopeType: RetentionHoldScopeType;
      scopeId: string;
      holdType: RetentionHoldType;
      reason: string;
    },
    actor: PrivacyActor,
    now: Date,
  ): Promise<HoldResult> {
    return this.db.transaction(async (tx) => {
      const subject = await this.holdLockSubject(
        tx,
        input.scopeType,
        input.scopeId,
      );
      if (!subject.found)
        return { ok: false, error: "PRIVACY_SUBJECT_NOT_FOUND" };
      if (subject.lock)
        await lockSubject(tx, subject.lock.subjectType, subject.lock.subjectId);
      const [duplicate] = await tx
        .select({ id: retentionHolds.id })
        .from(retentionHolds)
        .where(
          and(
            eq(retentionHolds.scopeType, input.scopeType),
            eq(retentionHolds.scopeId, input.scopeId),
            eq(retentionHolds.holdType, input.holdType),
            eq(retentionHolds.status, "active"),
          ),
        );
      if (duplicate) return { ok: false, error: "PRIVACY_HOLD_ALREADY_ACTIVE" };
      const [row] = await tx
        .insert(retentionHolds)
        .values({
          ...input,
          status: "active",
          startedAt: now,
          createdByUserId: actor.userId,
        })
        .returning();
      // The reason is admin free text: never copied into audit metadata.
      await this.audit(
        tx,
        actor,
        "privacy.hold_created",
        "retention_hold",
        row!.id,
        {
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          holdType: input.holdType,
        },
      );
      return { ok: true, hold: holdItem(row!) };
    });
  }

  async releaseHold(
    holdId: string,
    actor: PrivacyActor,
    now: Date,
  ): Promise<HoldResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(retentionHolds)
        .where(eq(retentionHolds.id, holdId))
        .for("update");
      if (!row) return { ok: false, error: "PRIVACY_HOLD_NOT_FOUND" };
      if (row.status !== "active")
        return { ok: false, error: "PRIVACY_HOLD_ALREADY_RELEASED" };
      const [released] = await tx
        .update(retentionHolds)
        .set({
          status: "released",
          releasedAt: now,
          releasedByUserId: actor.userId,
        })
        .where(eq(retentionHolds.id, holdId))
        .returning();
      await this.audit(
        tx,
        actor,
        "privacy.hold_released",
        "retention_hold",
        holdId,
        {
          scopeType: row.scopeType,
          scopeId: row.scopeId,
          holdType: row.holdType,
        },
      );
      return { ok: true, hold: holdItem(released!) };
    });
  }

  async listHolds(
    scopeType: RetentionHoldScopeType,
    scopeId: string,
  ): Promise<RetentionHoldItem[]> {
    const rows = await this.db
      .select()
      .from(retentionHolds)
      .where(
        and(
          eq(retentionHolds.scopeType, scopeType),
          eq(retentionHolds.scopeId, scopeId),
        ),
      )
      .orderBy(desc(retentionHolds.startedAt));
    return rows.map(holdItem);
  }

  /* ------------------------------ Purge (D3) ------------------------------ */

  /**
   * One document per transaction, claimed with FOR UPDATE SKIP LOCKED. Storage objects are deleted before the tombstone commit
   * (D3b): the document is already inaccessible, and a crash in between leaves a pending_purge row the next run finishes.
   */
  async purgeDue(
    now: Date,
    limit: number,
    removeStoredObject: RemoveStoredObject,
    onlyDocumentIds?: string[],
  ): Promise<PurgeBatchResult> {
    const result: PurgeBatchResult = {
      scanned: 0,
      purged: 0,
      skippedHold: 0,
      failed: 0,
    };
    if (onlyDocumentIds && onlyDocumentIds.length === 0) return result;
    const skipped = new Set<string>();
    while (result.scanned < limit) {
      const outcome = await this.db
        .transaction(async (tx) => {
          const [doc] = await tx
            .select({
              id: documents.id,
              ownerType: documents.ownerType,
              ownerId: documents.ownerId,
            })
            .from(documents)
            .where(
              and(
                eq(documents.status, "pending_purge"),
                lte(documents.purgeAfter, now),
                ...(skipped.size
                  ? [notInArray(documents.id, [...skipped])]
                  : []),
                ...(onlyDocumentIds
                  ? [inArray(documents.id, onlyDocumentIds)]
                  : []),
              ),
            )
            .orderBy(asc(documents.purgeAfter), asc(documents.id))
            .limit(1)
            .for("update", { skipLocked: true });
          if (!doc) return "none" as const;
          skipped.add(doc.id);
          const customerId = await this.documentCustomerId(
            tx,
            doc.ownerType,
            doc.ownerId,
          );
          const [customer] = customerId
            ? await tx
                .select({ prospectId: customers.prospectId })
                .from(customers)
                .where(eq(customers.id, customerId))
            : [];
          const holds = await this.activeHoldCount(
            tx,
            {
              customerId,
              prospectId: customer?.prospectId ?? null,
              subscriptionIds: [],
              requestIds: [],
            },
            [doc.id],
          );
          if (holds > 0) return "hold" as const;
          const versions = await tx
            .select({ storageKey: documentVersions.storageKey })
            .from(documentVersions)
            .where(eq(documentVersions.documentId, doc.id));
          for (const version of versions)
            await removeStoredObject(version.storageKey);
          await tx
            .update(documents)
            .set({ currentVersionId: null, status: "purged", updatedAt: now })
            .where(eq(documents.id, doc.id));
          await tx
            .delete(documentVersions)
            .where(eq(documentVersions.documentId, doc.id));
          return "purged" as const;
        })
        .catch(() => "failed" as const);
      if (outcome === "none") break;
      result.scanned += 1;
      if (outcome === "purged") result.purged += 1;
      else if (outcome === "hold") result.skippedHold += 1;
      else result.failed += 1;
    }
    return result;
  }

  /**
   * OPS-01 O4: what purgeDue would do now - same eligibility (pending_purge, purge_after reached) and the same hold check -
   * in a READ ONLY transaction. Counts only; deletes nothing, writes no run row.
   */
  async simulatePurge(now: Date): Promise<
    {
      subjectsDue: number;
      filesDue: number;
      bytesDue: number;
      heldBack: number;
    } & RetentionCounts
  > {
    return this.db.transaction(
      async (tx) => {
        const due = await tx
          .select({
            id: documents.id,
            ownerType: documents.ownerType,
            ownerId: documents.ownerId,
          })
          .from(documents)
          .where(
            and(
              eq(documents.status, "pending_purge"),
              lte(documents.purgeAfter, now),
            ),
          )
          .orderBy(asc(documents.purgeAfter), asc(documents.id));
        const subjects = new Set<string>();
        const result = {
          subjectsDue: 0,
          filesDue: 0,
          bytesDue: 0,
          heldBack: 0,
        };
        for (const doc of due) {
          const customerId = await this.documentCustomerId(
            tx,
            doc.ownerType,
            doc.ownerId,
          );
          const [customer] = customerId
            ? await tx
                .select({ prospectId: customers.prospectId })
                .from(customers)
                .where(eq(customers.id, customerId))
            : [];
          if (
            (await this.activeHoldCount(
              tx,
              {
                customerId,
                prospectId: customer?.prospectId ?? null,
                subscriptionIds: [],
                requestIds: [],
              },
              [doc.id],
            )) > 0
          ) {
            result.heldBack += 1;
            continue;
          }
          subjects.add(customerId ?? `document:${doc.id}`);
          const [files] = await tx
            .select({
              n: sql<number>`count(*)::int`,
              bytes: sql<number>`coalesce(sum(${documentVersions.sizeBytes}), 0)::bigint`,
            })
            .from(documentVersions)
            .where(eq(documentVersions.documentId, doc.id));
          result.filesDue += files?.n ?? 0;
          result.bytesDue += Number(files?.bytes ?? 0);
        }
        result.subjectsDue = subjects.size;
        // RET-01 R7: the retention steps of the same run, same predicates, same read-only transaction.
        return {
          ...result,
          ...(await retentionCounts(tx, await readRetentionCutoffs(tx, now))),
        };
      },
      { accessMode: "read only" },
    );
  }

  async recordPurgeRun(counts: Record<string, number>) {
    await this.db.transaction((tx) =>
      this.audit(tx, null, "privacy.purge_run", "document", null, counts),
    );
  }

  async subjectDocumentIds(event: ExecutedPrivacyEvent): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      const prospectId =
        event.subjectType === "prospect"
          ? event.subjectId
          : (event.linkedSubjects.find((s) => s.subjectType === "prospect")
              ?.subjectId ?? null);
      return (
        await this.documentIdsOf(
          tx,
          await this.scopeOf(
            tx,
            event.subjectType,
            event.subjectId,
            prospectId,
          ),
        )
      ).owned;
    });
  }
}

export function toExecutedEvent(
  row: typeof anonymizationEvents.$inferSelect,
): ExecutedPrivacyEvent {
  const metadata = (row.metadataJson ?? {}) as {
    planVersion?: number;
    linkedSubjects?: LinkedSubject[];
  };
  return {
    eventId: row.id,
    subjectType: row.subjectType as PrivacySubjectType,
    subjectId: row.subjectId,
    executedAt: row.executedAt ?? row.requestedAt,
    planVersion: metadata.planVersion ?? 1,
    linkedSubjects: metadata.linkedSubjects ?? [],
  };
}

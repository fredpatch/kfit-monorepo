import { getTableColumns, inArray, like, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { testDataKinds, type TestDataCounts, type TestDataKind } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { documentVersions, users } from "../../../db/schema/index.js";
import { AuditService, type RecordAuditEventInput } from "../../auth/services/audit.service.js";
import {
  testDataDetachedColumns, testDataForeignKeys, testDataPolymorphicLinks, testDataPolymorphicTypes, testDataPurgePlan, testDataRootLabels, testDataTable,
} from "../services/test-data.plan.js";
import { classifyTestData, type TestDataClassification, type TestDataRef, type TestDataRows } from "../services/test-data.policy.js";
import { isPgForeignKeyViolation } from "../../../db/pg-error.js";

type AppDb = typeof appDb;
type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
type Reader = Pick<AppDb, "select">;
export type TestDataActor = { userId: string; requestId: string; ipAddress: string | null; userAgent: string | null };
export type TestDataAuditRecorder = (tx: Tx, input: RecordAuditEventInput) => Promise<unknown>;
export type TestDataPurgeResult =
  | { status: "changed" }
  | { status: "purged"; counts: TestDataCounts; files: Array<{ documentVersionId: string; storageKey: string }> };

/** TEST-01 D5: the integration suite's synthetic accounts (reserved .invalid domain); reported as kept, never deleted. */
export const SYNTHETIC_USER_EMAIL_PATTERN = "%@example.invalid";
const PURGE_LOCK = "kfit:dev:test-data-purge";

class TestDataChanged extends Error {}

export class DrizzleTestDataRepository {
  constructor(
    private readonly database: AppDb,
    options: { auditHashPepper: string },
    private readonly recordAudit: TestDataAuditRecorder = (tx, input) => new AuditService(tx, options).record(input),
  ) {}

  async classify(reader: Reader = this.database): Promise<TestDataClassification> {
    const rows: TestDataRows = {};
    for (const [kind, table] of testDataPurgePlan) {
      const fields: Record<string, PgColumn> = { id: table.id };
      const label = (testDataRootLabels as Partial<Record<TestDataKind, PgColumn>>)[kind];
      if (label) fields.label = label;
      const foreignKeys = testDataForeignKeys.filter((fk) => fk.kind === kind);
      foreignKeys.forEach((fk, index) => { fields[`fk${index}`] = fk.column; });
      const link = testDataPolymorphicLinks.find((candidate) => candidate.kind === kind);
      if (link) { fields.linkType = link.type; fields.linkId = link.id; }
      const loaded = await reader.select(fields).from(table) as Array<Record<string, unknown>>;
      rows[kind] = loaded.map((row) => {
        const linkKind = typeof row.linkType === "string" ? testDataPolymorphicTypes[row.linkType] : undefined;
        return {
          id: String(row.id),
          ...(typeof row.label === "string" ? { label: row.label } : {}),
          foreignKeys: foreignKeys.flatMap((fk, index): TestDataRef[] => (typeof row[`fk${index}`] === "string" ? [{ kind: fk.parent, id: row[`fk${index}`] as string }] : [])),
          links: linkKind && typeof row.linkId === "string" ? [{ kind: linkKind, id: row.linkId }] : [],
        };
      });
    }
    const [synthetic] = await reader.select({ count: sql<number>`count(*)::int` }).from(users).where(like(users.email, SYNTHETIC_USER_EMAIL_PATTERN));
    return classifyTestData(rows, synthetic?.count ?? 0);
  }

  /** TEST-01 D6/D7: recomputes under a lock; a different fingerprint, or a row added meanwhile (FK violation), deletes nothing. */
  async purge(expectedFingerprint: string, fingerprint: (classification: TestDataClassification) => string, actor: TestDataActor): Promise<TestDataPurgeResult> {
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${PURGE_LOCK}, 0))`);
        const classification = await this.classify(tx);
        if (fingerprint(classification) !== expectedFingerprint) return { status: "changed" } as const;
        const doomed = (kind: TestDataKind) => classification.doomed.get(kind) ?? [];

        const versionIds = doomed("document_versions");
        const files = versionIds.length
          ? (await tx.select({ documentVersionId: documentVersions.id, storageKey: documentVersions.storageKey }).from(documentVersions).where(inArray(documentVersions.id, versionIds)))
          : [];
        for (const [kind, column] of testDataDetachedColumns) {
          const ids = doomed(kind);
          const table = testDataTable(kind);
          const property = Object.entries(getTableColumns(table)).find(([, candidate]) => candidate === column)?.[0];
          if (!property) throw new Error(`detached column missing on ${kind}`);
          if (ids.length) await tx.update(table).set({ [property]: null }).where(inArray(table.id, ids));
        }
        const counts: TestDataCounts = {};
        for (const [kind, table] of testDataPurgePlan) {
          const ids = doomed(kind);
          if (!ids.length) continue;
          const deleted = await tx.delete(table).where(inArray(table.id, ids)).returning({ id: table.id });
          if (deleted.length !== ids.length) throw new TestDataChanged();
          counts[kind] = deleted.length;
        }
        await this.recordAudit(tx, {
          actorType: "user", actorUserId: actor.userId, eventType: "dev.test_data_purged", entityType: "test_data", result: "success",
          requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent,
          metadata: Object.fromEntries(testDataKinds.filter((kind) => counts[kind]).map((kind) => [kind, counts[kind]!])),
        });
        return { status: "purged", counts, files } as const;
      });
    } catch (error) {
      if (error instanceof TestDataChanged || isPgForeignKeyViolation(error)) return { status: "changed" };
      throw error;
    }
  }
}

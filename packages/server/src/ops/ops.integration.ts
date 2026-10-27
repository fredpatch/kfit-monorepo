import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { users } from "../db/schema/auth.js";
import { customers } from "../db/schema/customers.js";
import {
  anonymizationEvents,
  auditEvents,
  scheduledJobRuns,
} from "../db/schema/index.js";
import { prospects } from "../db/schema/prospects.js";
import {
  DrizzlePrivacyRepository,
  type PrivacyActor,
} from "../modules/privacy/repositories/privacy.repository.js";
import { createPrivacyJournal } from "../modules/privacy/services/privacy-journal.js";
import { assertLocalTestDatabase } from "../testing/integration-fixtures.js";
import { BUNDLE_PART_FILES, MANIFEST_FILE } from "./backup-manifest.js";
import { runBackup } from "./backup.js";
import { loadOpsConfig, type OpsConfig } from "./ops-config.js";
import {
  databaseExists,
  databaseUrlFor,
  dropDatabase,
  withClient,
} from "./ops-database.js";
import { runRestore } from "./restore.js";
import { runRestoreDrill } from "./restore-drill.js";
import type { OpsOutcome } from "./run-records.js";

/*
 * S7.4 D10 / S7.4b B4-B8 against the kfit_test cluster. CI has no compose, so pg_dump runs natively there; locally the
 * client tools exist only in the compose postgres container (docker mode). BACKUP_PG_MODE forces either.
 */
const pgMode =
  process.env.BACKUP_PG_MODE ??
  (spawnSync("pg_dump", ["--version"]).status === 0 ? "native" : "docker");
const auditHashPepper = "synthetic-ops-audit-pepper";
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const userId = randomUUID(),
  customerId = randomUUID(),
  prospectId = randomUUID();
const name = `Synthetic Ops Restore ${customerId.slice(0, 8)}`;
const actor: PrivacyActor = {
  userId,
  requestId: randomUUID(),
  ipAddress: "192.0.2.74",
  userAgent: "synthetic-ops",
};
const restoreTargets = [`kfit_restore_${randomBytes(4).toString("hex")}`];
const runKeys: string[] = [];
let work = "",
  config: OpsConfig,
  safe = false;

before(async () => {
  assertLocalTestDatabase();
  safe = true;
  work = await mkdtemp(path.join(tmpdir(), "kfit-ops-it-"));
  for (const dir of ["storage/customer-docs", "journal"])
    await mkdir(path.join(work, dir), { recursive: true });
  await writeFile(
    path.join(work, "storage/customer-docs", `${randomUUID()}.pdf`),
    Buffer.concat([Buffer.from("%PDF-"), randomBytes(2048)]),
  );
  await writeFile(path.join(work, "storage", "second.bin"), randomBytes(300));
  config = loadOpsConfig(
    {
      BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      DATABASE_URL: process.env.DATABASE_URL,
      BACKUP_PG_MODE: pgMode,
      PRIVATE_STORAGE_ROOT: path.join(work, "storage"),
      KFIT_PRIVACY_JOURNAL_DIR: path.join(work, "journal"),
      BACKUP_DIR: path.join(work, "primary"),
      BACKUP_SECONDARY_DIR: path.join(work, "secondary"),
    },
    { composeDir: repositoryRoot },
  );
  await db.insert(users).values({
    id: userId,
    email: `ops-${userId}@example.invalid`,
    passwordHash: "synthetic",
    role: "admin",
    status: "active",
  });
  await db.insert(prospects).values({
    id: prospectId,
    fullName: name,
    whatsapp: `+24166${customerId.replace(/\D/g, "1").slice(0, 6)}`,
    email: `ops-${customerId}@example.invalid`,
    city: "Libreville",
  });
  await db.insert(customers).values({
    id: customerId,
    prospectId,
    fullName: name,
    whatsapp: `+24166${customerId.replace(/\D/g, "1").slice(0, 6)}`,
    email: `ops-${customerId}@example.invalid`,
    city: "Libreville",
    country: "GA",
    archivedAt: new Date(),
  });
});

after(async () => {
  try {
    if (!safe) return;
    for (const target of restoreTargets)
      await dropDatabase(process.env.DATABASE_URL!, target);
    if (runKeys.length)
      await db
        .delete(scheduledJobRuns)
        .where(
          and(
            like(scheduledJobRuns.jobKey, "ops.%"),
            inArray(scheduledJobRuns.runKey, runKeys),
          ),
        );
    await db
      .delete(scheduledJobRuns)
      .where(like(scheduledJobRuns.runKey, `${runKeys[0] ?? "none"}:%`));
    await db
      .delete(anonymizationEvents)
      .where(eq(anonymizationEvents.subjectId, customerId));
    await db
      .delete(anonymizationEvents)
      .where(eq(anonymizationEvents.subjectId, prospectId));
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(prospects).where(eq(prospects.id, prospectId));
    await db.delete(users).where(eq(users.id, userId));
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
    await pool.end();
  }
});

const succeeded = (outcome: OpsOutcome) => {
  assert.equal(
    outcome.status,
    "succeeded",
    outcome.status === "failed"
      ? `${outcome.error.code} (${outcome.error.detail}) ${String((outcome.error.cause as Error | undefined)?.cause ?? outcome.error.cause ?? "")}`
      : "",
  );
  assert.equal(outcome.recorded, true);
  return outcome.result;
};
const runs = (jobKey: string, runKey: string) =>
  db
    .select()
    .from(scheduledJobRuns)
    .where(
      and(
        eq(scheduledJobRuns.jobKey, jobKey),
        eq(scheduledJobRuns.runKey, runKey),
      ),
    );
const restoreDatabases = async () =>
  withClient(
    databaseUrlFor(process.env.DATABASE_URL!, "postgres"),
    async (client) =>
      (
        await client.query<{ datname: string }>(
          "select datname from pg_database where datname like 'kfit_restore_%'",
        )
      ).rows.map((row) => row.datname),
  );

let bundle = "";

test(`S7.4 D10 / B4-B8 (${pgMode} mode): backup, anonymize after it, restore → re-anonymized from the journal; drill matches and drops its database`, async () => {
  const restoreDbsBefore = await restoreDatabases();
  const backup = succeeded(await runBackup(config, new Date()));
  bundle = String(backup.bundle);
  runKeys.push(bundle);
  assert.equal(backup.files, 2);
  assert.ok(Number(backup.tables) > 30 && Number(backup.rows) > 0);
  for (const dir of [config.backupDir!, config.secondaryDir!]) {
    assert.deepEqual(
      (await readdir(path.join(dir, bundle))).sort(),
      [...Object.values(BUNDLE_PART_FILES), MANIFEST_FILE].sort(),
      "complete bundle in both directories",
    );
    assert.deepEqual(
      (await readdir(dir)).filter((entry) => entry.startsWith(".tmp-")),
      [],
      "no temp directory left",
    );
  }
  const manifestText = await readFile(
    path.join(config.backupDir!, bundle, MANIFEST_FILE),
    "utf8",
  );
  assert.ok(
    !manifestText.includes(config.key.toString("hex")) &&
      !manifestText.includes("localhost") &&
      !manifestText.includes(name),
    "no key, host or customer data in the manifest",
  );
  assert.deepEqual(
    (await runs("ops.backup", bundle)).map((row) => [
      row.status,
      row.errorCode,
      row.attempt,
    ]),
    [["succeeded", null, 1]],
  );

  // Anonymized after the backup: the restored database does not know it; only the live journal does (D11).
  const repository = new DrizzlePrivacyRepository(db, { auditHashPepper });
  const anonymized = await repository.anonymize(
    "customer",
    customerId,
    name,
    actor,
    new Date(),
  );
  assert.ok(anonymized.ok && !anonymized.alreadyAnonymized);
  await createPrivacyJournal(config.journalDir!)!.append(anonymized.event);

  const targetDb = restoreTargets[0]!,
    filesTarget = path.join(work, "restored-files");
  const restored = succeeded(
    await runRestore(config, {
      bundleDir: path.join(config.backupDir!, bundle),
      targetDb,
      filesTarget,
      confirmOverwrite: false,
      auditHashPepper,
    }),
  );
  assert.equal(restored.replayFromJournalOnly, 1);
  assert.equal(restored.journalLive, 1);
  assert.equal(
    restored.journalAppended,
    0,
    "the bundle journal was empty; the live journal is never rewritten",
  );
  assert.equal(
    (
      await readFile(
        path.join(config.journalDir!, "privacy-journal.jsonl"),
        "utf8",
      )
    )
      .trim()
      .split("\n").length,
    1,
  );
  await withClient(
    databaseUrlFor(process.env.DATABASE_URL!, targetDb),
    async (client) => {
      const { rows } = await client.query<{
        full_name: string;
        anonymized_at: Date | null;
      }>("select full_name, anonymized_at from customers where id = $1", [
        customerId,
      ]);
      assert.ok(
        rows[0]?.anonymized_at,
        "re-anonymized in the restored database",
      );
      assert.notEqual(rows[0]?.full_name, name);
      const { rows: runRows } = await client.query<{ status: string }>(
        "select status from scheduled_job_runs where job_key = 'ops.restore' and run_key = $1",
        [bundle],
      );
      assert.deepEqual(
        runRows.map((row) => row.status),
        ["succeeded"],
        "ops:restore records its run in the restored target",
      );
      const { rows: backupRows } = await client.query(
        "select 1 from scheduled_job_runs where job_key = 'ops.backup' and run_key = $1",
        [bundle],
      );
      assert.equal(
        backupRows.length,
        0,
        "the bundle does not carry its own running backup row",
      );
    },
  );
  assert.equal(
    (await readdir(filesTarget, { recursive: true })).filter((entry) =>
      /\.(pdf|bin)$/.test(String(entry)),
    ).length,
    2,
  );

  const drill = succeeded(await runRestoreDrill(config, { auditHashPepper }));
  assert.equal(drill.bundle, bundle);
  assert.equal(drill.files, 2);
  assert.equal(drill.replayFromJournalOnly, 1);
  assert.equal(
    await databaseExists(process.env.DATABASE_URL!, String(drill.targetDb)),
    false,
    "throwaway database dropped",
  );
  const drillRuns = await db
    .select()
    .from(scheduledJobRuns)
    .where(
      and(
        eq(scheduledJobRuns.jobKey, "ops.restore_drill"),
        like(scheduledJobRuns.runKey, `${bundle}:%`),
      ),
    );
  assert.deepEqual(
    drillRuns.map((row) => row.status),
    ["succeeded"],
    "one drill row in the source database",
  );
  await dropDatabase(process.env.DATABASE_URL!, targetDb);
  assert.deepEqual(
    (await restoreDatabases()).sort(),
    restoreDbsBefore.sort(),
    "no kfit_restore_* database left behind",
  );
});

test("B6.1: a tampered bundle is refused before the target database is created; the failure is recorded with its code", async () => {
  assert.ok(bundle, "needs the bundle of the previous test");
  const copy = path.join(work, "tampered", bundle);
  await mkdir(copy, { recursive: true });
  for (const file of [...Object.values(BUNDLE_PART_FILES), MANIFEST_FILE])
    await writeFile(
      path.join(copy, file),
      await readFile(path.join(config.backupDir!, bundle, file)),
    );
  const part = path.join(copy, BUNDLE_PART_FILES.files),
    bytes = await readFile(part);
  bytes.writeUInt8(bytes.readUInt8(10) ^ 0x01, 10);
  await writeFile(part, bytes);

  const targetDb = `kfit_restore_${randomBytes(4).toString("hex")}`;
  restoreTargets.push(targetDb);
  const outcome = await runRestore(config, {
    bundleDir: copy,
    targetDb,
    filesTarget: path.join(work, "tampered-files"),
    confirmOverwrite: false,
    auditHashPepper,
  });
  assert.ok(
    outcome.status === "failed" && outcome.error.code === "VERIFY_FAILED",
  );
  assert.equal(
    await databaseExists(process.env.DATABASE_URL!, targetDb),
    false,
  );
  assert.deepEqual(
    (await runs("ops.restore", bundle)).map((row) => [
      row.status,
      row.errorCode,
    ]),
    [["failed", "VERIFY_FAILED"]],
    "recorded in the source database",
  );

  const manifest = JSON.parse(
    await readFile(path.join(copy, MANIFEST_FILE), "utf8"),
  ) as { files: { count: number } };
  manifest.files.count += 1;
  await writeFile(path.join(copy, MANIFEST_FILE), JSON.stringify(manifest));
  const forged = await runRestore(config, {
    bundleDir: copy,
    targetDb,
    filesTarget: path.join(work, "tampered-files"),
    confirmOverwrite: false,
    auditHashPepper,
  });
  assert.ok(
    forged.status === "failed" && forged.error.code === "MANIFEST_INVALID",
  );
  assert.equal(
    await databaseExists(process.env.DATABASE_URL!, targetDb),
    false,
  );

  for (const forbidden of ["kfit_dev", "kfit_test"]) {
    const refused = await runRestore(config, {
      bundleDir: path.join(config.backupDir!, bundle),
      targetDb: forbidden,
      filesTarget: path.join(work, "forbidden-files"),
      confirmOverwrite: true,
      auditHashPepper,
    });
    assert.ok(
      refused.status === "failed" && refused.error.code === "TARGET_FORBIDDEN",
      forbidden,
    );
  }
});

test("B8: a failed backup leaves one failed row with its error code and no bundle", async () => {
  const broken: OpsConfig = {
    ...config,
    storageRoot: path.join(work, "missing-storage"),
  };
  const outcome = await runBackup(broken, new Date(Date.now() + 5_000));
  assert.ok(
    outcome.status === "failed" && outcome.error.code === "DUMP_FAILED",
  );
  assert.equal(outcome.recorded, true);
  const runKey = String(outcome.result.bundle);
  runKeys.push(runKey);
  assert.deepEqual(
    (await runs("ops.backup", runKey)).map((row) => [
      row.status,
      row.errorCode,
    ]),
    [["failed", "DUMP_FAILED"]],
  );
  assert.deepEqual(
    (await readdir(config.backupDir!)).filter(
      (entry) => entry === runKey || entry.startsWith(".tmp-"),
    ),
    [],
  );
});

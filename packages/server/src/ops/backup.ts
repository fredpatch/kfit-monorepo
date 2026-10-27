import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import pg from "pg";
import { PRIVACY_JOURNAL_FILE } from "../modules/privacy/services/privacy-journal.js";
import { encryptToFile } from "./backup-crypto.js";
import {
  BACKUP_FORMAT_VERSION,
  BUNDLE_PART_FILES,
  MANIFEST_FILE,
  bundleName,
  signManifest,
  type BackupManifest,
  type BundlePart,
} from "./backup-manifest.js";
import {
  copyBundle,
  fileStats,
  readManifest,
  rotateBundles,
  syncDirectory,
  tempBundleDir,
  verifyParts,
  writeDurable,
} from "./bundle-store.js";
import { requireDir, type OpsConfig } from "./ops-config.js";
import {
  databaseNameOf,
  migrationState,
  serverMajor,
  tableCounts,
} from "./ops-database.js";
import { failAs, OpsError } from "./ops-errors.js";
import {
  createPgTools,
  pgClientMajor,
  tarCreate,
  tarVersion,
  type Spawned,
} from "./ops-process.js";
import {
  OPS_JOB_KEYS,
  recordOpsRun,
  type OpsOutcome,
  type OpsRunResult,
} from "./run-records.js";

/** B2: a client older than the server cannot dump or restore it. */
export async function assertPgClient(
  versionLine: string,
  client: pg.Client,
): Promise<void> {
  const clientMajor = pgClientMajor(versionLine),
    server = await serverMajor(client);
  if (clientMajor === null || clientMajor < server)
    throw new OpsError(
      "PG_CLIENT_TOO_OLD",
      `client ${clientMajor ?? "unknown"} < server ${server}`,
    );
}

/** Encrypts a tool's stdout; the tool's failure and the encryption's failure map to their own codes. */
async function encryptToolOutput(
  tool: Spawned,
  key: Buffer,
  file: string,
  toolCode: "DUMP_FAILED",
  toolDetail: string,
): Promise<BundlePart> {
  tool.stdin.end();
  const [encrypted, exited] = await Promise.allSettled([
    encryptToFile(tool.stdout, key, file),
    tool.done,
  ]);
  if (exited.status === "rejected")
    throw new OpsError(toolCode, toolDetail, { cause: exited.reason });
  if (encrypted.status === "rejected")
    throw new OpsError("ENCRYPT_FAILED", path.basename(file), {
      cause: encrypted.reason,
    });
  return encrypted.value;
}

function lineCounter() {
  let lines = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      for (const byte of chunk) if (byte === 0x0a) lines += 1;
      callback(null, chunk);
    },
  });
  return { stream, lines: () => lines };
}

/**
 * S7.4 D6 / S7.4b B3-B5, B8. Writes the bundle under a temp name in BACKUP_DIR and renames it only once complete, re-reads
 * every part hash, copies and verifies it in BACKUP_SECONDARY_DIR, then rotates both. Table counts and pg_dump share one
 * exported snapshot. The run row is inserted after the snapshot, so the bundle never holds its own "running" row.
 */
export async function runBackup(
  config: OpsConfig,
  now: Date = new Date(),
): Promise<OpsOutcome> {
  const started = Date.now(),
    name = bundleName(now);
  let workDir: string | null = null,
    finalDir: string | null = null,
    completed = false;
  const fail = async (error: unknown): Promise<OpsOutcome> => {
    const opsError =
      error instanceof OpsError
        ? error
        : new OpsError("DUMP_FAILED", "unexpected failure", { cause: error });
    const result = { bundle: name, durationMs: Date.now() - started };
    const recorded = await recordOpsRun(config.databaseUrl, {
      jobKey: OPS_JOB_KEYS.backup,
      runKey: name,
      status: "failed",
      startedAt: now,
      result,
      errorCode: opsError.code,
    });
    return { status: "failed", error: opsError, result, recorded };
  };
  try {
    const backupDir = requireDir(config.backupDir, "BACKUP_DIR"),
      secondaryDir = requireDir(config.secondaryDir, "BACKUP_SECONDARY_DIR");
    const tools = createPgTools(config.pg, config.databaseUrl);
    const sourceDatabase = databaseNameOf(config.databaseUrl);
    const source = new pg.Client({ connectionString: config.databaseUrl });
    await failAs("DUMP_FAILED", "source database unreachable", () =>
      source.connect(),
    );
    try {
      const pgDump = await failAs("DUMP_FAILED", "pg_dump unavailable", () =>
        tools.version("pg_dump"),
      );
      await assertPgClient(pgDump, source);
      const tar = await failAs("DUMP_FAILED", "tar unavailable", tarVersion);
      if (
        !(await stat(config.storageRoot).then(
          (s) => s.isDirectory(),
          () => false,
        ))
      )
        throw new OpsError(
          "DUMP_FAILED",
          "PRIVATE_STORAGE_ROOT is not a directory",
        );

      await mkdir(backupDir, { recursive: true });
      workDir = tempBundleDir(backupDir, name);
      await mkdir(workDir);

      await source.query(
        "begin transaction isolation level repeatable read read only",
      );
      const snapshot = (
        await source.query<{ id: string }>("select pg_export_snapshot() as id")
      ).rows[0]!.id;
      const counts = await tableCounts(source),
        migration = await migrationState(source);
      await recordOpsRun(config.databaseUrl, {
        jobKey: OPS_JOB_KEYS.backup,
        runKey: name,
        status: "running",
        startedAt: now,
      });

      const database = await encryptToolOutput(
        tools.dump(sourceDatabase, snapshot),
        config.key,
        path.join(workDir, BUNDLE_PART_FILES.database),
        "DUMP_FAILED",
        "pg_dump failed",
      );
      await source.query("commit");

      const files = await failAs(
        "DUMP_FAILED",
        "private files unreadable",
        () => fileStats(config.storageRoot),
      );
      const filesPart = await encryptToolOutput(
        tarCreate(config.storageRoot),
        config.key,
        path.join(workDir, BUNDLE_PART_FILES.files),
        "DUMP_FAILED",
        "tar failed",
      );

      const journalFile = config.journalDir
        ? path.join(config.journalDir, PRIVACY_JOURNAL_FILE)
        : null;
      const journalSource =
        journalFile &&
        (await stat(journalFile).then(
          (s) => s.isFile(),
          () => false,
        ))
          ? createReadStream(journalFile)
          : Readable.from([]);
      const counter = lineCounter();
      const journal = await failAs("ENCRYPT_FAILED", "journal", () =>
        encryptToFile(
          journalSource.pipe(counter.stream),
          config.key,
          path.join(workDir!, BUNDLE_PART_FILES.journal),
        ),
      );

      const manifest: BackupManifest = signManifest(
        {
          formatVersion: BACKUP_FORMAT_VERSION,
          bundle: name,
          createdAt: now.toISOString(),
          sourceDatabase,
          migration,
          tableCounts: counts,
          files,
          journal: { lines: counter.lines() },
          tools: { pgDump, tar },
          parts: { database, files: filesPart, journal },
        },
        config.key,
      );
      await failAs("ENCRYPT_FAILED", "manifest", () =>
        writeDurable(
          path.join(workDir!, MANIFEST_FILE),
          `${JSON.stringify(manifest, null, 2)}\n`,
        ),
      );

      finalDir = path.join(backupDir, name);
      if (
        await stat(finalDir).then(
          () => true,
          () => false,
        )
      )
        throw new OpsError(
          "VERIFY_FAILED",
          "a bundle with this name already exists",
        );
      await rename(workDir, finalDir);
      workDir = null;
      await syncDirectory(backupDir);
      await failAs("VERIFY_FAILED", "re-read", async () => {
        await verifyParts(finalDir!, await readManifest(finalDir!, config.key));
      });
      completed = true;

      await failAs("SECONDARY_COPY_FAILED", "copy or verify", () =>
        copyBundle(finalDir!, manifest, secondaryDir),
      );
      const primary = await failAs("ROTATION_FAILED", "BACKUP_DIR", () =>
        rotateBundles(backupDir, config.key, now),
      );
      const secondary = await failAs(
        "ROTATION_FAILED",
        "BACKUP_SECONDARY_DIR",
        () => rotateBundles(secondaryDir, config.key, now),
      );

      const result: OpsRunResult = {
        bundle: name,
        durationMs: Date.now() - started,
        bundleBytes: database.bytes + filesPart.bytes + journal.bytes,
        databaseBytes: database.bytes,
        tables: Object.keys(counts).length,
        rows: Object.values(counts).reduce((a, b) => a + b, 0),
        files: files.count,
        fileBytes: files.bytes,
        journalLines: counter.lines(),
        keptPrimary: primary.kept,
        deletedPrimary: primary.deleted,
        keptSecondary: secondary.kept,
        deletedSecondary: secondary.deleted,
      };
      const recorded = await recordOpsRun(config.databaseUrl, {
        jobKey: OPS_JOB_KEYS.backup,
        runKey: name,
        status: "succeeded",
        startedAt: now,
        result,
      });
      return {
        status: "succeeded",
        result,
        recorded,
        notes: { pgMode: config.pg.mode, pgDump, tar },
      };
    } finally {
      await source.end().catch(() => undefined);
    }
  } catch (error) {
    // B4: nothing partial survives under the final name; a bundle that failed its own re-read is not kept either.
    if (workDir)
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    if (finalDir && !completed)
      await rm(finalDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    return fail(error);
  }
}

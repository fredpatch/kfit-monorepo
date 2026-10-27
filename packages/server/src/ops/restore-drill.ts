import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BackupManifest } from "./backup-manifest.js";
import { resolveConfiguredPath } from "../config/paths.js";
import { fileStats, listBundles } from "./bundle-store.js";
import { requireDir, type OpsConfig } from "./ops-config.js";
import {
  databaseExists,
  dropDatabase,
  migrationState,
  tableCounts,
  withClient,
} from "./ops-database.js";
import { failAs, OpsError } from "./ops-errors.js";
import { replayResult, restoreBundle } from "./restore.js";
import { DRILL_DATABASE_PREFIX } from "./restore-target.js";
import {
  OPS_JOB_KEYS,
  recordOpsRun,
  type OpsOutcome,
  type OpsRunResult,
} from "./run-records.js";

type RestoredState = {
  tableCounts: Record<string, number>;
  files: { count: number; bytes: number };
  migration: { id: string; applied: number };
};

/** B7: newest bundle of BACKUP_DIR whose manifest verifies with the current key. */
export async function newestValidBundle(
  backupDir: string,
  key: Buffer,
): Promise<string> {
  const valid = (
    await failAs("MANIFEST_INVALID", "BACKUP_DIR unreadable", () =>
      listBundles(backupDir, key),
    )
  ).filter((entry) => entry.manifestValid);
  const newest = valid
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!newest)
    throw new OpsError("MANIFEST_INVALID", "no valid bundle in BACKUP_DIR");
  return path.join(backupDir, newest);
}

/** B7: what differs between the manifest and the restored state (labels and counts only). */
export function drillMismatches(
  manifest: BackupManifest,
  restored: RestoredState,
): string[] {
  const tables = new Set([
    ...Object.keys(manifest.tableCounts),
    ...Object.keys(restored.tableCounts),
  ]);
  const tableMismatches = [...tables].filter(
    (table) => manifest.tableCounts[table] !== restored.tableCounts[table],
  ).length;
  return [
    ...(tableMismatches ? [`table counts ${tableMismatches}`] : []),
    ...(manifest.files.count !== restored.files.count ||
    manifest.files.bytes !== restored.files.bytes
      ? ["files"]
      : []),
    ...(manifest.migration.id !== restored.migration.id ||
    manifest.migration.applied !== restored.migration.applied
      ? ["migration"]
      : []),
  ];
}

/**
 * S7.4 D10 / S7.4b B7: restores into a throwaway kfit_restore_<8 hex> database and a temp directory, compares the restored
 * state with the manifest before the replay, runs the replay with live ∪ bundle journal (read only), then always drops both.
 * The run is recorded in the source (live) database.
 */
export async function runRestoreDrill(
  config: OpsConfig,
  options: { bundleDir?: string; auditHashPepper: string },
  now: Date = new Date(),
): Promise<OpsOutcome> {
  const started = Date.now(),
    drillId = randomBytes(4).toString("hex"),
    targetDb = `${DRILL_DATABASE_PREFIX}${drillId}`;
  let runKey = `unknown:${drillId}`,
    filesTarget: string | null = null,
    result: OpsRunResult = { targetDb };
  const cleanup = async () => {
    await dropDatabase(config.databaseUrl, targetDb);
    if (filesTarget) await rm(filesTarget, { recursive: true, force: true });
  };
  try {
    const bundleDir = options.bundleDir
      ? resolveConfiguredPath(options.bundleDir, {
          fallback: options.bundleDir,
        })
      : await newestValidBundle(
          requireDir(config.backupDir, "BACKUP_DIR"),
          config.key,
        );
    runKey = `${path.basename(bundleDir)}:${drillId}`;
    await recordOpsRun(config.databaseUrl, {
      jobKey: OPS_JOB_KEYS.drill,
      runKey,
      status: "running",
      startedAt: now,
    });
    filesTarget = await mkdtemp(path.join(tmpdir(), "kfit-restore-drill-"));
    const checked: { state?: RestoredState } = {};
    const report = await restoreBundle(
      config,
      {
        bundleDir,
        targetDb,
        filesTarget,
        confirmOverwrite: false,
        journal: { kind: "read-only", journalDir: config.journalDir },
        auditHashPepper: options.auditHashPepper,
      },
      now,
      {
        beforeReplay: async ({ manifest, targetUrl }) => {
          const restored = await failAs(
            "RESTORE_FAILED",
            "restored state unreadable",
            async () => ({
              ...(await withClient(targetUrl, async (client) => ({
                tableCounts: await tableCounts(client),
                migration: await migrationState(client),
              }))),
              files: await fileStats(filesTarget!),
            }),
          );
          checked.state = restored;
          const mismatches = drillMismatches(manifest, restored);
          if (mismatches.length)
            throw new OpsError("DRILL_MISMATCH", mismatches.join(", "));
        },
      },
    );
    if (report.replay.purgeFailed)
      throw new OpsError(
        "DRILL_MISMATCH",
        `replay purge failed ${report.replay.purgeFailed}`,
      );
    const state = checked.state;
    result = {
      bundle: report.manifest.bundle,
      targetDb,
      tables: Object.keys(state?.tableCounts ?? {}).length,
      rows: Object.values(state?.tableCounts ?? {}).reduce((a, b) => a + b, 0),
      files: state?.files.count ?? 0,
      fileBytes: state?.files.bytes ?? 0,
      journalLive: report.journal.live,
      journalBundle: report.journal.bundle,
      journalMalformed: report.journal.malformed,
      ...replayResult(report.replay),
    };
    await failAs("RESTORE_FAILED", "throwaway cleanup", cleanup);
    if (await databaseExists(config.databaseUrl, targetDb))
      throw new OpsError("RESTORE_FAILED", "throwaway database still present");
    result.durationMs = Date.now() - started;
    return {
      status: "succeeded",
      result,
      recorded: await recordOpsRun(config.databaseUrl, {
        jobKey: OPS_JOB_KEYS.drill,
        runKey,
        status: "succeeded",
        startedAt: now,
        result,
      }),
    };
  } catch (error) {
    const opsError =
      error instanceof OpsError
        ? error
        : new OpsError("RESTORE_FAILED", "unexpected failure", {
            cause: error,
          });
    result.durationMs = Date.now() - started;
    return {
      status: "failed",
      error: opsError,
      result,
      recorded: await recordOpsRun(config.databaseUrl, {
        jobKey: OPS_JOB_KEYS.drill,
        runKey,
        status: "failed",
        startedAt: now,
        result,
        errorCode: opsError.code,
      }),
    };
  } finally {
    await cleanup().catch(() => undefined);
  }
}

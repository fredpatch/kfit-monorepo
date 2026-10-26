import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../db/schema/index.js";
import { PrivateDocumentStorage } from "../modules/documents/services/document-storage.service.js";
import { DrizzlePrivacyRepository } from "../modules/privacy/repositories/privacy.repository.js";
import { createPrivacyJournal, parseJournalLine, PRIVACY_JOURNAL_FILE, type PrivacyJournal } from "../modules/privacy/services/privacy-journal.js";
import { runPrivacyReplay, type PrivacyReplayCounts } from "../modules/privacy/services/privacy-replay.js";
import { decryptFileTo } from "./backup-crypto.js";
import type { BackupManifest } from "./backup-manifest.js";
import { assertPgClient } from "./backup.js";
import { directoryIsEmpty, readManifest, verifyParts } from "./bundle-store.js";
import { requireDir, type OpsConfig } from "./ops-config.js";
import { createDatabase, databaseExists, databaseIsEmpty, databaseUrlFor, withClient } from "./ops-database.js";
import { failAs, OpsError } from "./ops-errors.js";
import { createPgTools, tarExtract, type Spawned } from "./ops-process.js";
import { checkRestoreTarget } from "./restore-target.js";
import { unionJournal } from "./journal-union.js";
import { OPS_JOB_KEYS, recordOpsRun, type OpsOutcome, type OpsRunResult } from "./run-records.js";

/** S7.4b B6.5: replay from the backup time minus this margin, so an event executed while pg_dump ran is replayed too. */
export const REPLAY_SAFETY_MARGIN_MS = 24 * 60 * 60 * 1000;

/** Where B6.4 puts the bundle journal: merged into the live journal (restore), or only read with it (drill, nothing written). */
export type JournalMode = { kind: "merge-live"; journalDir: string } | { kind: "read-only"; journalDir: string | null };
export type RestoreRequest = { bundleDir: string; targetDb: string; filesTarget: string; confirmOverwrite: boolean; journal: JournalMode; auditHashPepper: string };
export type RestoreReport = {
  manifest: BackupManifest;
  targetUrl: string;
  journal: { live: number; bundle: number; appended: number; malformed: number };
  replay: PrivacyReplayCounts;
};

async function decryptInto(file: string, key: Buffer, part: BackupManifest["parts"]["database"], tool: Spawned, detail: string): Promise<void> {
  const [decrypted, exited] = await Promise.allSettled([decryptFileTo(file, key, part, tool.stdin), tool.done]);
  if (exited.status === "rejected" || decrypted.status === "rejected") throw new OpsError("RESTORE_FAILED", detail, { cause: exited.status === "rejected" ? exited.reason : (decrypted as PromiseRejectedResult).reason });
}

async function decryptToText(file: string, key: Buffer, part: BackupManifest["parts"]["journal"]): Promise<string> {
  const chunks: Buffer[] = [];
  await decryptFileTo(file, key, part, new Writable({ write(chunk: Buffer, _encoding, callback) { chunks.push(chunk); callback(); } }));
  return Buffer.concat(chunks).toString("utf8");
}

const readText = (file: string) => readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; });

/** B6.4: appends only the missing lines, fsynced; the existing journal content is never rewritten. */
async function appendToLiveJournal(journalDir: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await mkdir(journalDir, { recursive: true });
  const handle = await open(path.join(journalDir, PRIVACY_JOURNAL_FILE), "a");
  try { await handle.write(lines.join("")); await handle.sync(); } finally { await handle.close(); }
}

/** Journal for the drill: live ∪ bundle in memory, never appended to. */
function readOnlyJournal(text: string): PrivacyJournal {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const events = lines.map(parseJournalLine).filter((event) => event !== null);
  return { append: async () => { throw new Error("read-only drill journal"); }, read: async () => ({ events, malformed: lines.length - events.length }) };
}

/**
 * S7.4 D9 / S7.4b B6 core, shared by ops:restore and the drill. Order: manifest MAC and key, every part hash, target guard;
 * only then create the database, pg_restore, untar, journal, replay. Throws OpsError.
 */
export type RestoreHooks = {
  /** pg_restore succeeded: the target now holds scheduled_job_runs (B8 records there). */
  onTargetRestored?: (targetUrl: string) => void;
  /** Database and files restored, replay not run yet (B7 drill checks). */
  beforeReplay?: (restored: { manifest: BackupManifest; targetUrl: string }) => Promise<void>;
};

export async function restoreBundle(config: OpsConfig, request: RestoreRequest, now: Date, hooks: RestoreHooks = {}): Promise<RestoreReport> {
  const manifest = await readManifest(request.bundleDir, config.key);
  await verifyParts(request.bundleDir, manifest);

  const targetUrl = databaseUrlFor(config.databaseUrl, request.targetDb);
  const exists = await failAs("RESTORE_FAILED", "database unreachable", () => databaseExists(config.databaseUrl, request.targetDb));
  const guard = checkRestoreTarget({
    targetDb: request.targetDb, confirmOverwrite: request.confirmOverwrite,
    databaseEmpty: !exists || await failAs("RESTORE_FAILED", "target unreadable", () => databaseIsEmpty(config.databaseUrl, request.targetDb)),
    filesEmpty: await failAs("RESTORE_FAILED", "files target unreadable", () => directoryIsEmpty(request.filesTarget)),
  });
  if (guard) throw new OpsError(guard.code, guard.detail);

  const tools = createPgTools(config.pg, config.databaseUrl);
  const pgRestore = await failAs("RESTORE_FAILED", "pg_restore unavailable", () => tools.version("pg_restore"));
  await failAs("RESTORE_FAILED", "database unreachable", () => withClient(config.databaseUrl, (client) => assertPgClient(pgRestore, client)));

  if (!exists) await failAs("RESTORE_FAILED", "create database", () => createDatabase(config.databaseUrl, request.targetDb));
  const clean = exists && !(await databaseIsEmpty(config.databaseUrl, request.targetDb));
  const part = (name: keyof BackupManifest["parts"]) => path.join(request.bundleDir, manifest.parts[name].file);
  await decryptInto(part("database"), config.key, manifest.parts.database, tools.restore(request.targetDb, clean), "pg_restore failed");
  hooks.onTargetRestored?.(targetUrl);

  await failAs("RESTORE_FAILED", "files target", () => mkdir(request.filesTarget, { recursive: true }));
  await decryptInto(part("files"), config.key, manifest.parts.files, tarExtract(request.filesTarget), "tar extract failed");

  const bundleJournal = await failAs("RESTORE_FAILED", "journal part", () => decryptToText(part("journal"), config.key, manifest.parts.journal));
  const liveFile = request.journal.journalDir ? path.join(request.journal.journalDir, PRIVACY_JOURNAL_FILE) : null;
  const liveJournal = liveFile ? await failAs("RESTORE_FAILED", "live journal unreadable", () => readText(liveFile)) : "";
  const union = unionJournal(liveJournal, bundleJournal);
  let journal: PrivacyJournal;
  if (request.journal.kind === "merge-live") {
    const journalDir = request.journal.journalDir;
    await failAs("RESTORE_FAILED", "live journal append", () => appendToLiveJournal(journalDir, union.append));
    journal = createPrivacyJournal(journalDir)!;
  } else {
    journal = readOnlyJournal(liveJournal + union.append.join(""));
  }

  await hooks.beforeReplay?.({ manifest, targetUrl });
  const pool = new pg.Pool({ connectionString: targetUrl, max: 2 });
  try {
    const storage = new PrivateDocumentStorage({ root: request.filesTarget });
    const replay = await failAs("REPLAY_FAILED", "privacy replay", () => runPrivacyReplay({
      repository: new DrizzlePrivacyRepository(drizzle(pool, { schema }), { auditHashPepper: request.auditHashPepper }),
      journal,
      removeStoredObject: (key) => storage.remove(key),
    }, new Date(new Date(manifest.createdAt).getTime() - REPLAY_SAFETY_MARGIN_MS), now));
    return { manifest, targetUrl, journal: union.counts, replay };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export const replayResult = (replay: PrivacyReplayCounts): OpsRunResult => Object.fromEntries(Object.entries(replay).map(([key, value]) => [`replay${key[0]!.toUpperCase()}${key.slice(1)}`, value]));

/** S7.4b B6 + B8: ops:restore. The run row goes to the restored target once pg_restore succeeded, otherwise to the source database. */
export async function runRestore(config: OpsConfig, request: Omit<RestoreRequest, "journal">, now: Date = new Date()): Promise<OpsOutcome> {
  const started = Date.now(), runKey = path.basename(path.resolve(request.bundleDir));
  let recordUrl = config.databaseUrl;
  try {
    const journalDir = requireDir(config.journalDir, "KFIT_PRIVACY_JOURNAL_DIR");
    const report = await restoreBundle(config, { ...request, journal: { kind: "merge-live", journalDir } }, now, { onTargetRestored: (targetUrl) => { recordUrl = targetUrl; } });
    const result: OpsRunResult = {
      bundle: report.manifest.bundle, targetDb: request.targetDb, durationMs: Date.now() - started,
      journalLive: report.journal.live, journalBundle: report.journal.bundle, journalAppended: report.journal.appended, journalMalformed: report.journal.malformed,
      ...replayResult(report.replay),
    };
    return { status: "succeeded", result, recorded: await recordOpsRun(recordUrl, { jobKey: OPS_JOB_KEYS.restore, runKey, status: "succeeded", startedAt: now, result }) };
  } catch (error) {
    const opsError = error instanceof OpsError ? error : new OpsError("RESTORE_FAILED", "unexpected failure", { cause: error });
    const result: OpsRunResult = { bundle: runKey, targetDb: request.targetDb, durationMs: Date.now() - started };
    const recorded = await recordOpsRun(recordUrl, { jobKey: OPS_JOB_KEYS.restore, runKey, status: "failed", startedAt: now, result, errorCode: opsError.code })
      || (recordUrl !== config.databaseUrl && await recordOpsRun(config.databaseUrl, { jobKey: OPS_JOB_KEYS.restore, runKey, status: "failed", startedAt: now, result, errorCode: opsError.code }));
    return { status: "failed", error: opsError, result, recorded };
  }
}

import path from "node:path";
import { resolveConfiguredPath } from "../config/paths.js";
import { loadAuthConfig } from "../modules/auth/config/auth.config.js";
import { bundleName } from "./backup-manifest.js";
import { runBackup } from "./backup.js";
import { loadOpsConfig } from "./ops-config.js";
import { OpsError } from "./ops-errors.js";
import { runRestore } from "./restore.js";
import { runRestoreDrill } from "./restore-drill.js";
import { OPS_JOB_KEYS, recordOpsRun, type OpsOutcome } from "./run-records.js";

export type OpsJob = keyof typeof OPS_JOB_KEYS;
export const OPS_USAGE: Record<OpsJob, string> = {
  backup: "npm run ops:backup",
  restore:
    "npm run ops:restore -- --bundle <dir> --target-db <name> --files-target <dir> [--confirm-overwrite]",
  drill: "npm run ops:restore-drill [-- --bundle <dir>]",
};

const option = (argv: string[], name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
/** FIX-03 F1: --bundle and --files-target resolve from the repository root, like the configured directories. */
const pathOption = (argv: string[], name: string) =>
  resolveConfiguredPath(option(argv, name)) ?? undefined;

function auditHashPepper(env: NodeJS.ProcessEnv): string {
  try {
    return loadAuthConfig(env).auditHashPepper;
  } catch {
    throw new OpsError(
      "ENV_INVALID",
      "AUTH_OTP_PEPPER / AUTH_AUDIT_HASH_PEPPER (replay audit)",
    );
  }
}

async function execute(
  job: OpsJob,
  argv: string[],
  env: NodeJS.ProcessEnv,
  now: Date,
): Promise<OpsOutcome> {
  try {
    const config = loadOpsConfig(env);
    if (job === "backup") return await runBackup(config, now);
    const bundle = pathOption(argv, "--bundle");
    if (job === "drill")
      return await runRestoreDrill(
        config,
        {
          ...(bundle ? { bundleDir: bundle } : {}),
          auditHashPepper: auditHashPepper(env),
        },
        now,
      );
    const targetDb = option(argv, "--target-db"),
      filesTarget = pathOption(argv, "--files-target");
    if (!bundle || !targetDb || !filesTarget)
      throw new OpsError("ENV_INVALID", `usage: ${OPS_USAGE.restore}`);
    return await runRestore(
      config,
      {
        bundleDir: bundle,
        targetDb,
        filesTarget,
        confirmOverwrite: argv.includes("--confirm-overwrite"),
        auditHashPepper: auditHashPepper(env),
      },
      now,
    );
  } catch (error) {
    // Configuration refused before the job started: still one row when the source database is reachable (B8).
    const opsError =
      error instanceof OpsError
        ? error
        : new OpsError("ENV_INVALID", "unexpected configuration failure", {
            cause: error,
          });
    const bundle = pathOption(argv, "--bundle");
    const runKey =
      job === "backup"
        ? bundleName(now)
        : job === "restore"
          ? path.basename(bundle ?? "unknown")
          : `config:${now.toISOString()}`;
    const recorded = env.DATABASE_URL
      ? await recordOpsRun(env.DATABASE_URL, {
          jobKey: OPS_JOB_KEYS[job],
          runKey,
          status: "failed",
          startedAt: now,
          result: {},
          errorCode: opsError.code,
        })
      : false;
    return { status: "failed", error: opsError, result: {}, recorded };
  }
}

/** Prints one JSON line (counts only) and returns the exit code: 0 only when the run succeeded and its row was written. */
export async function opsMain(
  job: OpsJob,
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const outcome = await execute(job, argv, env, new Date());
  const failure =
    outcome.status === "failed"
      ? { errorCode: outcome.error.code, detail: outcome.error.detail }
      : {};
  console.log(
    JSON.stringify({
      job: OPS_JOB_KEYS[job],
      status: outcome.status,
      ...failure,
      recorded: outcome.recorded,
      ...outcome.result,
      ...outcome.notes,
    }),
  );
  if (outcome.status === "failed")
    console.error(
      `✖ ${OPS_JOB_KEYS[job]} failed: ${outcome.error.code} (${outcome.error.detail})`,
    );
  if (!outcome.recorded)
    console.error(
      `✖ ${OPS_JOB_KEYS[job]}: run not recorded in scheduled_job_runs (database unreachable)`,
    );
  return outcome.status === "succeeded" && outcome.recorded ? 0 : 1;
}

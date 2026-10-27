import { withClient } from "./ops-database.js";
import type { OpsError, OpsErrorCode } from "./ops-errors.js";

/** S7.4 D12 / S7.4b B8: every ops run leaves one scheduled_job_runs row (job_key, run_key unique). */
export const OPS_JOB_KEYS = { backup: "ops.backup", restore: "ops.restore", drill: "ops.restore_drill" } as const;
/** ROLE-01 R5: staff account scripts (counts only). */
export const USER_OPS_JOB_KEYS = { createUser: "ops.create_user", setRole: "ops.set_role" } as const;
export type OpsJobKey = (typeof OPS_JOB_KEYS)[keyof typeof OPS_JOB_KEYS] | (typeof USER_OPS_JOB_KEYS)[keyof typeof USER_OPS_JOB_KEYS];
/** Counts, sizes, durations and the bundle name only: no path, host or key material. */
export type OpsRunResult = Record<string, number | string>;
/** What a script prints and its exit code: 0 only when the run succeeded and its row was written (B8). */
export type OpsOutcome = ({ status: "succeeded" } | { status: "failed"; error: OpsError }) & {
  result: OpsRunResult;
  recorded: boolean;
  /** Printed only, never recorded (tool versions, pg access mode). */
  notes?: Record<string, string>;
};
export type OpsRunRecord =
  | { jobKey: OpsJobKey; runKey: string; status: "running"; startedAt: Date }
  | { jobKey: OpsJobKey; runKey: string; status: "succeeded"; startedAt: Date; result: OpsRunResult }
  | { jobKey: OpsJobKey; runKey: string; status: "failed"; startedAt: Date; result: OpsRunResult; errorCode: OpsErrorCode };

/**
 * Upsert on (job_key, run_key): running → succeeded | failed updates the same row; a new run of the same key (retry, or a
 * final-only write over an earlier final) counts as attempt + 1. Returns false when the database is unreachable.
 */
export async function recordOpsRun(databaseUrl: string, record: OpsRunRecord): Promise<boolean> {
  const finished = record.status === "running" ? null : new Date();
  const result = record.status === "running" ? null : JSON.stringify(record.result);
  const errorCode = record.status === "failed" ? record.errorCode : null;
  try {
    await withClient(databaseUrl, (client) => client.query(
      `insert into scheduled_job_runs (job_key, run_key, status, started_at, finished_at, result_json, error_code)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)
       on conflict (job_key, run_key) do update set status = excluded.status, started_at = excluded.started_at, finished_at = excluded.finished_at,
         result_json = excluded.result_json, error_code = excluded.error_code,
         attempt = case when excluded.status = 'running' or scheduled_job_runs.status <> 'running' then scheduled_job_runs.attempt + 1 else scheduled_job_runs.attempt end`,
      [record.jobKey, record.runKey, record.status, record.startedAt, finished, result, errorCode]));
    return true;
  } catch {
    return false;
  }
}

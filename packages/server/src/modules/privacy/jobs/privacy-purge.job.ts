import { businessDateKey } from "@kfit/shared";
import type { NotificationJobDefinition } from "../../notifications/jobs/scheduled-job.runner.js";
import type {
  DrizzlePrivacyRepository,
  RemoveStoredObject,
} from "../repositories/privacy.repository.js";
import type { DrizzleRetentionRepository } from "../repositories/retention.repository.js";
import {
  PURGE_BATCH_SIZE,
  PURGE_JOB_CRON,
  PURGE_JOB_KEY,
  PURGE_TIMEZONE,
} from "../services/privacy.policy.js";

/** RET-01 R6: a retention step threw; its committed batches and the other steps stay, the run is marked failed. */
export const RETENTION_STEP_FAILED = "RETENTION_STEP_FAILED";

/**
 * D3d: daily 03:00 Africa/Libreville, one logical run per business date (S7.2 runner: advisory lock + scheduled_job_runs),
 * batch of 50. RET-01 T5: then the retention steps (e-mail content, resolved notifications, security logs). Result and
 * audit hold counts only.
 */
export function privacyPurgeJob(
  repository: Pick<DrizzlePrivacyRepository, "purgeDue" | "recordPurgeRun">,
  removeStoredObject: RemoveStoredObject,
  retention: Pick<DrizzleRetentionRepository, "run">,
  clock: () => Date = () => new Date(),
): NotificationJobDefinition {
  return {
    jobKey: PURGE_JOB_KEY,
    cron: PURGE_JOB_CRON,
    timezone: PURGE_TIMEZONE,
    windowMs: 86_400_000,
    runKey: businessDateKey,
    async work() {
      const files = await repository.purgeDue(
        clock(),
        PURGE_BATCH_SIZE,
        removeStoredObject,
      );
      const retained = await retention.run(clock(), PURGE_BATCH_SIZE);
      const result = { ...files, ...retained };
      await repository.recordPurgeRun(result);
      if (retained.retentionStepsFailed > 0)
        throw new Error(RETENTION_STEP_FAILED);
      return result;
    },
  };
}

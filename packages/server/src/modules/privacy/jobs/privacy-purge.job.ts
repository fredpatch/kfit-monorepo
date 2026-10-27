import { businessDateKey } from "@kfit/shared";
import type { NotificationJobDefinition } from "../../notifications/jobs/scheduled-job.runner.js";
import type {
  DrizzlePrivacyRepository,
  RemoveStoredObject,
} from "../repositories/privacy.repository.js";
import {
  PURGE_BATCH_SIZE,
  PURGE_JOB_CRON,
  PURGE_JOB_KEY,
  PURGE_TIMEZONE,
} from "../services/privacy.policy.js";

/**
 * D3d: daily 03:00 Africa/Libreville, one logical run per business date (S7.2 runner: advisory lock + scheduled_job_runs),
 * batch of 50. Result and audit hold counts only.
 */
export function privacyPurgeJob(
  repository: Pick<DrizzlePrivacyRepository, "purgeDue" | "recordPurgeRun">,
  removeStoredObject: RemoveStoredObject,
  clock: () => Date = () => new Date(),
): NotificationJobDefinition {
  return {
    jobKey: PURGE_JOB_KEY,
    cron: PURGE_JOB_CRON,
    timezone: PURGE_TIMEZONE,
    windowMs: 86_400_000,
    runKey: businessDateKey,
    async work() {
      const result = await repository.purgeDue(
        clock(),
        PURGE_BATCH_SIZE,
        removeStoredObject,
      );
      await repository.recordPurgeRun(result);
      return result;
    },
  };
}

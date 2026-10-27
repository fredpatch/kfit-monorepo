/*
 * S7.4b B8 / S7.4 D12: closed list of ops error codes, recorded in scheduled_job_runs.error_code and printed on failure.
 * ENV_INVALID covers B10 misconfiguration (missing or overlapping directories, unknown BACKUP_PG_MODE).
 */
export const opsErrorCodes = [
  "BACKUP_KEY_INVALID",
  "PG_CLIENT_TOO_OLD",
  "DUMP_FAILED",
  "ENCRYPT_FAILED",
  "VERIFY_FAILED",
  "SECONDARY_COPY_FAILED",
  "ROTATION_FAILED",
  "MANIFEST_INVALID",
  "TARGET_FORBIDDEN",
  "TARGET_NOT_EMPTY",
  "RESTORE_FAILED",
  "REPLAY_FAILED",
  "DRILL_MISMATCH",
  "ENV_INVALID",
  // ROLE-01 R5: ops:create-user / ops:set-role.
  "SUPERADMIN_ONLY_VIA_BOOTSTRAP",
  "USER_EMAIL_TAKEN",
  "USER_NOT_FOUND",
  "USER_WRITE_FAILED",
] as const;
export type OpsErrorCode = (typeof opsErrorCodes)[number];

/** `detail` is printed: key names, counts and part names only, never a path, host, credential or subject id. */
export class OpsError extends Error {
  constructor(readonly code: OpsErrorCode, readonly detail: string, options?: { cause?: unknown }) {
    super(`${code} (${detail})`, options);
    this.name = "OpsError";
  }
}

/** Runs `work`, turning any non-OpsError into `code` so every failure carries a listed code. */
export async function failAs<T>(code: OpsErrorCode, detail: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OpsError) throw error;
    throw new OpsError(code, detail, { cause: error });
  }
}

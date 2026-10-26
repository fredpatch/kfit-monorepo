import { DEV_DATABASE_NAME, INTEGRATION_TEST_DATABASE_NAME } from "../db/database-target.js";

/** S7.4 D9 / S7.4b B6.2: never restored into, whatever the flags (dev drills use kfit_restore_*). */
export const FORBIDDEN_RESTORE_DATABASES = [DEV_DATABASE_NAME, INTEGRATION_TEST_DATABASE_NAME] as const;
/** B7: throwaway drill databases. */
export const DRILL_DATABASE_PREFIX = "kfit_restore_";
/** Unquoted PostgreSQL identifier: the name is interpolated into CREATE/DROP DATABASE, so nothing else is accepted. */
export const RESTORE_DATABASE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export type RestoreTargetState = { targetDb: string; databaseEmpty: boolean; filesEmpty: boolean; confirmOverwrite: boolean };

/** B6.2, before anything is created or written. Null = allowed. */
export function checkRestoreTarget(state: RestoreTargetState): { code: "TARGET_FORBIDDEN" | "TARGET_NOT_EMPTY"; detail: string } | null {
  if (!RESTORE_DATABASE_NAME_PATTERN.test(state.targetDb)) return { code: "TARGET_FORBIDDEN", detail: "target database name must be a lowercase identifier" };
  if ((FORBIDDEN_RESTORE_DATABASES as readonly string[]).includes(state.targetDb)) return { code: "TARGET_FORBIDDEN", detail: `database ${state.targetDb}` };
  if (state.confirmOverwrite) return null;
  if (!state.databaseEmpty) return { code: "TARGET_NOT_EMPTY", detail: "target database has tables (--confirm-overwrite)" };
  if (!state.filesEmpty) return { code: "TARGET_NOT_EMPTY", detail: "files target is not empty (--confirm-overwrite)" };
  return null;
}

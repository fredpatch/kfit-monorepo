import { DEV_DATABASE_NAME, localDatabaseName } from "../../../db/database-target.js";

/** TEST-01 D4: the only database dev tools may touch: local kfit_dev on 5433 (never kfit_test, 5432 or a remote host). */
export const DEV_TOOLS_DATABASE_NAME = DEV_DATABASE_NAME;

/** TEST-01 D4, second lock after dev-app-only mounting: checked on every request. */
export function devToolsAvailable(env: { NODE_ENV?: string | undefined; DATABASE_URL?: string | undefined }): boolean {
  return env.NODE_ENV !== "production" && localDatabaseName(env.DATABASE_URL) === DEV_TOOLS_DATABASE_NAME;
}

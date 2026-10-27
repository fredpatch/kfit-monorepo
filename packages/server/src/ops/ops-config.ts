import path from "node:path";
import { REPO_ROOT, resolveConfiguredPath } from "../config/paths.js";
import { resolvePrivateStorageRoot } from "../modules/documents/services/document-storage.service.js";
import { PRIVACY_JOURNAL_DIR_ENV } from "../modules/privacy/services/privacy-journal.js";
import { BACKUP_KEY_ENV, parseBackupKey } from "./backup-crypto.js";
import { OpsError } from "./ops-errors.js";

/** S7.4b B2: how pg_dump / pg_restore are reached. docker = `docker compose exec` into the postgres service (production compose). */
export const BACKUP_PG_MODES = ["docker", "native"] as const;
export type BackupPgMode = (typeof BACKUP_PG_MODES)[number];
export const DEFAULT_BACKUP_PG_SERVICE = "postgres";

/** FIX-03 F2: ops paths refused when relative under NODE_ENV=production. */
export const OPS_ABSOLUTE_PATH_ENV = [
  "BACKUP_DIR",
  "BACKUP_SECONDARY_DIR",
  "BACKUP_COMPOSE_FILE",
] as const;
export type PgAccess = {
  mode: BackupPgMode;
  composeFile: string | null;
  service: string;
  composeDir: string;
};
export type OpsConfig = {
  key: Buffer;
  databaseUrl: string;
  storageRoot: string;
  journalDir: string | null;
  pg: PgAccess;
  backupDir: string | null;
  secondaryDir: string | null;
};

/** True when `child` is `parent` or below it. */
export function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(
    process.platform === "win32" ? parent.toLowerCase() : parent,
    process.platform === "win32" ? child.toLowerCase() : child,
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

/**
 * S7.4b B10: the ops scripts validate their own environment (the API does not need BACKUP_*). Relative directories resolve
 * against the repository root (FIX-03 F1); in production the backup paths must be absolute (FIX-03 F2). Errors name keys only.
 */
export function loadOpsConfig(
  env: NodeJS.ProcessEnv,
  options: { composeDir?: string } = {},
): OpsConfig {
  const key = parseBackupKey(env[BACKUP_KEY_ENV]);
  if (!key)
    throw new OpsError(
      "BACKUP_KEY_INVALID",
      `${BACKUP_KEY_ENV} must be 64 hex characters`,
    );
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new OpsError("ENV_INVALID", "DATABASE_URL missing");
  const mode = env.BACKUP_PG_MODE?.trim() || "docker";
  if (!(BACKUP_PG_MODES as readonly string[]).includes(mode))
    throw new OpsError(
      "ENV_INVALID",
      "BACKUP_PG_MODE must be docker or native",
    );
  if (env.NODE_ENV === "production") {
    const relative = OPS_ABSOLUTE_PATH_ENV.filter(
      (name) => env[name]?.trim() && !path.isAbsolute(env[name]!.trim()),
    );
    if (relative.length)
      throw new OpsError(
        "ENV_INVALID",
        `${relative.join(", ")} must be absolute in production`,
      );
  }
  const resolve = (value: string | undefined) => resolveConfiguredPath(value);
  const storageRoot = resolvePrivateStorageRoot(env.PRIVATE_STORAGE_ROOT);
  const journalDir = resolve(env[PRIVACY_JOURNAL_DIR_ENV]);
  const backupDir = resolve(env.BACKUP_DIR),
    secondaryDir = resolve(env.BACKUP_SECONDARY_DIR);
  for (const [name, dir] of [
    ["BACKUP_DIR", backupDir],
    ["BACKUP_SECONDARY_DIR", secondaryDir],
  ] as const) {
    if (!dir) continue;
    if (isWithin(dir, storageRoot) || isWithin(storageRoot, dir))
      throw new OpsError(
        "ENV_INVALID",
        `${name} overlaps PRIVATE_STORAGE_ROOT`,
      );
    if (journalDir && (isWithin(dir, journalDir) || isWithin(journalDir, dir)))
      throw new OpsError(
        "ENV_INVALID",
        `${name} overlaps ${PRIVACY_JOURNAL_DIR_ENV}`,
      );
  }
  if (
    backupDir &&
    secondaryDir &&
    (isWithin(backupDir, secondaryDir) || isWithin(secondaryDir, backupDir))
  ) {
    throw new OpsError(
      "ENV_INVALID",
      "BACKUP_DIR and BACKUP_SECONDARY_DIR must be distinct, not nested",
    );
  }
  return {
    key,
    databaseUrl,
    storageRoot,
    journalDir,
    backupDir,
    secondaryDir,
    pg: {
      mode: mode as BackupPgMode,
      composeFile: resolve(env.BACKUP_COMPOSE_FILE),
      service: env.BACKUP_PG_SERVICE?.trim() || DEFAULT_BACKUP_PG_SERVICE,
      composeDir: options.composeDir ?? REPO_ROOT,
    },
  };
}

export function requireDir(
  value: string | null,
  name: "BACKUP_DIR" | "BACKUP_SECONDARY_DIR" | typeof PRIVACY_JOURNAL_DIR_ENV,
): string {
  if (!value) throw new OpsError("ENV_INVALID", `${name} missing`);
  return value;
}

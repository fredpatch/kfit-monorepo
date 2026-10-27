import { randomUUID } from "node:crypto";
import { rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import type { db as appDb } from "../db/client.js";
import { DEV_DATABASE_NAME, INTEGRATION_TEST_DATABASE_NAME, LOCAL_DATABASE_HOSTS, LOCAL_DATABASE_PORT } from "../db/database-target.js";
import { consentDefinitions } from "../db/schema/onboarding.js";
import { PRIVACY_JOURNAL_DIR_ENV } from "../modules/privacy/services/privacy-journal.js";
import { evaluateRuntimeFloor } from "../security/security-floor.js";

/*
 * S7.4 D2 (Gate 1 approved 2026-10-26): the production API refuses to start until every check passes. All failures are
 * collected and reported together; details name keys, codes and counts only, never a value.
 */

export const productionGuardCodes = [
  "SECURITY_FLOOR",
  "ENV_MISSING",
  "ENV_WEAK_SECRET",
  "APP_BASE_URL_NOT_HTTPS",
  "DATABASE_TARGET_FORBIDDEN",
  "PRIVACY_JOURNAL_UNAVAILABLE",
  "PATH_NOT_ABSOLUTE",
  "PRIVACY_JOBS_DISABLED",
  "DEMO_CONSENT_PUBLISHED",
] as const;
export type ProductionGuardCode = (typeof productionGuardCodes)[number];
export type ProductionGuardFailure = { code: ProductionGuardCode; detail: string };
export type ProductionGuardResult = { ok: true; warnings: string[] } | { ok: false; failures: ProductionGuardFailure[]; warnings: string[] };

/** S7.4 D2: secrets and peppers (loadAuthConfig) — each needs ≥ PRODUCTION_SECRET_MIN_LENGTH characters. */
export const PRODUCTION_SECRET_ENV = ["AUTH_OTP_PEPPER", "AUTH_AUDIT_HASH_PEPPER", "AUTH_REFRESH_TOKEN_PEPPER", "AUTH_ACCESS_TOKEN_SECRET", "AUTH_RECOVERY_TOKEN_SECRET"] as const;
export const PRODUCTION_SECRET_MIN_LENGTH = 32;
/** S7.4 D2: every key the production runtime reads without a safe default (grep of src, 2026-10-26). */
export const PRODUCTION_REQUIRED_ENV = [
  "DATABASE_URL",
  "KFIT_APP_BASE_URL",
  "PRIVATE_STORAGE_ROOT",
  PRIVACY_JOURNAL_DIR_ENV,
  "CLAMAV_HOST",
  "CLAMAV_PORT",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  ...PRODUCTION_SECRET_ENV,
] as const;
/** FIX-03 F2: directories the production API must receive as absolute paths (a relative one depends on where it is started). */
export const PRODUCTION_ABSOLUTE_PATH_ENV = ["PRIVATE_STORAGE_ROOT", PRIVACY_JOURNAL_DIR_ENV] as const;
/** S7.4 D2: an unedited example or a dev value counts as missing (case-insensitive substring); "change_me" matches the existing .env.*.example files. */
export const PLACEHOLDER_PATTERNS = ["change-me", "changeme", "change_me", "example", "dev-", "xxx", "todo"] as const;
/** S7.3 D9: demo consent texts must never be live in production; matched without case or accents. */
export const DEMO_CONSENT_TITLE_MARKER = "demonstration";
export const PUBLISHED_CONSENT_STATUS = "published";

const isPlaceholder = (value: string) => PLACEHOLDER_PATTERNS.some((pattern) => value.toLowerCase().includes(pattern));
const foldAccents = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export const isDemoConsentTitle = (title: string) => foldAccents(title).includes(DEMO_CONSENT_TITLE_MARKER);

/** Pure checks over the process environment and the Node version. */
export function evaluateProductionEnv(env: NodeJS.ProcessEnv, version: string): { failures: ProductionGuardFailure[]; warnings: string[] } {
  const failures: ProductionGuardFailure[] = [];
  const warnings: string[] = [];

  const floor = evaluateRuntimeFloor(version);
  if (!floor.ok) failures.push({ code: "SECURITY_FLOOR", detail: floor.failures.map((f) => `${f.id}:${f.reason}`).join(", ") });

  const missing = PRODUCTION_REQUIRED_ENV.filter((key) => { const value = env[key]?.trim(); return !value || isPlaceholder(value); });
  if (missing.length) failures.push({ code: "ENV_MISSING", detail: missing.join(", ") });
  const weak = PRODUCTION_SECRET_ENV.filter((key) => !missing.includes(key) && (env[key]?.trim().length ?? 0) < PRODUCTION_SECRET_MIN_LENGTH);
  if (weak.length) failures.push({ code: "ENV_WEAK_SECRET", detail: weak.join(", ") });
  const relative = PRODUCTION_ABSOLUTE_PATH_ENV.filter((key) => !missing.includes(key) && !path.isAbsolute(env[key]!.trim()));
  if (relative.length) failures.push({ code: "PATH_NOT_ABSOLUTE", detail: relative.join(", ") });

  const baseUrl = env.KFIT_APP_BASE_URL?.trim();
  if (baseUrl && !missing.includes("KFIT_APP_BASE_URL")) {
    let https = false;
    try { https = new URL(baseUrl).protocol === "https:"; } catch { https = false; }
    if (!https) failures.push({ code: "APP_BASE_URL_NOT_HTTPS", detail: "KFIT_APP_BASE_URL" });
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl && !missing.includes("DATABASE_URL")) {
    const reason = forbiddenDatabaseTarget(databaseUrl);
    if (reason) failures.push({ code: "DATABASE_TARGET_FORBIDDEN", detail: reason });
  }

  if (env.KFIT_PRIVACY_JOBS === "off") failures.push({ code: "PRIVACY_JOBS_DISABLED", detail: "KFIT_PRIVACY_JOBS=off" });
  if (env.KFIT_NOTIFICATION_JOBS === "off") warnings.push("KFIT_NOTIFICATION_JOBS=off: notification jobs disabled in production");
  return { failures, warnings };
}

/** S7.4 D2: the dev and integration databases, or the local dev Docker port, are never a production target. */
export function forbiddenDatabaseTarget(databaseUrl: string): string | null {
  let target: URL;
  try { target = new URL(databaseUrl); } catch { return "DATABASE_URL unreadable"; }
  const name = decodeURIComponent(target.pathname.slice(1));
  if (name === DEV_DATABASE_NAME || name === INTEGRATION_TEST_DATABASE_NAME) return `database ${name}`;
  if (LOCAL_DATABASE_HOSTS.some((host) => host === target.hostname) && target.port === LOCAL_DATABASE_PORT) return `local dev port ${LOCAL_DATABASE_PORT}`;
  return null;
}

/** S7.4 D2/D3: the privacy journal directory exists, is a directory and accepts a write. */
export async function checkPrivacyJournalDir(dir: string | undefined): Promise<ProductionGuardFailure | null> {
  if (!dir?.trim()) return null; // reported as ENV_MISSING
  const fail = (detail: string): ProductionGuardFailure => ({ code: "PRIVACY_JOURNAL_UNAVAILABLE", detail });
  try {
    if (!(await stat(dir)).isDirectory()) return fail("not a directory");
  } catch {
    return fail("missing");
  }
  const probe = path.join(dir, `.kfit-write-probe-${randomUUID()}`);
  try {
    await writeFile(probe, "", { flag: "wx" });
    await rm(probe, { force: true });
    return null;
  } catch {
    return fail("not writable");
  }
}

/** S7.3 D9: count and consent types of currently published consent texts titled « DÉMONSTRATION ». */
export async function findPublishedDemoConsents(database: typeof appDb): Promise<ProductionGuardFailure | null> {
  const rows = await database.select({ consentType: consentDefinitions.consentType, title: consentDefinitions.title }).from(consentDefinitions)
    .where(and(eq(consentDefinitions.status, PUBLISHED_CONSENT_STATUS), isNull(consentDefinitions.retiredAt)));
  const demo = rows.filter((row) => isDemoConsentTitle(row.title));
  if (!demo.length) return null;
  return { code: "DEMO_CONSENT_PUBLISHED", detail: `${demo.length} published (${[...new Set(demo.map((row) => row.consentType))].sort().join(", ")})` };
}

/** `database` is loaded lazily: the DB client refuses to load without DATABASE_URL, and the env checks must still report. */
export async function runProductionGuards({ env, database, version = process.version }: { env: NodeJS.ProcessEnv; database: () => Promise<typeof appDb>; version?: string }): Promise<ProductionGuardResult> {
  const { failures, warnings } = evaluateProductionEnv(env, version);
  const missing = new Set(["ENV_MISSING", "PATH_NOT_ABSOLUTE"].flatMap((code) => failures.find((f) => f.code === code)?.detail.split(", ") ?? []));
  // A key already reported as missing, placeholder or relative is not probed again.
  if (!missing.has(PRIVACY_JOURNAL_DIR_ENV)) {
    const journal = await checkPrivacyJournalDir(env[PRIVACY_JOURNAL_DIR_ENV]);
    if (journal) failures.push(journal);
  }
  // Read-only, so it also runs on a forbidden target (the report then lists both). Unreachable = not verified = refused.
  if (!missing.has("DATABASE_URL")) {
    try {
      const demo = await findPublishedDemoConsents(await database());
      if (demo) failures.push(demo);
    } catch {
      failures.push({ code: "DEMO_CONSENT_PUBLISHED", detail: "not verified: database unreachable" });
    }
  }
  return failures.length ? { ok: false, failures, warnings } : { ok: true, warnings };
}

/** One message listing every failure code and its detail (no values). */
export const describeGuardFailures = (failures: ProductionGuardFailure[]) => failures.map((f) => `${f.code} (${f.detail})`).join("; ");

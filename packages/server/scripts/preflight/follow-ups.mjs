import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";
loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
let pool;
try {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "5433" ||
    target.pathname !== "/kfit_dev" ||
    target.search
  )
    throw new Error("Unsafe target");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const {
    rows: [counts],
  } = await pool.query(`SELECT
    (SELECT count(*)::int FROM follow_ups) AS follow_ups,
    (SELECT count(*)::int FROM service_policies WHERE follow_up_frequency_days IS NOT NULL AND follow_up_frequency_days<=0) AS invalid_policy_cadences,
    (SELECT count(*)::int FROM subscriptions WHERE follow_up_frequency_days_override IS NOT NULL AND follow_up_frequency_days_override<=0) AS invalid_overrides,
    (SELECT count(*)::int FROM subscription_pauses WHERE ended_at IS NOT NULL AND ended_at<started_at) AS invalid_pause_intervals,
    (SELECT count(*)::int FROM (SELECT service_id FROM service_policies WHERE variant_id IS NULL GROUP BY service_id HAVING count(*)>1) d) AS ambiguous_service_policies`);
  console.log(
    JSON.stringify({
      envFile: "root .env",
      localTargetVerified: true,
      ...counts,
    }),
  );
  if (Object.values(counts).some((value) => value !== 0)) {
    console.error(
      "Existing follow-ups or cadence inconsistencies require a reviewed reconciliation/backfill plan. No rows changed.",
    );
    process.exitCode = 1;
  } else
    console.log(
      "No existing follow-ups; new nullable timestamps and event table require no backfill. No rows changed.",
    );
} catch (error) {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : "UNAVAILABLE";
  console.error(
    `Follow-up preflight failed (${code}). Verify the local database/schema; no rows changed.`,
  );
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";
loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
let target;
try { target = new URL(process.env.DATABASE_URL ?? ""); }
catch { throw new Error("Lifecycle preflight requires a valid local database URL."); }
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433" || target.pathname !== "/kfit_dev" || target.search) {
  throw new Error("Lifecycle preflight requires the disposable local development database on port 5433.");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(`SELECT s.id, s.status, s.actual_start_date IS NOT NULL AS already_started,
    CASE WHEN v.duration_value IS NOT NULL OR v.duration_unit IS NOT NULL THEN 'variant' ELSE 'service' END AS duration_source,
    CASE WHEN v.duration_value IS NOT NULL OR v.duration_unit IS NOT NULL THEN v.duration_value ELSE c.default_duration_value END AS candidate_value,
    CASE WHEN v.duration_value IS NOT NULL OR v.duration_unit IS NOT NULL THEN v.duration_unit ELSE c.default_duration_unit END AS candidate_unit,
    s.variant_id IS NULL OR v.service_id = s.service_id AS variant_matches_service
    FROM subscriptions s JOIN services c ON c.id = s.service_id LEFT JOIN service_variants v ON v.id = s.variant_id ORDER BY s.id`);
  const invalid = result.rows.filter(row => !row.variant_matches_service || !(
    row.candidate_value === null && row.candidate_unit === null || Number.isInteger(row.candidate_value) && row.candidate_value > 0 && ["day", "week", "month"].includes(row.candidate_unit)));
  const pauses = await pool.query(`SELECT count(*)::int AS groups FROM (
    SELECT subscription_id FROM subscription_pauses WHERE ended_at IS NULL GROUP BY subscription_id HAVING count(*) > 1
  ) duplicates`);
  console.log(JSON.stringify({ envFile: "root .env", localTargetVerified: true, existingSubscriptions: result.rows.length,
    invalidDurationCandidates: invalid.length, multipleOpenPauseGroups: pauses.rows[0]?.groups, candidates: result.rows }));
  if (invalid.length || pauses.rows[0]?.groups) {
    console.error("Existing duration/pause inconsistencies require developer reconciliation. No rows changed."); process.exitCode = 1;
  } else if (result.rows.length) {
    console.log("No rows changed. Current catalogue candidates are not proof of historical sold duration. A backfill requires explicit developer approval.");
  }
} catch {
  console.error("Lifecycle preflight failed. Check the local database and schema state."); process.exitCode = 1;
} finally { await pool.end(); }

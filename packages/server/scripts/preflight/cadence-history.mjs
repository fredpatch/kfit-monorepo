import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";
let pool;
try {
  if (process.env.DATABASE_URL) throw new Error("Inherited database target");
  const env = config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
  if (env.error) throw new Error("Missing local environment");
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433" || target.pathname !== "/kfit_dev" || target.search) throw new Error("Unsafe database target");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect(); let counts;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: [row] } = await client.query(`SELECT
      (SELECT count(*)::int FROM subscriptions) AS subscriptions,
      (SELECT count(*)::int FROM subscriptions WHERE actual_start_date IS NOT NULL AND status IN ('active','paused','completion_due')) AS applicable_legacy_subscriptions,
      (SELECT count(*)::int FROM subscriptions WHERE follow_up_frequency_days_override IS NOT NULL) AS overrides,
      (SELECT count(*)::int FROM service_policies) AS policies,
      (SELECT count(*)::int FROM subscriptions WHERE follow_up_frequency_days_override<=0) AS invalid_overrides,
      (SELECT count(*)::int FROM service_policies WHERE follow_up_frequency_days<=0) AS invalid_policies,
      (SELECT count(*)::int FROM (SELECT service_id,variant_id FROM service_policies GROUP BY service_id,variant_id HAVING count(*)>1) p) AS duplicate_policy_scopes,
      (SELECT count(*)::int FROM pg_available_extensions WHERE name='btree_gist') AS btree_gist_available,
      (SELECT count(*)::int FROM pg_extension WHERE extname='btree_gist') AS btree_gist_installed,
      to_regclass('public.subscription_follow_up_cadence_history') IS NOT NULL AS history_table_exists`);
    counts = row;
    if (row.history_table_exists) { const result = await client.query("SELECT count(*)::int AS history_rows FROM subscription_follow_up_cadence_history"); counts.history_rows = result.rows[0].history_rows; }
    await client.query("COMMIT");
  } finally { client.release(); }
  console.log(JSON.stringify({ envFile: "root .env", localTargetVerified: true, readOnly: true, ...counts }));
  if (counts.invalid_overrides || counts.invalid_policies || counts.duplicate_policy_scopes || counts.history_table_exists) { console.error("Existing cadence/history evidence requires compatibility review. No rows changed."); process.exitCode = 1; }
  else console.log("Current source counts inspected; prospective initialization must start at its actual initialization timestamp. No historical values inferred. No rows changed.");
} catch (error) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "UNAVAILABLE";
  console.error(`Cadence-history preflight failed (${code}); no rows changed.`); process.exitCode = 1;
} finally { if (pool) await pool.end(); }

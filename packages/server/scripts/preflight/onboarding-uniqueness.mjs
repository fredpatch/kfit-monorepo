import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";

loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
let target;
try { target = new URL(process.env.DATABASE_URL ?? ""); }
catch { throw new Error("Onboarding preflight requires a valid local development database URL."); }
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433" || target.search) {
  throw new Error("Onboarding preflight requires the local development PostgreSQL target on port 5433.");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(`SELECT count(*)::int AS duplicate_groups FROM (
    SELECT subscription_id, item_type FROM onboarding_items
    GROUP BY subscription_id, item_type HAVING count(*) > 1
  ) AS duplicates`);
  const count = result.rows[0]?.duplicate_groups;
  console.log(JSON.stringify({ localTargetVerified: true, duplicateGroups: count }));
  if (count !== 0) {
    console.error("Existing onboarding duplicates require developer reconciliation before adding uniqueness. No rows changed.");
    process.exitCode = 1;
  }
} catch {
  console.error("Onboarding uniqueness preflight failed. Check the local database and migration state.");
  process.exitCode = 1;
} finally { await pool.end(); }

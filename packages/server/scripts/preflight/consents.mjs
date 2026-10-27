import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";

const envFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
loadEnv({ path: envFile });
let target;
try {
  target = new URL(process.env.DATABASE_URL ?? "");
} catch {
  throw new Error("Consent preflight requires a valid local database URL.");
}
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "5433" ||
  target.pathname !== "/kfit_dev" ||
  target.search
) {
  throw new Error(
    "Consent preflight requires the disposable local development database on port 5433.",
  );
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(`SELECT
    (SELECT count(*)::int FROM consent_definitions) AS definitions,
    (SELECT count(*)::int FROM consent_records) AS records,
    (SELECT count(*)::int FROM consent_definitions WHERE version !~ '^[1-9][0-9]*$') AS non_numeric_versions,
    (SELECT count(*)::int FROM secure_access_tokens) AS existing_tokens,
    (SELECT count(*)::int FROM external_access_events) AS existing_access_events`);
  const counts = result.rows[0];
  console.log(
    JSON.stringify({
      localTargetVerified: true,
      envFile: "root .env",
      ...counts,
    }),
  );
  if (counts.definitions !== 0 || counts.records !== 0) {
    console.error(
      "Existing consent history requires an approved legacy-content/provenance migration plan. No rows changed.",
    );
    process.exitCode = 1;
  }
} catch {
  console.error(
    "Consent preflight failed. Check the local database and migration state.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}

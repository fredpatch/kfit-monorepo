import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";

let pool;
let client;
try {
  if (process.env.DATABASE_URL) throw new Error("Inherited database target");
  const loaded = loadEnv({
    path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
  });
  if (loaded.error) throw new Error("Environment unavailable");
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "5433" ||
    target.pathname !== "/kfit_dev" ||
    target.search
  )
    throw new Error("Unsafe target");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const {
    rows: [counts],
  } = await client.query(`SELECT
    (SELECT count(*)::int FROM progress_measurements) AS measurements,
    (SELECT count(*)::int FROM goals) AS goals,
    (SELECT count(*)::int FROM progress_photos) AS photos`);
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      envFile: "root .env",
      localTargetVerified: true,
      readOnly: true,
      ...counts,
    }),
  );
  if (counts.measurements !== 0 || counts.goals !== 0) {
    console.error(
      "Existing measurement or goal evidence requires a reviewed compatibility/backfill plan before migration. No rows changed.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "No existing measurements or goals; the approved creation timestamp, nullable metric key and new event table require no backfill. Photos remain untouched. No rows changed.",
    );
  }
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
    `Progress/goals preflight failed (${code}). Verify the local environment/database; no rows changed.`,
  );
  process.exitCode = 1;
} finally {
  if (client) client.release();
  if (pool) await pool.end();
}

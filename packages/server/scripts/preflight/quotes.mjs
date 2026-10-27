import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";

let pool;
try {
  if (process.env.DATABASE_URL) throw new Error("Inherited database target");
  const env = config({
    path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
  });
  if (env.error) throw new Error("Missing local environment");
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "5433" ||
    target.pathname !== "/kfit_dev" ||
    target.search
  )
    throw new Error("Unsafe database target");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let counts;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const {
      rows: [row],
    } = await client.query(`SELECT
      (SELECT count(*)::int FROM quotes) AS quotes,
      (SELECT count(*)::int FROM quote_versions) AS versions,
      (SELECT count(*)::int FROM secure_access_tokens WHERE resource_type='quote_version') AS quote_tokens,
      (SELECT count(*)::int FROM quotes q LEFT JOIN quote_versions v ON v.id=q.current_version_id WHERE q.current_version_id IS NOT NULL AND (v.id IS NULL OR v.quote_id<>q.id)) AS invalid_current_versions,
      (SELECT count(*)::int FROM quote_versions v LEFT JOIN documents d ON d.id=v.pdf_document_id WHERE v.pdf_document_id IS NOT NULL AND d.id IS NULL) AS invalid_pdf_references`);
    counts = row;
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  console.log(
    JSON.stringify({
      envFile: "root .env",
      localTargetVerified: true,
      readOnly: true,
      ...counts,
    }),
  );
  if (Object.values(counts).some((value) => value !== 0)) {
    console.error(
      "Existing quote evidence requires reviewed compatibility/backfill planning. No rows changed.",
    );
    process.exitCode = 1;
  } else
    console.log(
      "No quote evidence; additive nullable fields/FKs and empty annual counters need no backfill. No rows changed.",
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
  console.error(`Quotes preflight failed (${code}); no rows changed.`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}

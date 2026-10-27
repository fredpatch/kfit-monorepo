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
      (SELECT count(*)::int FROM payment_proofs) AS proofs,
      (SELECT count(*)::int FROM documents WHERE owner_type='payment_proof' OR document_type='payment_proof') AS proof_documents,
      (SELECT count(*)::int FROM secure_access_tokens WHERE action='payment_proof_upload') AS upload_tokens,
      (SELECT count(*)::int FROM payment_proofs p LEFT JOIN documents d ON d.id=p.document_id WHERE d.id IS NULL) AS invalid_document_references,
      (SELECT count(*)::int FROM payment_proofs p LEFT JOIN payment_proofs prior ON prior.id=p.supersedes_proof_id WHERE p.supersedes_proof_id IS NOT NULL AND (prior.id IS NULL OR prior.id=p.id OR prior.subscription_id<>p.subscription_id)) AS invalid_lineage,
      (SELECT count(*)::int FROM (SELECT supersedes_proof_id FROM payment_proofs WHERE supersedes_proof_id IS NOT NULL GROUP BY supersedes_proof_id HAVING count(*)>1) p) AS branched_lineage`);
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
      "Existing proof evidence requires reviewed compatibility/backfill planning. No rows changed.",
    );
    process.exitCode = 1;
  } else
    console.log(
      "No proof evidence; claim fields, linkage/lineage FKs and consistency checks require no backfill. No rows changed.",
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
  console.error(`Payment-proof preflight failed (${code}); no rows changed.`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}

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
      (SELECT count(*)::int FROM receipts) AS receipts,
      (SELECT count(*)::int FROM (SELECT payment_event_id FROM receipts GROUP BY payment_event_id HAVING count(*)>1) r) AS duplicate_payments,
      (SELECT count(*)::int FROM receipts r LEFT JOIN payment_events p ON p.id=r.payment_event_id WHERE p.id IS NULL OR p.customer_id<>r.customer_id OR p.event_type<>'payment_received' OR p.confirmed_at IS NULL) AS invalid_payment_relationships,
      (SELECT count(*)::int FROM receipts r WHERE (SELECT count(DISTINCT a.subscription_id) FROM payment_allocations a WHERE a.payment_event_id=r.payment_event_id)<>1 OR EXISTS (SELECT 1 FROM payment_allocations a JOIN subscriptions s ON s.id=a.subscription_id WHERE a.payment_event_id=r.payment_event_id AND s.customer_id<>r.customer_id)) AS invalid_subscription_scope,
      (SELECT count(*)::int FROM receipts r LEFT JOIN documents d ON d.id=r.pdf_document_id WHERE d.id IS NULL) AS invalid_pdf_references,
      (SELECT count(*)::int FROM documents WHERE owner_type='receipt' OR document_type='payment_receipt') AS receipt_documents,
      (SELECT count(*)::int FROM business_document_counters WHERE document_type='receipt') AS receipt_counter_partitions,
      (SELECT count(*)::int FROM secure_access_tokens WHERE resource_type='receipt' OR action='receipt_download') AS receipt_tokens`);
    counts = row; await client.query("COMMIT");
  } finally { client.release(); }
  console.log(JSON.stringify({ envFile: "root .env", localTargetVerified: true, readOnly: true, ...counts }));
  if (Object.values(counts).some(value => value !== 0)) { console.error("Existing receipt evidence requires reviewed compatibility/backfill planning. No rows changed."); process.exitCode = 1; }
  else console.log("No receipt evidence; snapshot/FK/uniqueness hardening requires no backfill. No rows changed.");
} catch (error) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "UNAVAILABLE";
  console.error(`Receipt preflight failed (${code}); no rows changed.`); process.exitCode = 1;
} finally { if (pool) await pool.end(); }

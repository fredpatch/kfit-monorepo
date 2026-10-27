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
      (SELECT count(*)::int FROM payment_plans) AS plans,
      (SELECT count(*)::int FROM installments) AS installments,
      (SELECT count(*)::int FROM payment_events) AS events,
      (SELECT count(*)::int FROM payment_allocations) AS allocations,
      (SELECT count(*)::int FROM (SELECT subscription_id FROM payment_plans WHERE status='active' GROUP BY subscription_id HAVING count(*)>1) q) AS duplicate_active_plans,
      (SELECT count(*)::int FROM payment_plans p LEFT JOIN payment_plans prior ON prior.id=p.revised_from_plan_id WHERE p.revised_from_plan_id IS NOT NULL AND (prior.id IS NULL OR prior.id=p.id OR prior.subscription_id<>p.subscription_id)) AS invalid_revision_references,
      (SELECT count(*)::int FROM payment_events e LEFT JOIN payment_events prior ON prior.id=e.correction_of_event_id WHERE e.correction_of_event_id IS NOT NULL AND (prior.id IS NULL OR prior.id=e.id OR prior.customer_id<>e.customer_id)) AS invalid_correction_references,
      (SELECT count(*)::int FROM payment_events WHERE confirmed_at IS NOT NULL AND (event_type NOT IN ('payment_received','payment_correction') OR payment_method IS NULL OR payment_method NOT IN ('cash','bank_transfer','mobile_money'))) AS incompatible_confirmed_events,
      (SELECT count(*)::int FROM payment_allocations a JOIN payment_events e ON e.id=a.payment_event_id JOIN subscriptions s ON s.id=a.subscription_id LEFT JOIN installments i ON i.id=a.installment_id LEFT JOIN payment_plans p ON p.id=i.payment_plan_id WHERE a.extra_id IS NOT NULL OR i.id IS NULL OR p.subscription_id<>a.subscription_id OR e.customer_id<>s.customer_id) AS invalid_allocation_scope,
      (SELECT count(*)::int FROM payment_events e WHERE e.confirmed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payment_allocations a WHERE a.payment_event_id=e.id)) AS unallocated_confirmed_events,
      (SELECT count(*)::int FROM (SELECT payment_event_id FROM payment_allocations GROUP BY payment_event_id HAVING count(DISTINCT subscription_id)>1) q) AS multiple_subscription_events`);
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
      "Existing financial history or incompatible references require a reviewed migration/backfill plan. No rows changed.",
    );
    process.exitCode = 1;
  } else
    console.log(
      "No finance history; additive self-FKs, active-plan index and nullable unique command identity need no backfill. No rows changed.",
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
  console.error(`Finance preflight failed (${code}); no rows changed.`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";
loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
let pool;
try {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433" || target.pathname !== "/kfit_dev" || target.search) throw new Error("Unsafe target");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: [counts] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM appointments) AS appointments,
    (SELECT count(*)::int FROM appointment_events) AS appointment_events,
    (SELECT count(*)::int FROM component_events WHERE related_appointment_id IS NOT NULL) AS appointment_component_events,
    (SELECT count(*)::int FROM appointments a JOIN subscription_components c ON c.id=a.component_id WHERE c.subscription_id<>a.subscription_id) AS mismatched_components,
    (SELECT count(*)::int FROM service_policies WHERE late_cancel_notice_hours<0) AS invalid_notice_policies,
    (SELECT count(*)::int FROM (SELECT service_id FROM service_policies WHERE variant_id IS NULL GROUP BY service_id HAVING count(*)>1) d) AS ambiguous_service_policies`);
  console.log(JSON.stringify({ envFile: "root .env", localTargetVerified: true, ...counts }));
  if (counts.appointments || counts.appointment_events || counts.appointment_component_events || counts.mismatched_components || counts.invalid_notice_policies || counts.ambiguous_service_policies) {
    console.error("Existing appointment evidence or policy inconsistencies require a reviewed reconciliation/backfill plan. No rows changed."); process.exitCode = 1;
  } else console.log("No existing appointment evidence; additive snapshot defaults need no historical backfill. No rows changed.");
} catch { console.error("Appointment preflight failed. Verify local database and schema; no rows changed."); process.exitCode = 1; }
finally { if (pool) await pool.end(); }

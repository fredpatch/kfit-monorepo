import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
process.env.NODE_ENV ??= "development";
let pool;
try {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV !== "development" ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "5433" ||
    target.pathname !== "/kfit_dev" ||
    target.search
  )
    throw new Error("Unsafe target");
  // Ignored local plan is reviewed separately; this script never generates or expands it.
  const plan = JSON.parse(
    readFileSync(
      new URL(
        "../../../../tmp/subscription-duration-backfill.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (
    plan.source !== "reviewed_current_catalogue" ||
    !Array.isArray(plan.subscriptions) ||
    !plan.subscriptions.length ||
    new Set(plan.subscriptions.map((row) => row.id)).size !==
      plan.subscriptions.length ||
    !plan.subscriptions.every(
      (row) =>
        typeof row.id === "string" &&
        /^[0-9a-f-]{36}$/i.test(row.id) &&
        typeof row.status === "string" &&
        Number.isInteger(row.value) &&
        row.value > 0 &&
        ["day", "week", "month"].includes(row.unit) &&
        ["variant", "service"].includes(row.durationSource),
    )
  )
    throw new Error("Invalid plan");
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      "SELECT * FROM subscriptions WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [plan.subscriptions.map((row) => row.id)],
    );
    if (locked.rows.length !== plan.subscriptions.length)
      throw new Error("Plan changed");
    let changed = 0;
    for (const approved of plan.subscriptions) {
      const row = locked.rows.find((row) => row.id === approved.id);
      if (
        !row ||
        row.actual_start_date !== null ||
        row.status !== approved.status
      )
        throw new Error("Subscription changed");
      const service = (
        await client.query(
          "SELECT default_duration_value AS value, default_duration_unit AS unit FROM services WHERE id = $1 FOR SHARE",
          [row.service_id],
        )
      ).rows[0];
      const variant = row.variant_id
        ? (
            await client.query(
              "SELECT duration_value AS value, duration_unit AS unit FROM service_variants WHERE id = $1 AND service_id = $2 FOR SHARE",
              [row.variant_id, row.service_id],
            )
          ).rows[0]
        : null;
      if (!service || (row.variant_id && !variant))
        throw new Error("Catalogue relationship changed");
      const fromVariant =
        variant && (variant.value !== null || variant.unit !== null);
      const candidate = fromVariant ? variant : service;
      if (
        candidate.value !== approved.value ||
        candidate.unit !== approved.unit ||
        (fromVariant ? "variant" : "service") !== approved.durationSource
      )
        throw new Error("Catalogue duration changed");
      if (
        row.duration_value_snapshot === approved.value &&
        row.duration_unit_snapshot === approved.unit
      )
        continue;
      if (
        row.duration_value_snapshot !== null ||
        row.duration_unit_snapshot !== null
      )
        throw new Error("Snapshot already set");
      await client.query(
        "UPDATE subscriptions SET duration_value_snapshot = $1, duration_unit_snapshot = $2, updated_at = clock_timestamp() WHERE id = $3 AND duration_value_snapshot IS NULL AND duration_unit_snapshot IS NULL",
        [approved.value, approved.unit, approved.id],
      );
      await client.query(
        "INSERT INTO audit_events (actor_type, event_type, entity_type, entity_id, result, metadata_json) VALUES ('system', 'subscription.duration_snapshot_backfilled', 'subscription', $1, 'success', $2::jsonb)",
        [
          approved.id,
          JSON.stringify({
            source: plan.source,
            durationValueSnapshot: approved.value,
            durationUnitSnapshot: approved.unit,
          }),
        ],
      );
      changed++;
    }
    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        localTargetVerified: true,
        planned: plan.subscriptions.length,
        snapshotted: changed,
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch {
  console.error(
    "Duration backfill aborted. Verify local development target, migration and the reviewed plan; no partial changes committed.",
  );
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}

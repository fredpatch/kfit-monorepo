import { config } from "dotenv";
import { fileURLToPath } from "node:url";

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
  const database = await import("../../dist/db/client.js");
  pool = database.pool;
  const { initializeCurrentCadenceHistory } =
    await import("../../dist/modules/follow-ups/repositories/cadence-history.repository.js");
  // Bound this local operation to the separately reviewed preflight scope.
  const initialized = await initializeCurrentCadenceHistory(
    database.db,
    () => new Date(),
    2,
  );
  console.log(
    JSON.stringify({
      envFile: "root .env",
      localTargetVerified: true,
      initialized,
      prospectiveOnly: true,
    }),
  );
} catch {
  console.error(
    "Cadence initialization aborted. Verify the local environment, migration and compiled implementation. No partial transaction committed.",
  );
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}

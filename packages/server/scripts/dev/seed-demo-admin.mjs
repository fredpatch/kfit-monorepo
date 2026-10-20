import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// Match the development API's explicit root .env loading. Inherited variables are not overwritten.
loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
// Invoking this dedicated command explicitly opts into local development, never overriding another mode.
process.env.NODE_ENV ??= "development";

const { assertLocalDemoEnvironment, DemoAdminSetupError, provisionDemoAdmin } = await import("../../dist/dev/demo-admin.js");
let pool;
try {
  // Must run before importing the DB client or making any connection.
  assertLocalDemoEnvironment(process.env);
  const { loadAuthConfig } = await import("../../dist/modules/auth/config/auth.config.js");
  const config = loadAuthConfig(process.env);
  const database = await import("../../dist/db/client.js");
  pool = database.pool;
  const result = await provisionDemoAdmin(database.db, { auditHashPepper: config.auditHashPepper });
  console.log(`Local development demo account ready (${result}). Use the demo button on /admin.`);
} catch (error) {
  console.error(error instanceof DemoAdminSetupError ? error.message : "Demo setup failed. Check the local database and authentication configuration.");
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}

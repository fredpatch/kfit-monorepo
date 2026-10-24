import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

const port = Number(process.env.KFIT_API_PORT || 3000);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  throw new Error("KFIT_API_PORT must be a valid TCP port");
}

const { logger } = await import("../../dist/logging/logger.js");
const { runStartupChecks } = await import("../../dist/dev/startup-checks.js");
const { createDevelopmentApp } = await import("../../dist/dev-app.js");
const { pool } = await import("../../dist/db/client.js");

logger.info("✔ Environment loaded (.env)");
if (!(await runStartupChecks(pool))) {
  logger.error("✖ K'FIT dev API not started: the database is required. Run `npm run db:up` and retry.");
  await pool.end();
  process.exit(1);
}

const app = createDevelopmentApp();
// Bound to the IPv4 loopback only (the Vite proxy targets 127.0.0.1); `localhost` reaches it from the browser.
const server = app.listen(port, "127.0.0.1", () => {
  logger.info(`✔ K'FIT dev API listening on http://localhost:${port} (health: http://localhost:${port}/health)`);
});

async function shutdown(signal) {
  logger.info(`Received ${signal}; shutting down K'FIT dev API.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

const port = Number(process.env.KFIT_API_PORT || 3000);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  throw new Error("KFIT_API_PORT must be a valid TCP port");
}

const { logger } = await import("../../dist/logging/logger.js");
const { namesIntegrationTestDatabase } =
  await import("../../dist/db/database-target.js");
// TEST-01 D1: kfit_test belongs to the integration suite; the dev API and its jobs must never write there.
if (namesIntegrationTestDatabase(process.env.DATABASE_URL)) {
  logger.error(
    "✖ K'FIT dev API not started: DATABASE_URL points at kfit_test, the integration test database. Use kfit_dev in .env.",
  );
  process.exit(1);
}
const { runStartupChecks } = await import("../../dist/dev/startup-checks.js");
const { createDevelopmentRuntime } = await import("../../dist/dev-app.js");
const { pool } = await import("../../dist/db/client.js");

logger.info("✔ Environment loaded (.env)");
if (!(await runStartupChecks(pool))) {
  logger.error(
    "✖ K'FIT dev API not started: the database is required. Run `npm run db:up` and retry.",
  );
  await pool.end();
  process.exit(1);
}

const { app, startNotificationJobs, startPrivacyJobs, privacyJournalEnabled } =
  createDevelopmentRuntime();
// S7.2 jobs: reconcile every 15 min, e-mail delivery every 5 min (advisory-locked, safe with several API processes).
const stopNotificationJobs =
  process.env.KFIT_NOTIFICATION_JOBS === "off"
    ? (logger.info("Notification jobs disabled (KFIT_NOTIFICATION_JOBS=off)"),
      () => undefined)
    : startNotificationJobs((line) => logger.warn(line));
// S7.3 purge job: daily 03:00 Africa/Libreville (D3, D12); dev entrypoint only until S7.4.
const stopPrivacyJobs =
  process.env.KFIT_PRIVACY_JOBS === "off"
    ? (logger.info("Privacy jobs disabled (KFIT_PRIVACY_JOBS=off)"),
      () => undefined)
    : startPrivacyJobs((line) => logger.warn(line));
if (!privacyJournalEnabled)
  logger.warn(
    "⚠ Privacy journal disabled: set KFIT_PRIVACY_JOURNAL_DIR so anonymizations can be replayed after a restore",
  );
// Bound to the IPv4 loopback only (the Vite proxy targets 127.0.0.1); `localhost` reaches it from the browser.
const server = app.listen(port, "127.0.0.1", () => {
  logger.info(
    `✔ K'FIT dev API listening on http://localhost:${port} (health: http://localhost:${port}/health)`,
  );
});

async function shutdown(signal) {
  logger.info(`Received ${signal}; shutting down K'FIT dev API.`);
  stopNotificationJobs();
  stopPrivacyJobs();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

/*
 * S7.4 D1/D2/D3: production entrypoint (requires `npm run build`). No dotenv: the environment comes from the process or
 * the compose file (Sprint 9). Refuses to start unless NODE_ENV=production and every production guard passes; the guard
 * report lists codes and key names only, never a value.
 */
if (process.env.NODE_ENV !== "production") {
  console.error("✖ K'FIT production API not started: NODE_ENV must be \"production\" (use npm run dev:api for development).");
  process.exit(1);
}

const host = process.env.KFIT_API_HOST || "127.0.0.1";
const port = Number(process.env.KFIT_API_PORT || 3000);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  console.error("✖ K'FIT production API not started: KFIT_API_PORT must be a valid TCP port.");
  process.exit(1);
}

const { logger } = await import("../../dist/logging/logger.js");
const { describeGuardFailures, runProductionGuards } = await import("../../dist/runtime/production-guards.js");

// The DB client refuses to load without DATABASE_URL; the guards load it only when they need it.
const guards = await runProductionGuards({ env: process.env, database: async () => (await import("../../dist/db/client.js")).db });
for (const warning of guards.warnings) logger.warn(`⚠ ${warning}`);
if (!guards.ok) {
  logger.error(`✖ K'FIT production API not started — production guards failed: ${describeGuardFailures(guards.failures)}`);
  if (process.env.DATABASE_URL) await (await import("../../dist/db/client.js")).pool.end().catch(() => undefined);
  process.exit(1);
}

const { pool } = await import("../../dist/db/client.js");
const { runStartupChecks } = await import("../../dist/dev/startup-checks.js");
if (!(await runStartupChecks(pool))) {
  logger.error("✖ K'FIT production API not started: a required service is unreachable.");
  await pool.end();
  process.exit(1);
}

const { createProductionRuntime } = await import("../../dist/prod-app.js");
const { app, startNotificationJobs, startPrivacyJobs } = createProductionRuntime(process.env);
// S7.4 D3: the privacy purge always runs in production; notifications may be paused (warned above).
const stopPrivacyJobs = startPrivacyJobs((line) => logger.warn(line));
const stopNotificationJobs = process.env.KFIT_NOTIFICATION_JOBS === "off" ? () => undefined : startNotificationJobs((line) => logger.warn(line));

const server = app.listen(port, host, () => {
  logger.info(`✔ K'FIT production API listening on ${host}:${port}`);
});

async function shutdown(signal) {
  logger.info(`Received ${signal}; shutting down K'FIT production API.`);
  stopNotificationJobs();
  stopPrivacyJobs();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

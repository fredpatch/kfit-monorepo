import "dotenv/config";

const port = Number(process.env.KFIT_API_PORT || 3000);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  throw new Error("KFIT_API_PORT must be a valid TCP port");
}

const { createDevelopmentApp } = await import("../../dist/dev-app.js");
const { pool } = await import("../../dist/db/client.js");

const app = createDevelopmentApp();
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`K'FIT dev API listening on http://127.0.0.1:${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down K'FIT dev API.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

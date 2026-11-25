/*
 * S9B: entrypoint of the internal PDF renderer image (no database, no storage, no API code). Listens on the backend
 * network only; Compose publishes no port. Requires `npm run build` locally.
 */
const host = process.env.KFIT_RENDERER_HOST || "127.0.0.1";
const port = Number(process.env.KFIT_RENDERER_PORT || 3100);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  console.error(
    "✖ K'FIT PDF renderer not started: KFIT_RENDERER_PORT must be a valid TCP port.",
  );
  process.exit(1);
}

const { createRendererServer } =
  await import("../../dist/pdf-renderer/server.js");
const { chromiumHtmlToPdf } =
  await import("../../dist/pdf-renderer/html-to-pdf.js");

const server = createRendererServer(chromiumHtmlToPdf());
server.listen(port, host, () => {
  console.log(`✔ K'FIT PDF renderer listening on ${host}:${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down K'FIT PDF renderer.`);
  server.close(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

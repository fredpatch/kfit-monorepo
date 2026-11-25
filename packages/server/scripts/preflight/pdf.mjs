/*
 * S9B: PDF preflight of the isolated rendering path. Starts the internal renderer service (dist/pdf-renderer, the same
 * code as the renderer image) with real Chromium, renders a multi-page French document through POST /render and checks
 * that the page could not fetch anything (a local canary server must see no request). Writes no file. Run it in the
 * renderer image (CI publish job) or locally after `npm run build`.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";

const { createRendererServer } =
  await import("../../dist/pdf-renderer/server.js");
const { chromiumHtmlToPdf } =
  await import("../../dist/pdf-renderer/html-to-pdf.js");

const sections = Array.from(
  { length: 18 },
  (_, index) => `
  <section class="card">
    <h2>Étape ${index + 1} - Suivi personnalisé</h2>
    <p>Ce contenu valide les accents français, les retours à la ligne, les blocs métier et la pagination du rendu PDF K'FIT.</p>
    <div class="row"><span>Objectif</span><strong>Progression durable</strong></div>
    <div class="row"><span>Fréquence</span><strong>Hebdomadaire</strong></div>
    <div class="row"><span>Statut</span><strong>À suivre</strong></div>
  </section>
`,
).join("");

const html = (canary) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>K'FIT - Pré-flight PDF</title>
<link rel="stylesheet" href="${canary}/style.css" />
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1d1d1f; margin: 0; font-size: 11pt; line-height: 1.4; }
  header { border-bottom: 2px solid #1d1d1f; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 24pt; font-weight: 800; letter-spacing: .5px; }
  .subtitle { margin-top: 4px; font-size: 10pt; color: #555; }
  .summary { padding: 12px; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 12px; background: #fafafa; }
  .card { break-inside: avoid; border: 1px solid #ddd; border-radius: 8px; padding: 11px 12px; margin: 0 0 10px; }
  h1 { font-size: 18pt; margin: 0 0 8px; }
  h2 { font-size: 12.5pt; margin: 0 0 8px; }
  p { margin: 0 0 8px; }
  .row { display: flex; justify-content: space-between; gap: 20px; padding: 3px 0; border-top: 1px dotted #ddd; }
  footer { position: fixed; bottom: -10mm; left: 0; right: 0; font-size: 8pt; color: #666; text-align: center; }
</style>
</head>
<body>
<header>
  <div class="brand">K'FIT</div>
  <div class="subtitle">Coaching personnel · Document technique de validation</div>
</header>
<h1>Bilan de suivi - Pré-flight Sprint 0</h1>
<div class="summary">
  <strong>Client :</strong> Client Démonstration<br />
  <strong>Programme :</strong> Coaching personnalisé 3 mois<br />
  <strong>Référence :</strong> KFIT-PREFLIGHT-001<br />
  <strong>Devise :</strong> XAF
</div>
${sections}
<img src="${canary}/pixel.png" alt="" />
<footer>K'FIT · Pré-flight PDF · document non contractuel</footer>
</body>
</html>`;

const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
};

const canaryHits = [];
const canary = createServer((request, response) => {
  canaryHits.push(request.url);
  response.end();
});
const blocked = [];
const renderer = createRendererServer(
  chromiumHtmlToPdf({ onBlockedRequest: (url) => blocked.push(url) }),
);

try {
  const canaryOrigin = await listen(canary);
  const origin = await listen(renderer);
  const render = (body) =>
    fetch(`${origin}/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  assert.equal(
    (await fetch(`${origin}/health`)).status,
    200,
    "renderer health",
  );
  const response = await render({ html: html(canaryOrigin), profile: "a4" });
  assert.equal(response.status, 200, "POST /render status");
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const bytes = Buffer.from(await response.arrayBuffer());
  const header = bytes.subarray(0, 5).toString("ascii");
  const pageObjects =
    bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? [];

  assert.equal(header, "%PDF-", "Output must have a valid PDF signature");
  assert.ok(
    bytes.length > 10_000,
    `PDF unexpectedly small: ${bytes.length} bytes`,
  );
  assert.ok(
    pageObjects.length >= 2,
    `Expected multi-page PDF, detected ${pageObjects.length} page objects`,
  );
  assert.deepEqual(canaryHits, [], "the page reached the network");
  assert.ok(
    blocked.some((url) => url.startsWith(canaryOrigin)),
    "external resources were requested and refused",
  );
  const script = await render({ html: "<script>1</script>", profile: "a4" });
  assert.equal(script.status, 422, "scripts are refused");

  console.log(
    `Renderer path verified: POST /render -> ${header} (${bytes.length} bytes)`,
  );
  console.log(
    `Pagination verified: ${pageObjects.length} page objects detected`,
  );
  console.log(
    `External fetch blocked: ${blocked.length} request(s) refused, canary hits 0`,
  );
  console.log("PDF pre-flight PASSED");
} finally {
  renderer.closeAllConnections();
  renderer.close();
  canary.close();
}

import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../../../tmp/preflight-pdf");
const pdfPath = path.join(outputDir, "kfit-preflight.pdf");

const sections = Array.from({ length: 18 }, (_, index) => `
  <section class="card">
    <h2>Étape ${index + 1} — Suivi personnalisé</h2>
    <p>Ce contenu valide les accents français, les retours à la ligne, les blocs métier et la pagination du rendu PDF K'FIT.</p>
    <div class="row"><span>Objectif</span><strong>Progression durable</strong></div>
    <div class="row"><span>Fréquence</span><strong>Hebdomadaire</strong></div>
    <div class="row"><span>Statut</span><strong>À suivre</strong></div>
  </section>
`).join("");

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>K'FIT — Pré-flight PDF</title>
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
<h1>Bilan de suivi — Pré-flight Sprint 0</h1>
<div class="summary">
  <strong>Client :</strong> Client Démonstration<br />
  <strong>Programme :</strong> Coaching personnalisé 3 mois<br />
  <strong>Référence :</strong> KFIT-PREFLIGHT-001<br />
  <strong>Devise :</strong> XAF
</div>
${sections}
<footer>K'FIT · Pré-flight PDF · document non contractuel</footer>
</body>
</html>`;

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

let browser;
try {
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const buffer = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  });

  await writeFile(pdfPath, buffer);

  const bytes = await readFile(pdfPath);
  const info = await stat(pdfPath);
  const header = bytes.subarray(0, 5).toString("ascii");
  const pdfText = bytes.toString("latin1");
  const pageObjects = pdfText.match(/\/Type\s*\/Page\b/g) ?? [];

  assert.equal(header, "%PDF-", "Output must have a valid PDF signature");
  assert.ok(info.size > 10_000, `PDF unexpectedly small: ${info.size} bytes`);
  assert.ok(pageObjects.length >= 2, `Expected multi-page PDF, detected ${pageObjects.length} page objects`);

  console.log(`PDF signature verified: ${header}`);
  console.log(`PDF size verified: ${info.size} bytes`);
  console.log(`Pagination verified: ${pageObjects.length} page objects detected`);
  console.log(`French/branding HTML rendered with local-only assets`);
  console.log(`Generated file: ${pdfPath}`);
  console.log("PDF pre-flight PASSED");
} finally {
  if (browser) await browser.close();
}

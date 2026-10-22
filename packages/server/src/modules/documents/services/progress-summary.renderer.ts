import puppeteer from "puppeteer";
import type { ProgressSummaryRenderer } from "./documents.service.js";

const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const fmt=(value:unknown)=>value===null||value===undefined||value===""?"—":esc(value);
export class PuppeteerProgressSummaryRenderer implements ProgressSummaryRenderer {
  readonly templateVersion="v1";
  async render(input: unknown): Promise<Buffer> {
    const data=(input&&typeof input==="object"?input:{}) as any;
    const ms=Array.isArray(data.measurements)?data.measurements:[];
    const goals=Array.isArray(data.goals)?data.goals:[];
    const follow=Array.isArray(data.followUps)?data.followUps:[];
    const rows=ms.map((m:any)=>`<tr><td>${fmt(m.measuredAt)}</td><td>${fmt(m.weightKg)}</td><td>${fmt(m.waistCm)}</td><td>${fmt(m.hipsCm)}</td><td>${fmt(m.chestCm)}</td><td>${fmt(m.bodyFatEstimate)}</td></tr>`).join("");
    const goalRows=goals.map((g:any)=>`<tr><td>${fmt(g.label)}</td><td>${fmt(g.baselineValue)} ${fmt(g.unit)}</td><td>${fmt(g.targetValue)} ${fmt(g.unit)}</td><td>${fmt(g.status)}</td></tr>`).join("");
    const followRows=follow.map((f:any)=>`<tr><td>${fmt(f.occurredAt)}</td><td>${fmt(f.followUpType)}</td><td>${fmt(f.status)}</td></tr>`).join("");
    const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17202a;font-size:10pt}
      h1{font-size:20pt;margin:0 0 4mm}h2{font-size:13pt;margin:8mm 0 3mm}p{margin:0 0 2mm}.muted{color:#68737d}
      table{width:100%;border-collapse:collapse;font-size:8.5pt}th,td{border-bottom:1px solid #ddd;padding:2.2mm;text-align:left}
      th{background:#f4f6f7}section{break-inside:avoid}.brand{font-weight:800;font-size:13pt;margin-bottom:8mm}
    </style></head><body><div class="brand">K'FIT</div><h1>Bilan de progression</h1>
    <p><strong>Client :</strong> ${fmt(data.customer?.fullName)}</p>
    <p><strong>Abonnement :</strong> ${fmt(data.subscription?.reference)} · ${fmt(data.service?.name)}</p>
    <p class="muted">Document factuel de suivi — aucune interprétation médicale ou diagnostic.</p>
    <section><h2>Mesures</h2><table><thead><tr><th>Date</th><th>Poids kg</th><th>Taille cm</th><th>Hanches cm</th><th>Poitrine cm</th><th>Masse grasse %</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Aucune mesure enregistrée.</td></tr>'}</tbody></table></section>
    <section><h2>Objectifs</h2><table><thead><tr><th>Objectif</th><th>Départ</th><th>Cible</th><th>Statut</th></tr></thead><tbody>${goalRows||'<tr><td colspan="4">Aucun objectif enregistré.</td></tr>'}</tbody></table></section>
    <section><h2>Suivis</h2><table><thead><tr><th>Date</th><th>Type</th><th>Statut</th></tr></thead><tbody>${followRows||'<tr><td colspan="3">Aucun suivi enregistré.</td></tr>'}</tbody></table></section>
    </body></html>`;
    const browser=await puppeteer.launch({headless:true});
    try{
      const page=await browser.newPage();
      await page.setContent(html,{waitUntil:"load"});
      return Buffer.from(await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true}));
    } finally { await browser.close(); }
  }
}

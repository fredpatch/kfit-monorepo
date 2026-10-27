import type { QuoteSnapshot } from "@kfit/shared";

export function readQuoteSnapshot(value: unknown): QuoteSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    v.templateVersion !== "quote-v1" ||
    v.currency !== "XAF" ||
    !Number.isSafeInteger(v.amountXaf) ||
    typeof v.amountXaf !== "number" ||
    v.amountXaf < 0 ||
    typeof v.versionNumber !== "number" ||
    !Number.isInteger(v.versionNumber) ||
    ![
      "quoteNumber",
      "customerName",
      "subscriptionReference",
      "serviceLabel",
      "issuedAt",
      "validUntil",
      "terms",
    ].every((k) => typeof v[k] === "string") ||
    !(v.variantLabel === null || typeof v.variantLabel === "string") ||
    !(v.durationValue === null || typeof v.durationValue === "number") ||
    !(v.durationUnit === null || typeof v.durationUnit === "string") ||
    !Array.isArray(v.components) ||
    v.components.some(
      (c) =>
        !c ||
        typeof c !== "object" ||
        typeof c.label !== "string" ||
        !Number.isSafeInteger(c.quantity),
    )
  )
    return null;
  return value as QuoteSnapshot;
}
export const quoteYear = (date: Date) =>
  Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Libreville",
      year: "numeric",
    }).format(date),
  );
export const quoteNumber = (year: number, sequence: number) =>
  `DEV-${year}-${String(sequence).padStart(4, "0")}`;
const esc = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Libreville",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
export function quotePrintModel(snapshot: QuoteSnapshot) {
  return {
    ...snapshot,
    totalLabel: `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(snapshot.amountXaf)} FCFA`,
    issuedLabel: dateLabel(snapshot.issuedAt),
    validLabel: dateLabel(snapshot.validUntil),
    durationLabel:
      snapshot.durationValue === null
        ? null
        : `${snapshot.durationValue} ${{ day: "jour(s)", week: "semaine(s)", month: "mois" }[snapshot.durationUnit ?? ""] ?? snapshot.durationUnit}`,
  };
}
export function quoteHtml(snapshot: QuoteSnapshot) {
  const p = quotePrintModel(snapshot);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#163b2b;font-size:11pt}h1{font-size:26pt;margin-top:12mm}.brand{font-size:18pt;font-weight:bold}p{line-height:1.5}section{margin-top:10mm}strong{font-weight:700}.terms{white-space:pre-wrap;overflow-wrap:anywhere}.total{font-size:20pt;border-top:2px solid #163b2b;padding-top:5mm}li{margin:2mm 0}</style></head><body><div class="brand">K'FIT</div><h1>Devis ${esc(p.quoteNumber)}</h1><p>Version ${p.versionNumber} · Émis le ${esc(p.issuedLabel)}<br>Valable jusqu’au ${esc(p.validLabel)} - heure de Libreville</p><section><p>Client : <strong>${esc(p.customerName)}</strong><br>Abonnement : ${esc(p.subscriptionReference)}</p><p>Prestation : <strong>${esc(p.serviceLabel)}</strong>${p.variantLabel ? `<br>Formule : ${esc(p.variantLabel)}` : ""}${p.durationLabel ? `<br>Durée : ${esc(p.durationLabel)}` : ""}</p>${p.components.length ? `<ul>${p.components.map((c) => `<li>${esc(c.label)} · ${c.quantity}</li>`).join("")}</ul>` : ""}</section><section><p class="total">Total : <strong>${esc(p.totalLabel)}</strong></p></section><section><h2>Conditions commerciales</h2><div class="terms">${esc(p.terms)}</div></section></body></html>`;
}

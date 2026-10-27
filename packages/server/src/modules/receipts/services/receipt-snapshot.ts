import {
  financePaymentMethods,
  type FinanceDetail,
  type FinancePaymentEvent,
  type Receipt,
  type ReceiptCorrection,
  type ReceiptSnapshot,
  type PublicReceiptMetadata,
} from "@kfit/shared";
import { sumXaf, validXaf } from "../../finance/services/finance.policy.js";
import { ReceiptDomainError } from "./receipts.types.js";
export function receiptNumber(year: number, sequence: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !validXaf(sequence))
    throw new ReceiptDomainError("RECEIPT_NUMBER_CONFLICT");
  return `REC-${String(year).padStart(4, "0")}-${String(sequence).padStart(4, "0")}`;
}
export function correctionOf(
  source: Pick<FinancePaymentEvent, "amountXaf" | "correctableXaf">,
): ReceiptCorrection {
  if (
    !validXaf(source.amountXaf) ||
    !Number.isSafeInteger(source.correctableXaf) ||
    source.correctableXaf < 0 ||
    source.correctableXaf > source.amountXaf
  )
    throw new ReceiptDomainError("RECEIPT_INVALID_PAYMENT");
  return {
    originalAmountXaf: source.amountXaf,
    correctedAmountXaf: source.amountXaf - source.correctableXaf,
    effectiveAmountXaf: source.correctableXaf,
    correctionState:
      source.correctableXaf === source.amountXaf
        ? "none"
        : source.correctableXaf === 0
          ? "fully_corrected"
          : "partially_corrected",
  };
}
export function buildReceiptSnapshot(
  view: FinanceDetail,
  source: FinancePaymentEvent,
  header: {
    receiptNumber: string;
    customerName: string;
    subscriptionReference: string;
    issuedAt: string;
  },
): ReceiptSnapshot {
  if (
    source.eventType !== "payment_received" ||
    !source.confirmedAt ||
    !source.allocations.length ||
    !validXaf(source.amountXaf)
  )
    throw new ReceiptDomainError("RECEIPT_INVALID_PAYMENT");
  const cutoff = Date.parse(source.confirmedAt);
  if (
    !Number.isFinite(cutoff) ||
    view.paymentHistory.filter((p) => Date.parse(p.confirmedAt) === cutoff)
      .length !== 1
  )
    throw new ReceiptDomainError("RECEIPT_ISSUE_CONFLICT");
  const prefix = view.paymentHistory.filter(
    (p) => Date.parse(p.confirmedAt) < cutoff || p.id === source.id,
  );
  const paid = sumXaf(
    prefix.map((p) =>
      p.eventType === "payment_received" ? p.amountXaf : -p.amountXaf,
    ),
  );
  if (
    paid > view.agreedAmountXaf ||
    sumXaf(source.allocations.map((a) => a.amountXaf)) !== source.amountXaf
  )
    throw new ReceiptDomainError("RECEIPT_ISSUE_CONFLICT");
  const items = new Map(
    view.plans.flatMap((p) => p.installments.map((i) => [i.id, i] as const)),
  );
  return {
    ...header,
    templateVersion: "receipt-v1",
    balanceRule: "confirmed-position-v1",
    subscriptionId: view.subscriptionId,
    paymentEventId: source.id,
    amountXaf: source.amountXaf,
    currency: "XAF",
    paymentMethod: source.paymentMethod,
    occurredAt: source.occurredAt,
    confirmedAt: source.confirmedAt,
    agreedAmountXaf: view.agreedAmountXaf,
    confirmedPaidAfterPaymentXaf: paid,
    balanceAfterPaymentXaf: view.agreedAmountXaf - paid,
    allocations: source.allocations.map((a) => {
      const item = items.get(a.installmentId);
      if (!item || a.subscriptionId !== view.subscriptionId)
        throw new ReceiptDomainError("RECEIPT_INVALID_PAYMENT");
      return {
        installmentId: a.installmentId,
        paymentPlanId: a.paymentPlanId,
        sequenceNumber: item.sequenceNumber,
        dueDate: item.dueDate,
        amountXaf: a.amountXaf,
      };
    }),
  };
}
export function readReceiptSnapshot(value: unknown): ReceiptSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    v.templateVersion !== "receipt-v1" ||
    v.balanceRule !== "confirmed-position-v1" ||
    v.currency !== "XAF" ||
    !validXaf(v.amountXaf) ||
    !financePaymentMethods.some((m) => m === v.paymentMethod) ||
    ![
      "receiptNumber",
      "customerName",
      "subscriptionId",
      "subscriptionReference",
      "paymentEventId",
      "occurredAt",
      "confirmedAt",
      "issuedAt",
    ].every((k) => typeof v[k] === "string") ||
    ![
      "agreedAmountXaf",
      "confirmedPaidAfterPaymentXaf",
      "balanceAfterPaymentXaf",
    ].every(
      (k) =>
        typeof v[k] === "number" && Number.isSafeInteger(v[k]) && v[k] >= 0,
    ) ||
    !Array.isArray(v.allocations) ||
    !v.allocations.length ||
    !v.allocations.every(
      (a) =>
        a &&
        typeof a === "object" &&
        typeof a.installmentId === "string" &&
        typeof a.paymentPlanId === "string" &&
        typeof a.dueDate === "string" &&
        Number.isInteger(a.sequenceNumber) &&
        a.sequenceNumber > 0 &&
        validXaf(a.amountXaf),
    )
  )
    return null;
  return v as unknown as ReceiptSnapshot;
}
/** POL-01 D3: downloads left on the share link that opened the page. */
export const remainingDownloads = (link: {
  maxUses: number;
  useCount: number;
}) => Math.max(0, link.maxUses - link.useCount);
export function publicReceipt(
  r: Receipt,
  link: { maxUses: number; useCount: number },
): PublicReceiptMetadata {
  const s = r.snapshot,
    remaining = remainingDownloads(link);
  return {
    receiptNumber: r.receiptNumber,
    customerName: s.customerName,
    subscriptionReference: s.subscriptionReference,
    issuedAt: s.issuedAt,
    amountXaf: s.amountXaf,
    currency: "XAF",
    paymentMethod: s.paymentMethod,
    occurredAt: s.occurredAt,
    state: r.state,
    remainingDownloads: remaining,
    canDownload: remaining > 0,
    originalAmountXaf: r.originalAmountXaf,
    correctedAmountXaf: r.correctedAmountXaf,
    effectiveAmountXaf: r.effectiveAmountXaf,
    correctionState: r.correctionState,
  };
}
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (value: number) => `${value.toLocaleString("fr-FR")} FCFA`;
const date = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Libreville",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
export function receiptHtml(s: ReceiptSnapshot) {
  const methods = {
    cash: "Espèces",
    bank_transfer: "Virement bancaire",
    mobile_money: "Mobile Money",
  };
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:A4;margin:18mm}body{font:11pt Arial,sans-serif;color:#163b2b}h1{font-size:26pt}p{line-height:1.5}.brand{font-size:18pt;font-weight:bold}table{width:100%;border-collapse:collapse;font-size:10pt}th,td{padding:3mm;border-bottom:1px solid #ccc;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}.total{font-size:20pt;margin-top:10mm}.identity{overflow-wrap:anywhere}</style></head><body><p class="brand">K'FIT</p><h1>Reçu de paiement</h1><p>${esc(s.receiptNumber)}<br>Émis le ${esc(date(s.issuedAt))} - heure de Libreville</p><p class="identity">Client : ${esc(s.customerName)}<br>Abonnement : ${esc(s.subscriptionReference)}</p><p class="total">${esc(money(s.amountXaf))}</p><p>${esc(methods[s.paymentMethod])}<br>Paiement du ${esc(date(s.occurredAt))}<br>Confirmé le ${esc(date(s.confirmedAt))}</p><h2>Répartition du paiement</h2><table><thead><tr><th>Échéance</th><th>Date</th><th>Montant</th></tr></thead><tbody>${s.allocations.map((a) => `<tr><td>${a.sequenceNumber}</td><td>${esc(date(a.dueDate))}</td><td>${esc(money(a.amountXaf))}</td></tr>`).join("")}</tbody></table><p>Montant convenu à l’émission : ${esc(money(s.agreedAmountXaf))}<br>Total payé après ce paiement : ${esc(money(s.confirmedPaidAfterPaymentXaf))}<br>Reste à payer après ce paiement : ${esc(money(s.balanceAfterPaymentXaf))}</p><p>Document historique établi à partir du paiement confirmé. Modèle ${esc(s.templateVersion)}.</p></body></html>`;
}

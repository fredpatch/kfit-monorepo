import type { FinanceInstallmentStatus, FinancePaymentMethod, FinancePlanStatus, FinancialStatus, PaymentProofStatus, QuoteStatus } from "@kfit/shared";
import type { StatusDescriptor } from "../../lib/status-map.js";

/** Wording and tones of the « Paiements » tab (boards 15a–15c). Amounts stay in XAF in the admin. */
export const paymentMethods: Record<FinancePaymentMethod, string> = { cash: "Espèces", bank_transfer: "Virement bancaire", mobile_money: "Mobile Money" };

export const planStatus: Record<FinancePlanStatus, StatusDescriptor> = {
  draft: { label: "Brouillon", tone: "neutral" },
  active: { label: "Actif", tone: "success" },
  superseded: { label: "Remplacé", tone: "neutral" },
  settled: { label: "Soldé", tone: "success" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const installmentStatus: Record<FinanceInstallmentStatus, StatusDescriptor> = {
  upcoming: { label: "À venir", tone: "info" },
  due: { label: "À échéance", tone: "warning" },
  partially_paid: { label: "Partiellement payée", tone: "warning" },
  paid: { label: "Payée", tone: "success" },
  overdue: { label: "En retard", tone: "danger" },
};

export const settlementLabel: Record<FinancialStatus, string> = { unpaid: "Non payé", partially_paid: "Partiellement payé", paid: "Payé" };

export const proofStatus: Record<PaymentProofStatus, StatusDescriptor> = {
  pending_review: { label: "À vérifier", tone: "waitlist" },
  confirmed: { label: "Confirmé", tone: "success" },
  partially_confirmed: { label: "Partiellement confirmé", tone: "success" },
  correction_requested: { label: "Correction demandée", tone: "warning" },
  rejected: { label: "Rejeté", tone: "danger" },
  duplicate: { label: "Doublon", tone: "neutral" },
  superseded: { label: "Remplacé", tone: "neutral" },
};

export const quoteStatus: Record<QuoteStatus, StatusDescriptor> = {
  draft: { label: "Brouillon", tone: "neutral" },
  issued: { label: "Émis", tone: "info" },
  accepted: { label: "Accepté", tone: "success" },
  declined: { label: "Refusé", tone: "danger" },
  changes_requested: { label: "Modification demandée", tone: "warning" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const fileKind = (mime: string) =>
  mime === "application/pdf" ? "PDF" : mime === "image/png" ? "Image PNG" : mime === "image/webp" ? "Image WebP" : mime === "image/jpeg" ? "Image JPEG" : "Fichier";

export const sizeKo = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR")} Ko`;

/** « échéance 2 », « échéances 2 et 3 », « échéances 1, 2 et 3 ». */
export function installmentsLabel(numbers: number[]): string {
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  if (unique.length === 0) return "";
  if (unique.length === 1) return `échéance ${unique[0]}`;
  return `échéances ${unique.slice(0, -1).join(", ")} et ${unique.at(-1)}`;
}

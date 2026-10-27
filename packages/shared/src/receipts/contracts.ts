import type { FinancePaymentMethod } from "../finance/contracts.js";
export const receiptStates = ["issued", "voided"] as const;
export type ReceiptState = (typeof receiptStates)[number];
export const receiptCorrectionStates = [
  "none",
  "partially_corrected",
  "fully_corrected",
] as const;
export type ReceiptCorrectionState = (typeof receiptCorrectionStates)[number];
export interface ReceiptSnapshot {
  templateVersion: "receipt-v1";
  receiptNumber: string;
  customerName: string;
  subscriptionId: string;
  subscriptionReference: string;
  paymentEventId: string;
  amountXaf: number;
  currency: "XAF";
  paymentMethod: FinancePaymentMethod;
  occurredAt: string;
  confirmedAt: string;
  issuedAt: string;
  allocations: Array<{
    installmentId: string;
    paymentPlanId: string;
    sequenceNumber: number;
    dueDate: string;
    amountXaf: number;
  }>;
  agreedAmountXaf: number;
  confirmedPaidAfterPaymentXaf: number;
  balanceAfterPaymentXaf: number;
  balanceRule: "confirmed-position-v1";
}
export interface ReceiptCorrection {
  originalAmountXaf: number;
  correctedAmountXaf: number;
  effectiveAmountXaf: number;
  correctionState: ReceiptCorrectionState;
}
export interface ReceiptLink {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  maxUses: number;
  useCount: number;
}
export interface Receipt extends ReceiptCorrection {
  id: string;
  customerId: string;
  paymentEventId: string;
  subscriptionId: string;
  receiptNumber: string;
  issuedAt: string;
  state: ReceiptState;
  voidedAt: string | null;
  voidReason: string | null;
  snapshot: ReceiptSnapshot;
  pdfDocumentId: string;
  links: ReceiptLink[];
}
export interface ReceiptsResponse {
  receipts: Receipt[];
}
export interface ReceiptResponse {
  receipt: Receipt;
  replayed?: boolean;
}
export interface ReceiptShareInput {
  expiresAt: string;
  maxUses?: number;
}
export interface ReceiptVoidInput {
  voidReason: string;
}
export interface ReceiptShareResponse extends ReceiptResponse {
  share: { token: string; tokenId: string; expiresAt: string };
}
export interface PublicReceiptMetadata extends ReceiptCorrection {
  receiptNumber: string;
  customerName: string;
  subscriptionReference: string;
  issuedAt: string;
  amountXaf: number;
  currency: "XAF";
  paymentMethod: FinancePaymentMethod;
  occurredAt: string;
  state: ReceiptState;
  /** POL-01 D3: maxUses − useCount, never below 0; canDownload is remainingDownloads > 0. */
  remainingDownloads: number;
  canDownload: boolean;
}
export const receiptApiRoutes = {
  list: "/admin/subscriptions/:subscriptionId/receipts",
  detail: "/admin/receipts/:receiptId",
  issue: "/admin/payment-events/:paymentEventId/receipt",
  pdf: "/admin/receipts/:receiptId/pdf",
  share: "/admin/receipts/:receiptId/share",
  revoke: "/admin/receipt-links/:tokenId/revoke",
  void: "/admin/receipts/:receiptId/void",
  publicMetadata: "/public/receipts/:token",
  publicPdf: "/public/receipts/:token/pdf",
} as const;
export const receiptErrorCodes = [
  "RECEIPT_NOT_FOUND",
  "RECEIPT_INVALID_INPUT",
  "RECEIPT_INVALID_PAYMENT",
  "RECEIPT_ALREADY_EXISTS",
  "RECEIPT_NUMBER_CONFLICT",
  "RECEIPT_ISSUE_CONFLICT",
  "RECEIPT_PDF_FAILURE",
  "RECEIPT_LINK_INVALID",
  "RECEIPT_LINK_EXPIRED",
  "RECEIPT_LINK_REVOKED",
  "RECEIPT_LINK_CONSUMED",
  "RECEIPT_VOID_NOT_ALLOWED",
  "RECEIPT_ALREADY_VOIDED",
  "RECEIPT_CONCURRENCY_CONFLICT",
  "RECEIPT_ADMIN_FORBIDDEN",
  "RECEIPT_RATE_LIMITED",
  "RECEIPT_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type ReceiptErrorCode = (typeof receiptErrorCodes)[number];
/** POL-01 D3: a download refused with one of these leaves the link unusable; the page disables the button and keeps the message. */
export const receiptLinkClosedErrors = [
  "RECEIPT_LINK_CONSUMED",
  "RECEIPT_LINK_EXPIRED",
  "RECEIPT_LINK_REVOKED",
] as const satisfies readonly ReceiptErrorCode[];
export const isReceiptLinkClosed = (code: unknown) =>
  receiptLinkClosedErrors.some((closed) => closed === code);

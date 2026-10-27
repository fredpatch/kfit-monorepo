import type { FinancePaymentMethod } from "../finance/contracts.js";
export const paymentProofStatuses = [
  "pending_review",
  "confirmed",
  "partially_confirmed",
  "correction_requested",
  "rejected",
  "duplicate",
  "superseded",
] as const;
export type PaymentProofStatus = (typeof paymentProofStatuses)[number];
export const paymentProofMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const paymentProofMaxBytes = 10 * 1024 * 1024;
export const paymentProofClaimsHeader = "x-proof-claims";
export const paymentProofDocumentType = "payment_proof" as const;
export const paymentProofDocumentOwnerType = "payment_proof" as const;
export interface PaymentProofClaims {
  claimedAmountXaf: number;
  claimedPaymentMethod: FinancePaymentMethod;
  claimedOccurredAt: string;
  claimedExternalReference?: string | null;
}
export interface PaymentProofConfirmInput {
  confirmedAmountXaf: number;
  confirmedPaymentMethod: FinancePaymentMethod;
  confirmedOccurredAt: string;
  externalReference?: string | null;
  reviewNote?: string | null;
}
export interface PaymentProofReviewInput {
  reviewNote?: string | null;
  customerMessage?: string | null;
}
export interface PaymentProofLinkInput {
  expiresAt: string;
  supersedesProofId?: string | null;
}
export interface PaymentProof {
  id: string;
  subscriptionId: string;
  customerId: string;
  documentId: string;
  documentVersionId: string;
  status: PaymentProofStatus;
  submittedVia: "public_link";
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  claimedAmountXaf: number;
  claimedPaymentMethod: FinancePaymentMethod;
  claimedOccurredAt: string;
  claimedExternalReference: string | null;
  confirmedAmountXaf: number | null;
  confirmedPaymentMethod: FinancePaymentMethod | null;
  confirmedOccurredAt: string | null;
  paymentEventId: string | null;
  supersedesProofId: string | null;
  reviewNote: string | null;
  customerMessage: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}
export interface PaymentProofLink {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  usedAt: string | null;
  supersedesProofId: string | null;
}
export interface PaymentProofsResponse {
  proofs: PaymentProof[];
  links: PaymentProofLink[];
}
export interface PaymentProofResponse {
  proof: PaymentProof;
}
export interface PaymentProofLinkResponse {
  token: string;
  link: PaymentProofLink;
}
export interface PublicPaymentProofMetadata {
  subscriptionReference: string;
  expiresAt: string;
  customerMessage: string | null;
  acceptedMimeTypes: readonly string[];
  maxBytes: number;
}
export const paymentProofApiRoutes = {
  list: "/admin/subscriptions/:subscriptionId/payment-proofs",
  detail: "/admin/payment-proofs/:proofId",
  document: "/admin/payment-proofs/:proofId/document",
  issueLink: "/admin/subscriptions/:subscriptionId/payment-proof-links",
  revokeLink: "/admin/payment-proof-links/:tokenId/revoke",
  confirm: "/admin/payment-proofs/:proofId/confirm",
  partiallyConfirm: "/admin/payment-proofs/:proofId/partially-confirm",
  requestCorrection: "/admin/payment-proofs/:proofId/request-correction",
  reject: "/admin/payment-proofs/:proofId/reject",
  markDuplicate: "/admin/payment-proofs/:proofId/mark-duplicate",
  publicMetadata: "/public/payment-proofs/:token",
  upload: "/public/payment-proofs/:token/upload",
} as const;
export const paymentProofErrorCodes = [
  "PAYMENT_PROOF_NOT_FOUND",
  "PAYMENT_PROOF_INVALID_INPUT",
  "PAYMENT_PROOF_INVALID_STATE",
  "PAYMENT_PROOF_LINK_INVALID",
  "PAYMENT_PROOF_LINK_EXPIRED",
  "PAYMENT_PROOF_LINK_REVOKED",
  "PAYMENT_PROOF_LINK_CONSUMED",
  "PAYMENT_PROOF_UPLOAD_INVALID",
  "PAYMENT_PROOF_DUPLICATE_UPLOAD",
  "PAYMENT_PROOF_MALWARE_DETECTED",
  "PAYMENT_PROOF_REVIEW_CONFLICT",
  "PAYMENT_PROOF_AMOUNT_INVALID",
  "PAYMENT_PROOF_FINANCE_CONFLICT",
  "PAYMENT_PROOF_ADMIN_FORBIDDEN",
  "PAYMENT_PROOF_RATE_LIMITED",
  "PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type PaymentProofErrorCode = (typeof paymentProofErrorCodes)[number];

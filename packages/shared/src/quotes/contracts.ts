export const quoteDecisions = ["accepted", "declined", "changes_requested"] as const;
export type QuoteDecision = typeof quoteDecisions[number];
export const quoteStatuses = ["draft", "issued", ...quoteDecisions, "cancelled"] as const;
export type QuoteStatus = typeof quoteStatuses[number];
export const quoteErrorCodes = ["QUOTE_NOT_FOUND", "QUOTE_INVALID_INPUT", "QUOTE_INVALID_STATE", "QUOTE_VERSION_IMMUTABLE", "QUOTE_NUMBER_CONFLICT", "QUOTE_VERSION_CONFLICT", "QUOTE_LINK_INVALID", "QUOTE_LINK_EXPIRED", "QUOTE_LINK_REVOKED", "QUOTE_LINK_CONSUMED", "QUOTE_RESPONSE_CONFLICT", "QUOTE_SYNC_REQUIRES_ACCEPTANCE", "QUOTE_SYNC_FINANCE_CONFLICT", "QUOTE_RATE_LIMITED", "QUOTE_ADMIN_FORBIDDEN", "QUOTE_ROUTE_UNEXPECTED_FAILURE"] as const;
export type QuoteErrorCode = typeof quoteErrorCodes[number];
export interface QuoteDraftInput { amountXaf: number; validUntil: string; terms: string }
export interface QuoteShareInput { expiresAt: string }
export interface QuoteRespondInput { decision: QuoteDecision }
export interface QuoteSnapshot {
  quoteNumber: string; versionNumber: number; customerName: string; subscriptionReference: string;
  serviceLabel: string; variantLabel: string | null; amountXaf: number; currency: "XAF";
  durationValue: number | null; durationUnit: string | null;
  components: Array<{ label: string; quantity: number }>;
  issuedAt: string; validUntil: string; terms: string; templateVersion: "quote-v1";
}
export interface QuoteVersion {
  id: string; versionNumber: number; amountXaf: number; currency: "XAF"; validUntil: string | null; terms: string;
  issuedAt: string | null; response: QuoteDecision | null; respondedAt: string | null;
  pdfDocumentId: string | null; snapshot: QuoteSnapshot | null; synchronized: boolean;
}
export interface QuoteLink { id: string; versionId: string; expiresAt: string; revokedAt: string | null; usedAt: string | null }
export interface QuoteDetail {
  id: string; quoteNumber: string | null; subscriptionId: string; customerId: string; requestId: string | null;
  status: QuoteStatus; currentVersionId: string | null; createdAt: string; versions: QuoteVersion[]; links: QuoteLink[];
}
export interface QuotesResponse { quotes: QuoteDetail[]; acceptedQuoteVersionId: string | null }
export interface QuoteResponse { quote: QuoteDetail; share?: { token: string; tokenId: string; expiresAt: string } }
export interface PublicQuoteResponse { snapshot: QuoteSnapshot; response: QuoteDecision | null; canRespond: boolean; replayed?: boolean }
export const quoteApiRoutes = {
  list: "/admin/subscriptions/:subscriptionId/quotes", detail: "/admin/quotes/:quoteId",
  create: "/admin/subscriptions/:subscriptionId/quotes", version: "/admin/quotes/:quoteId/versions",
  edit: "/admin/quote-versions/:versionId/edit-draft", issue: "/admin/quote-versions/:versionId/issue",
  pdf: "/admin/quote-versions/:versionId/pdf", share: "/admin/quote-versions/:versionId/share",
  revoke: "/admin/quote-links/:tokenId/revoke", synchronize: "/admin/quote-versions/:versionId/synchronize",
  cancel: "/admin/quotes/:quoteId/cancel", publicDetail: "/public/quotes/:token",
  publicPdf: "/public/quotes/:token/pdf", respond: "/public/quotes/:token/respond",
} as const;

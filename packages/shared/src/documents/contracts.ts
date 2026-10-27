export const documentTypes = [
  "meal_plan",
  "workout_plan",
  "progress_summary",
  "progress_photo",
  "other_personalized",
] as const;
export type PersonalizedDocumentType = (typeof documentTypes)[number];
export const documentSensitivities = ["private", "sensitive_health"] as const;
export type DocumentSensitivity = (typeof documentSensitivities)[number];
export const documentStatuses = [
  "draft",
  "available",
  "revoked",
  "archived",
  "pending_purge",
  "purged",
] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

export const documentApiRoutes = {
  list: "/admin/subscriptions/:subscriptionId/documents",
  create: "/admin/subscriptions/:subscriptionId/documents",
  detail: "/admin/documents/:documentId",
  addVersion: "/admin/documents/:documentId/versions",
  adminDownload: "/admin/document-versions/:versionId/download",
  issueLink: "/admin/document-versions/:versionId/delivery-links",
  revokeLink: "/admin/document-delivery-links/:tokenId/revoke",
  revoke: "/admin/documents/:documentId/revoke",
  archive: "/admin/documents/:documentId/archive",
  generateProgressSummary:
    "/admin/subscriptions/:subscriptionId/progress-summary/generate",
  addProgressPhoto: "/admin/progress-measurements/:measurementId/photos",
  publicMeta: "/public/documents/:token",
  publicVerify: "/public/documents/:token/verify",
  publicDownload: "/public/documents/:token/download",
} as const;

export const documentErrorCodes = [
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_VERSION_NOT_FOUND",
  "DOCUMENT_INVALID_INPUT",
  "DOCUMENT_TYPE_INVALID",
  "DOCUMENT_STATUS_INVALID",
  "DOCUMENT_FILE_TOO_LARGE",
  "DOCUMENT_FILE_TYPE_UNSUPPORTED",
  "DOCUMENT_FILE_SIGNATURE_INVALID",
  "DOCUMENT_FILE_INFECTED",
  "DOCUMENT_FILE_SCAN_FAILED",
  "DOCUMENT_DUPLICATE_UPLOAD",
  "DOCUMENT_STORAGE_FAILURE",
  "DOCUMENT_HEALTH_CONSENT_REQUIRED",
  "DOCUMENT_PHOTO_CONSENT_REQUIRED",
  "DOCUMENT_MEASUREMENT_INVALID",
  "DOCUMENT_LINK_INVALID",
  "DOCUMENT_LINK_EXPIRED",
  "DOCUMENT_LINK_REVOKED",
  "DOCUMENT_LINK_EXHAUSTED",
  "DOCUMENT_VERIFICATION_REQUIRED",
  "DOCUMENT_VERIFICATION_INVALID",
  "DOCUMENT_VERIFICATION_LOCKED",
  "DOCUMENT_ADMIN_FORBIDDEN",
  "DOCUMENT_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type DocumentErrorCode = (typeof documentErrorCodes)[number];

export type DocumentVersionSummary = {
  id: string;
  versionNumber: number;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  malwareScanStatus: "clean";
  createdAt: string;
  isCurrent: boolean;
};
export type DocumentDeliveryLinkSummary = {
  id: string;
  versionId: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  state: "available" | "expired" | "revoked" | "exhausted";
  requiresVerification: boolean;
};
export type PersonalizedDocument = {
  id: string;
  subscriptionId: string;
  documentType: PersonalizedDocumentType;
  sensitivity: DocumentSensitivity;
  status: DocumentStatus;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: DocumentVersionSummary[];
  deliveryLinks: DocumentDeliveryLinkSummary[];
};
export type DocumentsResponse = {
  subscriptionId: string;
  documents: PersonalizedDocument[];
};
export type DocumentResponse = { document: PersonalizedDocument };
export type IssueDocumentLinkInput = { expiresAt: string; maxUses?: number };
export type IssueDocumentLinkResponse = {
  link: DocumentDeliveryLinkSummary;
  token: string;
  verificationCode?: string;
};
export type PublicDocumentMetaResponse = {
  document: {
    documentType: PersonalizedDocumentType;
    versionNumber: number;
    expiresAt: string;
    requiresVerification: boolean;
  };
};
export type VerifyDocumentInput = { code: string };
export type VerifyDocumentResponse = { verified: true; verifiedUntil: string };

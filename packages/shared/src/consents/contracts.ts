export const consentTypes = ["service_terms", "privacy_notice", "health_data", "progress_photo_storage", "marketing", "publication"] as const;
export type ConsentType = (typeof consentTypes)[number];
export const requiredConsentTypes = ["service_terms", "privacy_notice"] as const;
export type RequiredConsentType = (typeof requiredConsentTypes)[number];
export const optionalConsentTypes = ["health_data", "progress_photo_storage", "marketing", "publication"] as const;
export type OptionalConsentType = (typeof optionalConsentTypes)[number];
export type ConsentDecision = "granted" | "refused" | "revoked";
// Holds exactly the requested set: both required types for onboarding, the coach-picked optional types otherwise.
export type ConsentDecisions = Partial<Record<ConsentType, "granted" | "refused">>;
export type ConsentCaptureInput = { decisions: ConsentDecisions };
export type CoachConsentCaptureInput = ConsentCaptureInput & { expectedDefinitionIds: string[] };
export type ConsentLinkInput = { expiresAt: string };
export type OptionalConsentLinkInput = { types: OptionalConsentType[]; expiresAt?: string };
export type OptionalConsentCaptureInput = { decisions: Partial<Record<OptionalConsentType, "granted" | "refused">>; expectedDefinitionIds: string[] };
export const consentApiRoutes = {
  detail: "/admin/subscriptions/:subscriptionId/consents",
  link: "/admin/subscriptions/:subscriptionId/consent-link",
  revokeLink: "/admin/subscriptions/:subscriptionId/consent-link/:tokenId/revoke",
  capture: "/admin/subscriptions/:subscriptionId/consents/coach-capture",
  optionalLink: "/admin/subscriptions/:subscriptionId/consent-requests",
  optionalCapture: "/admin/subscriptions/:subscriptionId/consents/optional-capture",
  revoke: "/admin/subscriptions/:subscriptionId/consents/:consentType/revoke",
  public: "/public/consents/:token",
} as const;
export const consentDefinitionApiRoutes = {
  list: "/admin/consent-definitions",
  detail: "/admin/consent-definitions/:definitionId",
  publishImpact: "/admin/consent-definitions/:definitionId/publish-impact",
  publish: "/admin/consent-definitions/:definitionId/publish",
} as const;
export const consentErrorCodes = ["CONSENT_INVALID_INPUT", "CONSENT_NOT_FOUND", "CONSENT_ADMIN_FORBIDDEN", "CONSENT_INVALID_STATE",
  "CONSENT_DEFINITIONS_MISSING", "CONSENT_DEFINITION_IMMUTABLE", "CONSENT_VERSION_CONFLICT", "CONSENT_DEFINITIONS_CHANGED", "CONSENT_HISTORY_INVALID",
  "CONSENT_LINK_INVALID", "CONSENT_LINK_EXPIRED", "CONSENT_LINK_REVOKED", "CONSENT_LINK_CONSUMED", "CONSENT_LINK_STALE",
  "CONSENT_REVOCATION_FORBIDDEN", "CONSENT_DECISION_MISSING", "CONSENT_TYPE_NOT_REQUESTED", "CONSENT_RATE_LIMITED", "CONSENT_ROUTE_UNEXPECTED_FAILURE"] as const;
export type ConsentErrorCode = (typeof consentErrorCodes)[number];
export type ConsentDefinition = {
  id: string; consentType: ConsentType; version: string; title: string; content: string; contentHash: string;
  status: "draft" | "published" | "retired"; publishedAt: string | null; retiredAt: string | null;
};
export type ConsentRecord = {
  id: string; consentType: ConsentType; consentDefinitionId: string; definitionVersion: string; decision: ConsentDecision;
  capturedVia: "public_link" | "coach_assisted"; capturedAt: string; capturedByUserId: string | null;
  secureAccessTokenId: string | null; supersedesConsentRecordId: string | null;
};
export type ConsentLinkState = { id: string; expiresAt: string; state: "available" | "expired" | "revoked" | "consumed" | "stale" };
export type ConsentRequestLinkState = ConsentLinkState & { kind: "onboarding" | "optional"; types: ConsentType[] };
// renewal_required: the current grant is on an older version than the latest published one, so it no longer counts.
export type OptionalConsentState = "granted" | "refused" | "revoked" | "renewal_required" | "none";
export type ConsentDetail = {
  subscription: { id: string; reference: string };
  definitions: ConsentDefinition[]; current: ConsentRecord[]; history: ConsentRecord[];
  requiredBundle: { satisfied: boolean; missingDefinitions: RequiredConsentType[] };
  optionalStates: Record<OptionalConsentType, OptionalConsentState>;
  links: ConsentRequestLinkState[];
};
export type ConsentPublicDocument = { subscriptionReference: string; definitions: ConsentDefinition[] };
export type ConsentResponse = { consents: ConsentDetail };
export type ConsentLinkResponse = { link: ConsentRequestLinkState; token: string };
export type ConsentPublicResponse = { document: ConsentPublicDocument };
export type ConsentDefinitionSummary = Omit<ConsentDefinition, "content">;
export type ConsentDefinitionDraftInput = { consentType: ConsentType; title: string; content: string };
export type ConsentDefinitionDraftUpdate = { title?: string; content?: string };
export type ConsentDefinitionListResponse = { definitions: { consentType: ConsentType; versions: ConsentDefinitionSummary[] }[] };
export type ConsentDefinitionResponse = { definition: ConsentDefinition };
export type ConsentPublishImpactResponse = { type: ConsentType; activeSubscriptionsAffected: number };

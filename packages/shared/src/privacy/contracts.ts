/* ------------------------------------------------------------------ */
/* S7.3 privacy contract (Gate 1 approved 2026-10-25, D1–D12).         */
/* ------------------------------------------------------------------ */

export const privacySubjectTypes = ["customer", "prospect"] as const;
export type PrivacySubjectType = (typeof privacySubjectTypes)[number];

/** D7. */
export const retentionHoldScopeTypes = ["customer", "prospect", "document"] as const;
export type RetentionHoldScopeType = (typeof retentionHoldScopeTypes)[number];
export const retentionHoldTypes = ["legal", "dispute", "accounting"] as const;
export type RetentionHoldType = (typeof retentionHoldTypes)[number];
export const retentionHoldStatusValues = ["active", "released"] as const;
export type RetentionHoldStatus = (typeof retentionHoldStatusValues)[number];

export const retentionHoldTypeLabels: Record<RetentionHoldType, string> = {
  legal: "Obligation légale",
  dispute: "Litige",
  accounting: "Comptabilité",
};

export const privacyApiRoutes = {
  archiveCustomer: "/admin/customers/:customerId/archive",
  archiveProspect: "/admin/prospects/:prospectId/archive",
  anonymizeCustomer: "/admin/customers/:customerId/anonymize",
  anonymizeProspect: "/admin/prospects/:prospectId/anonymize",
  holds: "/admin/retention-holds",
  releaseHold: "/admin/retention-holds/:holdId/release",
} as const;

export const privacyErrorCodes = [
  "PRIVACY_INVALID_INPUT",
  "PRIVACY_ADMIN_FORBIDDEN",
  "PRIVACY_SUBJECT_NOT_FOUND",
  "PRIVACY_SUBJECT_NOT_ARCHIVED",
  "PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION",
  "PRIVACY_SUBJECT_HAS_OPEN_REQUEST",
  "PRIVACY_CONFIRMATION_MISMATCH",
  "PRIVACY_RETENTION_HOLD_ACTIVE",
  "PRIVACY_HOLD_ALREADY_ACTIVE",
  "PRIVACY_HOLD_NOT_FOUND",
  "PRIVACY_HOLD_ALREADY_RELEASED",
  "PRIVACY_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type PrivacyErrorCode = (typeof privacyErrorCodes)[number];

/** D6: the only privacy key of the widened settings registry (declared in notifications/contracts.ts). */
export const privacyPurgeDelayDaysKey = "privacy.purge.delay_days" as const;

export type ArchiveSubjectResponse = { subjectType: PrivacySubjectType; subjectId: string; archivedAt: string };
/** D9: the subject's full name as displayed; never logged or audited. */
export type AnonymizeSubjectInput = { confirmName: string };
/** D10: `alreadyAnonymized` is true when the call returned the existing event. */
export type AnonymizeSubjectResponse = {
  anonymizationEventId: string;
  subjectType: PrivacySubjectType;
  subjectId: string;
  executedAt: string;
  alreadyAnonymized: boolean;
};

export type RetentionHoldItem = {
  id: string;
  scopeType: RetentionHoldScopeType;
  scopeId: string;
  holdType: RetentionHoldType;
  reason: string;
  status: RetentionHoldStatus;
  startedAt: string;
  releasedAt: string | null;
};
export type RetentionHoldListResponse = { holds: RetentionHoldItem[] };
export type RetentionHoldResponse = { hold: RetentionHoldItem };
export type CreateRetentionHoldInput = { scopeType: RetentionHoldScopeType; scopeId: string; holdType: RetentionHoldType; reason: string };

export const RETENTION_HOLD_REASON_MIN = 3;
export const RETENTION_HOLD_REASON_MAX = 500;
export const CONFIRM_NAME_MAX = 200;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPrivacyUuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);
const onlyKeys = (input: object, keys: string[]) => Object.keys(input).every((key) => keys.includes(key));

export function parseAnonymizeSubjectInput(input: unknown): AnonymizeSubjectInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input) || !onlyKeys(input, ["confirmName"])) return null;
  const { confirmName } = input as { confirmName?: unknown };
  if (typeof confirmName !== "string" || confirmName.trim() === "" || confirmName.length > CONFIRM_NAME_MAX) return null;
  return { confirmName };
}

export function parseCreateRetentionHoldInput(input: unknown): CreateRetentionHoldInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input) || !onlyKeys(input, ["scopeType", "scopeId", "holdType", "reason"])) return null;
  const { scopeType, scopeId, holdType, reason } = input as Record<string, unknown>;
  if (!isOneOf(retentionHoldScopeTypes, scopeType) || !isPrivacyUuid(scopeId) || !isOneOf(retentionHoldTypes, holdType) || typeof reason !== "string") return null;
  const trimmed = reason.trim();
  if (trimmed.length < RETENTION_HOLD_REASON_MIN || trimmed.length > RETENTION_HOLD_REASON_MAX) return null;
  return { scopeType, scopeId, holdType, reason: trimmed };
}

export function parseRetentionHoldListQuery(query: unknown): { scopeType: RetentionHoldScopeType; scopeId: string } | null {
  if (!query || typeof query !== "object") return null;
  const { scopeType, scopeId } = query as Record<string, unknown>;
  return isOneOf(retentionHoldScopeTypes, scopeType) && isPrivacyUuid(scopeId) ? { scopeType, scopeId } : null;
}

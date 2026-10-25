/*
 * TEST-01 (Gate 1 approved 2026-10-25): dev-only « Données de test » cleanup of integration fixtures leaked into kfit_dev.
 * Two steps (D6): analyse (counts only, no names) then purge with the analysed fingerprint.
 */
export const devToolsApiRoutes = {
  testData: "/admin/dev/test-data",
  testDataPurge: "/admin/dev/test-data/purge",
} as const;
export const devToolsErrorCodes = ["DEV_TOOLS_UNAVAILABLE", "DEV_TEST_DATA_CHANGED", "DEV_TOOLS_INVALID_INPUT", "DEV_TOOLS_ADMIN_FORBIDDEN", "DEV_TOOLS_ROUTE_UNEXPECTED_FAILURE"] as const;
export type DevToolsErrorCode = (typeof devToolsErrorCodes)[number];

/** TEST-01 D5: every table a purge may delete from. The server plan orders them (children first). */
export const testDataKinds = [
  "external_access_events", "questionnaire_answers", "questionnaire_submissions", "questionnaire_questions", "questionnaire_templates",
  "notification_email_outbox", "notifications", "appointment_events", "appointments", "component_events", "follow_up_events", "follow_ups",
  "goal_events", "goals", "medical_clearance_records", "onboarding_items", "consent_records", "payment_allocations", "receipts", "payment_proofs",
  "payment_events", "installments", "payment_plans", "progress_photos", "progress_measurements", "subscription_follow_up_cadence_history",
  "subscription_pauses", "subscription_status_history", "subscription_components", "quote_versions", "quotes", "document_versions", "documents",
  "secure_access_tokens", "retention_holds", "subscriptions", "qualification_reviews", "waitlist_entries", "contact_attempts", "service_requests",
  "customers", "prospects", "consent_definitions", "service_policies", "service_components", "service_variants", "services",
] as const;
export type TestDataKind = (typeof testDataKinds)[number];
/** TEST-01 D5: user accounts are never deleted; synthetic ones are only reported as kept. */
export type TestDataKeptKind = TestDataKind | "users";
export type TestDataCounts<K extends string = TestDataKind> = Partial<Record<K, number>>;

/** GET analysis: only non-zero kinds appear; no names, no identifiers (D6). */
export interface TestDataAnalysisResponse {
  counts: TestDataCounts;
  kept: TestDataCounts<TestDataKeptKind>;
  fingerprint: string;
}
export interface TestDataPurgeInput { fingerprint: string }
export interface TestDataPurgeResponse { counts: TestDataCounts }

const fingerprintPattern = /^[0-9a-f]{64}$/;
export function parseTestDataPurgeInput(input: unknown): TestDataPurgeInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  const { fingerprint } = input as { fingerprint?: unknown };
  return keys.length === 1 && typeof fingerprint === "string" && fingerprintPattern.test(fingerprint) ? { fingerprint } : null;
}

export function testDataTotal(counts: TestDataCounts<string>): number {
  return Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

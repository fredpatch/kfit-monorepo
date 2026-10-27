import {
  getTableConfig,
  type PgColumn,
  type PgTable,
} from "drizzle-orm/pg-core";
import type { TestDataKind } from "@kfit/shared";
import {
  appointmentEvents,
  appointments,
  componentEvents,
  consentDefinitions,
  consentRecords,
  contactAttempts,
  customers,
  documents,
  documentVersions,
  externalAccessEvents,
  followUpEvents,
  followUps,
  goalEvents,
  goals,
  installments,
  medicalClearanceRecords,
  notificationEmailOutbox,
  notifications,
  onboardingItems,
  paymentAllocations,
  paymentEvents,
  paymentPlans,
  paymentProofs,
  progressMeasurements,
  progressPhotos,
  prospects,
  qualificationReviews,
  questionnaireAnswers,
  questionnaireQuestions,
  questionnaireSubmissions,
  questionnaireTemplates,
  quotes,
  quoteVersions,
  receipts,
  retentionHolds,
  secureAccessTokens,
  serviceComponents,
  servicePolicies,
  serviceRequests,
  services,
  serviceVariants,
  subscriptionComponents,
  subscriptionFollowUpCadenceHistory,
  subscriptionPauses,
  subscriptions,
  subscriptionStatusHistory,
  waitlistEntries,
} from "../../../db/schema/index.js";

type PlanTable = PgTable & { id: PgColumn };

/**
 * TEST-01 D7: the one deletion order, children first. FK edges are read from the Drizzle schema (test-data.plan.test.ts proves the
 * order and that every table with an FK into a listed table is listed). users, audit_events and anonymization_events are never here (D5).
 */
export const testDataPurgePlan = [
  ["external_access_events", externalAccessEvents],
  ["questionnaire_answers", questionnaireAnswers],
  ["questionnaire_submissions", questionnaireSubmissions],
  ["questionnaire_questions", questionnaireQuestions],
  ["questionnaire_templates", questionnaireTemplates],
  ["notification_email_outbox", notificationEmailOutbox],
  ["notifications", notifications],
  ["appointment_events", appointmentEvents],
  ["appointments", appointments],
  ["component_events", componentEvents],
  ["follow_up_events", followUpEvents],
  ["follow_ups", followUps],
  ["goal_events", goalEvents],
  ["goals", goals],
  ["medical_clearance_records", medicalClearanceRecords],
  ["onboarding_items", onboardingItems],
  ["consent_records", consentRecords],
  ["payment_allocations", paymentAllocations],
  ["receipts", receipts],
  ["payment_proofs", paymentProofs],
  ["payment_events", paymentEvents],
  ["installments", installments],
  ["payment_plans", paymentPlans],
  ["progress_photos", progressPhotos],
  ["progress_measurements", progressMeasurements],
  [
    "subscription_follow_up_cadence_history",
    subscriptionFollowUpCadenceHistory,
  ],
  ["subscription_pauses", subscriptionPauses],
  ["subscription_status_history", subscriptionStatusHistory],
  ["subscription_components", subscriptionComponents],
  ["quote_versions", quoteVersions],
  ["quotes", quotes],
  ["document_versions", documentVersions],
  ["documents", documents],
  ["secure_access_tokens", secureAccessTokens],
  ["retention_holds", retentionHolds],
  ["subscriptions", subscriptions],
  ["qualification_reviews", qualificationReviews],
  ["waitlist_entries", waitlistEntries],
  ["contact_attempts", contactAttempts],
  ["service_requests", serviceRequests],
  ["customers", customers],
  ["prospects", prospects],
  ["consent_definitions", consentDefinitions],
  ["service_policies", servicePolicies],
  ["service_components", serviceComponents],
  ["service_variants", serviceVariants],
  ["services", services],
] as const satisfies ReadonlyArray<readonly [TestDataKind, PlanTable]>;

/** TEST-01 D5: fixture marker (integration-fixtures.ts testFixtureName) and the two pre-POL-01 names of cleanup-test-fixtures.sql. */
export const TEST_FIXTURE_PREFIX = "[TEST] ";
export const LEGACY_TEST_MARKERS = [
  "Integration test service",
  "Integration Test",
] as const;
export const isTestLabel = (label: string) =>
  label.startsWith(TEST_FIXTURE_PREFIX) ||
  LEGACY_TEST_MARKERS.some((marker) => marker === label);

/** TEST-01 D5: roots are selected by their own label only, never through a reference (a real customer of a test prospect stays real). */
export const testDataRootLabels = {
  services: services.name,
  prospects: prospects.fullName,
  customers: customers.fullName,
  consent_definitions: consentDefinitions.title,
} as const satisfies Partial<Record<TestDataKind, PgColumn>>;
export type TestDataRootKind = keyof typeof testDataRootLabels;

/** TEST-01 D5: a row referencing a non-test customer (or that customer's subscription) is real data and is kept with what it needs. */
export const testDataAnchorKinds = [
  "customers",
  "subscriptions",
] as const satisfies readonly TestDataKind[];

/** Links without a database FK (owner_type/resource_type/scope_type + id): they select dependents but never block a delete. */
export const testDataPolymorphicLinks = [
  { kind: "documents", type: documents.ownerType, id: documents.ownerId },
  {
    kind: "secure_access_tokens",
    type: secureAccessTokens.resourceType,
    id: secureAccessTokens.resourceId,
  },
  {
    kind: "notifications",
    type: notifications.resourceType,
    id: notifications.resourceId,
  },
  {
    kind: "retention_holds",
    type: retentionHolds.scopeType,
    id: retentionHolds.scopeId,
  },
] as const satisfies ReadonlyArray<{
  kind: TestDataKind;
  type: PgColumn;
  id: PgColumn;
}>;
export const testDataPolymorphicTypes: Readonly<Record<string, TestDataKind>> =
  {
    appointment: "appointments",
    customer: "customers",
    document: "documents",
    document_version: "document_versions",
    installment: "installments",
    payment_proof: "payment_proofs",
    prospect: "prospects",
    quote: "quotes",
    quote_version: "quote_versions",
    receipt: "receipts",
    request: "service_requests",
    subscription: "subscriptions",
  };

/** FK cycles among deleted rows (quotes ↔ quote_versions ← subscriptions): these nullable columns are cleared on doomed rows first. */
export const testDataDetachedColumns = [
  ["quotes", quotes.currentVersionId],
  ["subscriptions", subscriptions.acceptedQuoteVersionId],
] as const satisfies ReadonlyArray<readonly [TestDataKind, PgColumn]>;

export type TestDataForeignKey = {
  kind: TestDataKind;
  column: PgColumn;
  parent: TestDataKind;
};

const kindByTable = new Map<PgTable, TestDataKind>(
  testDataPurgePlan.map(([kind, table]) => [table, kind]),
);
export const testDataTable = (kind: TestDataKind): PlanTable =>
  testDataPurgePlan.find(([candidate]) => candidate === kind)![1];

/** Single-column FKs from each planned table to another planned table (FKs to users are ignored: accounts are never deleted). */
export const testDataForeignKeys: readonly TestDataForeignKey[] =
  testDataPurgePlan.flatMap(([kind, table]) =>
    getTableConfig(table).foreignKeys.flatMap((fk) => {
      const reference = fk.reference();
      const parent = kindByTable.get(reference.foreignTable);
      const [column] = reference.columns;
      return parent && column && reference.columns.length === 1
        ? [{ kind, column, parent }]
        : [];
    }),
  );

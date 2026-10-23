import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { idColumn, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { customers, subscriptions } from "./customers.js";
import { documents } from "./documents.js";

export const paymentPlans = pgTable("payment_plans", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  totalExpectedXaf: integer("total_expected_xaf").notNull(),
  status: text("status").notNull().default("draft"),
  revisedFromPlanId: uuid("revised_from_plan_id").references((): AnyPgColumn => paymentPlans.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("payment_plans_total_nonnegative", sql`${t.totalExpectedXaf} >= 0`), index("payment_plans_subscription_idx").on(t.subscriptionId, t.status),
  uniqueIndex("payment_plans_one_active_uq").on(t.subscriptionId).where(sql`${t.status} = 'active'`)]);

export const installments = pgTable("installments", {
  id: idColumn(),
  paymentPlanId: uuid("payment_plan_id").notNull().references(() => paymentPlans.id, { onDelete: "restrict" }),
  sequenceNumber: integer("sequence_number").notNull(),
  amountXaf: integer("amount_xaf").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("upcoming"),
  ...timestamps,
}, (t) => [
  uniqueIndex("installments_sequence_uq").on(t.paymentPlanId, t.sequenceNumber),
  check("installments_amount_positive", sql`${t.amountXaf} > 0`),
  index("installments_due_idx").on(t.status, t.dueDate),
]);

export const paymentEvents = pgTable("payment_events", {
  id: idColumn(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  amountXaf: integer("amount_xaf").notNull(),
  currency: text("currency").notNull().default("XAF"),
  paymentMethod: text("payment_method"),
  externalReference: text("external_reference"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  correctionOfEventId: uuid("correction_of_event_id").references((): AnyPgColumn => paymentEvents.id, { onDelete: "restrict" }),
  commandKey: uuid("command_key"),
  metadataJson: jsonb("metadata_json"),
}, (t) => [
  check("payment_events_amount_positive", sql`${t.amountXaf} > 0`),
  check("payment_events_currency_xaf", sql`${t.currency} = 'XAF'`),
  index("payment_events_customer_idx").on(t.customerId, t.occurredAt),
  index("payment_events_confirmed_idx").on(t.confirmedAt),
  uniqueIndex("payment_events_command_key_uq").on(t.commandKey),
]);

export const paymentAllocations = pgTable("payment_allocations", {
  id: idColumn(),
  paymentEventId: uuid("payment_event_id").notNull().references(() => paymentEvents.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  installmentId: uuid("installment_id").references(() => installments.id, { onDelete: "restrict" }),
  extraId: uuid("extra_id"),
  amountXaf: integer("amount_xaf").notNull(),
  allocationReason: text("allocation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("payment_allocations_amount_positive", sql`${t.amountXaf} > 0`), index("payment_allocations_event_idx").on(t.paymentEventId), index("payment_allocations_subscription_idx").on(t.subscriptionId, t.installmentId)]);

export const paymentProofs = pgTable("payment_proofs", {
  id: idColumn(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending_review"),
  submittedVia: text("submitted_via").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  supersedesProofId: uuid("supersedes_proof_id").references((): AnyPgColumn => paymentProofs.id, { onDelete: "restrict" }),
  paymentEventId: uuid("payment_event_id").references(() => paymentEvents.id, { onDelete: "restrict" }),
  claimedAmountXaf: integer("claimed_amount_xaf").notNull(),
  claimedPaymentMethod: text("claimed_payment_method").notNull(),
  claimedOccurredAt: timestamp("claimed_occurred_at", { withTimezone: true }).notNull(),
  claimedExternalReference: text("claimed_external_reference"),
  confirmedAmountXaf: integer("confirmed_amount_xaf"),
  confirmedPaymentMethod: text("confirmed_payment_method"),
  confirmedOccurredAt: timestamp("confirmed_occurred_at", { withTimezone: true }),
  customerMessage: text("customer_message"),
  reviewNote: text("review_note"),
}, (t) => [index("payment_proofs_queue_idx").on(t.status, t.submittedAt), index("payment_proofs_subscription_idx").on(t.subscriptionId),
  uniqueIndex("payment_proofs_replacement_uq").on(t.supersedesProofId),
  check("payment_proofs_claim_valid", sql`${t.claimedAmountXaf} > 0 AND ${t.claimedPaymentMethod} IN ('cash','bank_transfer','mobile_money') AND ${t.submittedVia} = 'public_link'`),
  check("payment_proofs_status_valid", sql`${t.status} IN ('pending_review','confirmed','partially_confirmed','correction_requested','rejected','duplicate','superseded')`),
  check("payment_proofs_confirmation_valid", sql`(
    ${t.status} IN ('confirmed','partially_confirmed') AND ${t.paymentEventId} IS NOT NULL
    AND ${t.confirmedAmountXaf} IS NOT NULL AND ${t.confirmedAmountXaf} > 0
    AND ${t.confirmedPaymentMethod} IS NOT NULL AND ${t.confirmedPaymentMethod} IN ('cash','bank_transfer','mobile_money') AND ${t.confirmedOccurredAt} IS NOT NULL
    AND ${t.reviewedAt} IS NOT NULL
    AND ((${t.status} = 'confirmed' AND ${t.confirmedAmountXaf} = ${t.claimedAmountXaf}) OR (${t.status} = 'partially_confirmed' AND ${t.confirmedAmountXaf} < ${t.claimedAmountXaf}))
  ) OR (
    ${t.status} NOT IN ('confirmed','partially_confirmed') AND ${t.paymentEventId} IS NULL
    AND ${t.confirmedAmountXaf} IS NULL AND ${t.confirmedPaymentMethod} IS NULL AND ${t.confirmedOccurredAt} IS NULL
  )`),
]);

export const quotes = pgTable("quotes", {
  id: idColumn(),
  quoteNumber: text("quote_number"),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  requestId: uuid("request_id"),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  currentVersionId: uuid("current_version_id").references((): AnyPgColumn => quoteVersions.id, { onDelete: "restrict" }),
  ...timestamps,
}, (t) => [uniqueIndex("quotes_number_uq").on(t.quoteNumber), index("quotes_customer_idx").on(t.customerId, t.status)]);

export const quoteVersions = pgTable("quote_versions", {
  id: idColumn(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  serviceSnapshotJson: jsonb("service_snapshot_json").notNull(),
  amountXaf: integer("amount_xaf").notNull(),
  termsSnapshotJson: jsonb("terms_snapshot_json"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  changesRequestedAt: timestamp("changes_requested_at", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  pdfDocumentId: uuid("pdf_document_id").references(() => documents.id, { onDelete: "restrict" }),
}, (t) => [uniqueIndex("quote_versions_number_uq").on(t.quoteId, t.versionNumber), check("quote_versions_amount_nonnegative", sql`${t.amountXaf} >= 0`)]);

export const businessDocumentCounters = pgTable("business_document_counters", {
  id: idColumn(),
  documentType: text("document_type").notNull(),
  year: integer("year").notNull(),
  lastValue: integer("last_value").notNull().default(0),
}, t => [uniqueIndex("business_document_counters_partition_uq").on(t.documentType, t.year),
  check("business_document_counters_value_nonnegative", sql`${t.lastValue} >= 0`)]);

export const receipts = pgTable("receipts", {
  id: idColumn(),
  receiptNumber: text("receipt_number").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  paymentEventId: uuid("payment_event_id").notNull().references(() => paymentEvents.id, { onDelete: "restrict" }),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  pdfDocumentId: uuid("pdf_document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  snapshotJson: jsonb("snapshot_json").notNull(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
}, (t) => [uniqueIndex("receipts_number_uq").on(t.receiptNumber), index("receipts_payment_idx").on(t.paymentEventId),
  uniqueIndex("receipts_payment_event_uq").on(t.paymentEventId),
  check("receipts_void_reason_valid", sql`(${t.voidedAt} IS NULL AND ${t.voidReason} IS NULL) OR (${t.voidedAt} IS NOT NULL AND ${t.voidReason} IS NOT NULL AND length(btrim(${t.voidReason})) > 0)`),
]);

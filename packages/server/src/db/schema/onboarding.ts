import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { customers, subscriptions } from "./customers.js";

export const onboardingItems = pgTable("onboarding_items", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  itemType: text("item_type").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull().default("pending"),
  isBlocking: boolean("is_blocking").notNull().default(true),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  waivedAt: timestamp("waived_at", { withTimezone: true }),
  waiverReason: text("waiver_reason"),
  ...timestamps,
}, (t) => [index("onboarding_items_subscription_idx").on(t.subscriptionId, t.status)]);

export const medicalClearanceRecords = pgTable("medical_clearance_records", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  triggerSource: text("trigger_source").notNull(),
  note: text("note"),
  documentId: uuid("document_id"),
  requiredAt: timestamp("required_at", { withTimezone: true }).defaultNow().notNull(),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  clearedByUserId: uuid("cleared_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("medical_clearance_subscription_idx").on(t.subscriptionId, t.status)]);

export const consentDefinitions = pgTable("consent_definitions", {
  id: idColumn(),
  consentType: text("consent_type").notNull(),
  version: text("version").notNull(),
  title: text("title").notNull(),
  contentHash: text("content_hash").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
}, (t) => [uniqueIndex("consent_definitions_version_uq").on(t.consentType, t.version)]);

export const consentRecords = pgTable("consent_records", {
  id: idColumn(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "restrict" }),
  consentDefinitionId: uuid("consent_definition_id").notNull().references(() => consentDefinitions.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  capturedVia: text("captured_via").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  verificationMetadataJson: jsonb("verification_metadata_json"),
}, (t) => [index("consent_records_customer_idx").on(t.customerId, t.capturedAt), index("consent_records_subscription_idx").on(t.subscriptionId, t.capturedAt)]);

import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, idColumn, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { services, serviceVariants } from "./catalogue.js";

export const prospects = pgTable("prospects", {
  id: idColumn(),
  fullName: text("full_name").notNull(),
  whatsapp: text("whatsapp").notNull(),
  email: text("email"),
  city: text("city"),
  country: text("country"),
  preferredContactChannel: text("preferred_contact_channel").notNull().default("whatsapp"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt,
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
}, (t) => [index("prospects_whatsapp_idx").on(t.whatsapp), index("prospects_email_idx").on(t.email)]);

export const serviceRequests = pgTable("service_requests", {
  id: idColumn(),
  reference: text("reference").notNull(),
  prospectId: uuid("prospect_id").notNull().references(() => prospects.id, { onDelete: "restrict" }),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  requestedVariantId: uuid("requested_variant_id").references(() => serviceVariants.id, { onDelete: "restrict" }),
  objective: text("objective"),
  preferredStartDate: timestamp("preferred_start_date", { withTimezone: true }),
  message: text("message"),
  status: text("status").notNull().default("submitted"),
  duplicateOfRequestId: uuid("duplicate_of_request_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  convertedSubscriptionId: uuid("converted_subscription_id"),
  ...timestamps,
}, (t) => [
  uniqueIndex("service_requests_reference_uq").on(t.reference),
  uniqueIndex("service_requests_converted_subscription_uq").on(t.convertedSubscriptionId),
  index("service_requests_queue_idx").on(t.status, t.submittedAt),
  index("service_requests_prospect_idx").on(t.prospectId),
]);

export const contactAttempts = pgTable("contact_attempts", {
  id: idColumn(),
  prospectId: uuid("prospect_id").notNull().references(() => prospects.id, { onDelete: "restrict" }),
  requestId: uuid("request_id").references(() => serviceRequests.id, { onDelete: "restrict" }),
  channel: text("channel").notNull(),
  direction: text("direction").notNull(),
  outcome: text("outcome").notNull(),
  note: text("note"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  nextActionAt: timestamp("next_action_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("contact_attempts_request_idx").on(t.requestId, t.occurredAt)]);

export const qualificationReviews = pgTable("qualification_reviews", {
  id: idColumn(),
  requestId: uuid("request_id").notNull().references(() => serviceRequests.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  outcome: text("outcome").notNull(),
  finalVariantId: uuid("final_variant_id").references(() => serviceVariants.id, { onDelete: "restrict" }),
  agreedPriceXaf: integer("agreed_price_xaf"),
  targetStartDate: timestamp("target_start_date", { withTimezone: true }),
  suitabilityNote: text("suitability_note"),
  conditionsJson: jsonb("conditions_json"),
  blockersJson: jsonb("blockers_json"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("qualification_reviews_version_uq").on(t.requestId, t.version),
  index("qualification_reviews_request_idx").on(t.requestId, t.createdAt),
]);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: idColumn(),
  requestId: uuid("request_id").notNull().references(() => serviceRequests.id, { onDelete: "restrict" }),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id").references(() => serviceVariants.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"),
  priorityNote: text("priority_note"),
  enteredAt: timestamp("entered_at", { withTimezone: true }).defaultNow().notNull(),
  leftAt: timestamp("left_at", { withTimezone: true }),
}, (t) => [index("waitlist_active_idx").on(t.status, t.enteredAt), index("waitlist_service_idx").on(t.serviceId, t.variantId)]);

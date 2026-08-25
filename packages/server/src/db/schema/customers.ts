import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { archivedAt, idColumn, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { services, serviceComponents, serviceVariants } from "./catalogue.js";
import { prospects, serviceRequests } from "./prospects.js";

export const customers = pgTable("customers", {
  id: idColumn(),
  prospectId: uuid("prospect_id").references(() => prospects.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  whatsapp: text("whatsapp").notNull(),
  email: text("email"),
  city: text("city"),
  country: text("country"),
  preferredContactChannel: text("preferred_contact_channel").notNull().default("whatsapp"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt,
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
}, (t) => [index("customers_whatsapp_idx").on(t.whatsapp), index("customers_email_idx").on(t.email)]);

export const subscriptions = pgTable("subscriptions", {
  id: idColumn(),
  reference: text("reference").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  sourceRequestId: uuid("source_request_id").references(() => serviceRequests.id, { onDelete: "restrict" }),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id").references(() => serviceVariants.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  agreedPriceXaf: integer("agreed_price_xaf").notNull(),
  currency: text("currency").notNull().default("XAF"),
  plannedStartDate: timestamp("planned_start_date", { withTimezone: true }),
  actualStartDate: timestamp("actual_start_date", { withTimezone: true }),
  plannedEndDate: timestamp("planned_end_date", { withTimezone: true }),
  actualEndDate: timestamp("actual_end_date", { withTimezone: true }),
  capacityReservedUntil: timestamp("capacity_reserved_until", { withTimezone: true }),
  followUpFrequencyDaysOverride: integer("follow_up_frequency_days_override"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("subscriptions_reference_uq").on(t.reference),
  uniqueIndex("subscriptions_source_request_uq").on(t.sourceRequestId),
  check("subscriptions_price_nonnegative", sql`${t.agreedPriceXaf} >= 0`),
  check("subscriptions_currency_xaf", sql`${t.currency} = 'XAF'`),
  index("subscriptions_customer_idx").on(t.customerId, t.status),
  index("subscriptions_end_idx").on(t.status, t.plannedEndDate),
]);

export const subscriptionStatusHistory = pgTable("subscription_status_history", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("subscription_status_history_idx").on(t.subscriptionId, t.changedAt)]);

export const subscriptionPauses = pgTable("subscription_pauses", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  reason: text("reason").notNull(),
  originalEndDate: timestamp("original_end_date", { withTimezone: true }),
  revisedEndDate: timestamp("revised_end_date", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("subscription_pauses_idx").on(t.subscriptionId, t.startedAt)]);

export const subscriptionComponents = pgTable("subscription_components", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  sourceServiceComponentId: uuid("source_service_component_id").references(() => serviceComponents.id, { onDelete: "restrict" }),
  componentType: text("component_type").notNull(),
  labelSnapshot: text("label_snapshot").notNull(),
  quantityEntitled: integer("quantity_entitled").notNull(),
  quantityConsumed: integer("quantity_consumed").notNull().default(0),
  quantityOwedByCoach: integer("quantity_owed_by_coach").notNull().default(0),
  ...timestamps,
}, (t) => [
  check("subscription_components_entitled_positive", sql`${t.quantityEntitled} > 0`),
  check("subscription_components_consumed_nonnegative", sql`${t.quantityConsumed} >= 0`),
  check("subscription_components_owed_nonnegative", sql`${t.quantityOwedByCoach} >= 0`),
  index("subscription_components_subscription_idx").on(t.subscriptionId),
]);

export const componentEvents = pgTable("component_events", {
  id: idColumn(),
  subscriptionComponentId: uuid("subscription_component_id").notNull().references(() => subscriptionComponents.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  quantity: integer("quantity").notNull(),
  relatedAppointmentId: uuid("related_appointment_id"),
  reason: text("reason"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("component_events_quantity_positive", sql`${t.quantity} > 0`), index("component_events_component_idx").on(t.subscriptionComponentId, t.createdAt)]);

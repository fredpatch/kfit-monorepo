import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { archivedAt, idColumn, timestamps } from "./_helpers.js";

export const services = pgTable("services", {
  id: idColumn(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  pricingMode: text("pricing_mode").notNull(),
  basePriceXaf: integer("base_price_xaf"),
  deliveryType: text("delivery_type").notNull(),
  defaultDurationValue: integer("default_duration_value"),
  defaultDurationUnit: text("default_duration_unit"),
  availabilityStatus: text("availability_status").notNull().default("open"),
  capacityMode: text("capacity_mode").notNull().default("unlimited"),
  capacityLimit: integer("capacity_limit"),
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
  archivedAt,
}, (t) => [
  uniqueIndex("services_slug_uq").on(t.slug),
  check("services_price_nonnegative", sql`${t.basePriceXaf} is null or ${t.basePriceXaf} >= 0`),
  index("services_status_idx").on(t.availabilityStatus, t.archivedAt),
]);

export const serviceVariants = pgTable("service_variants", {
  id: idColumn(),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  priceXaf: integer("price_xaf"),
  durationValue: integer("duration_value"),
  durationUnit: text("duration_unit"),
  capacityLimit: integer("capacity_limit"),
  availabilityStatus: text("availability_status").notNull().default("open"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
  archivedAt,
}, (t) => [
  uniqueIndex("service_variants_service_slug_uq").on(t.serviceId, t.slug),
  check("service_variants_price_nonnegative", sql`${t.priceXaf} is null or ${t.priceXaf} >= 0`),
  index("service_variants_service_idx").on(t.serviceId),
]);

export const serviceComponents = pgTable("service_components", {
  id: idColumn(),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id").references(() => serviceVariants.id, { onDelete: "restrict" }),
  componentType: text("component_type").notNull(),
  label: text("label").notNull(),
  quantity: integer("quantity").notNull().default(1),
  isMandatory: boolean("is_mandatory").notNull().default(true),
  consumptionPolicy: text("consumption_policy").notNull().default("manual"),
  ...timestamps,
}, (t) => [check("service_components_quantity_positive", sql`${t.quantity} > 0`), index("service_components_service_idx").on(t.serviceId, t.variantId)]);

export const servicePolicies = pgTable("service_policies", {
  id: idColumn(),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id").references(() => serviceVariants.id, { onDelete: "restrict" }),
  followUpFrequencyDays: integer("follow_up_frequency_days"),
  lateCancelNoticeHours: integer("late_cancel_notice_hours"),
  lateCancelConsumesComponent: boolean("late_cancel_consumes_component").notNull().default(false),
  missedConsumesComponent: boolean("missed_consumes_component").notNull().default(false),
  medicalClearancePolicy: text("medical_clearance_policy"),
  questionnaireTemplateId: uuid("questionnaire_template_id"),
  ...timestamps,
}, (t) => [uniqueIndex("service_policies_scope_uq").on(t.serviceId, t.variantId)]);

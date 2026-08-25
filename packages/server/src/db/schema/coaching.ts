import { check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { idColumn, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { subscriptionComponents, subscriptions } from "./customers.js";

export const appointments = pgTable("appointments", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  componentId: uuid("component_id").references(() => subscriptionComponents.id, { onDelete: "restrict" }),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
  scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  locationOrChannel: text("location_or_channel"),
  customerResponseStatus: text("customer_response_status").notNull().default("pending"),
  rescheduleNote: text("reschedule_note"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  check("appointments_time_order", sql`${t.scheduledEnd} > ${t.scheduledStart}`),
  index("appointments_subscription_idx").on(t.subscriptionId, t.scheduledStart),
  index("appointments_queue_idx").on(t.status, t.scheduledStart),
]);

export const appointmentEvents = pgTable("appointment_events", {
  id: idColumn(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  actorType: text("actor_type").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("appointment_events_idx").on(t.appointmentId, t.createdAt)]);

export const followUps = pgTable("follow_ups", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  followUpType: text("follow_up_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  note: text("note"),
  nextAction: text("next_action"),
  nextActionAt: timestamp("next_action_at", { withTimezone: true }),
  status: text("status").notNull().default("open"),
  attachmentDocumentId: uuid("attachment_document_id"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("follow_ups_due_idx").on(t.status, t.nextActionAt), index("follow_ups_subscription_idx").on(t.subscriptionId, t.occurredAt)]);

export const goals = pgTable("goals", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  label: text("label").notNull(),
  baselineValue: numeric("baseline_value"),
  targetValue: numeric("target_value"),
  unit: text("unit"),
  targetDate: timestamp("target_date", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  suggestedStatus: text("suggested_status"),
  coachConfirmedAt: timestamp("coach_confirmed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("goals_subscription_idx").on(t.subscriptionId, t.status)]);

export const progressMeasurements = pgTable("progress_measurements", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
  weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
  waistCm: numeric("waist_cm", { precision: 6, scale: 2 }),
  hipsCm: numeric("hips_cm", { precision: 6, scale: 2 }),
  chestCm: numeric("chest_cm", { precision: 6, scale: 2 }),
  bodyFatEstimate: numeric("body_fat_estimate", { precision: 5, scale: 2 }),
  feelingNote: text("feeling_note"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("progress_measurements_idx").on(t.subscriptionId, t.measuredAt)]);

export const progressPhotos = pgTable("progress_photos", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  measurementId: uuid("measurement_id").references(() => progressMeasurements.id, { onDelete: "set null" }),
  documentId: uuid("document_id").notNull(),
  photoType: text("photo_type"),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  marketingAuthorizationId: uuid("marketing_authorization_id"),
}, (t) => [index("progress_photos_subscription_idx").on(t.subscriptionId, t.takenAt)]);

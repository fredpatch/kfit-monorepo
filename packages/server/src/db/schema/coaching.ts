import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { idColumn, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { subscriptionComponents, subscriptions } from "./customers.js";

export const appointments = pgTable(
  "appointments",
  {
    id: idColumn(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    componentId: uuid("component_id").references(
      () => subscriptionComponents.id,
      { onDelete: "restrict" },
    ),
    rescheduledFromAppointmentId: uuid(
      "rescheduled_from_appointment_id",
    ).references((): AnyPgColumn => appointments.id, { onDelete: "restrict" }),
    lateCancelNoticeHoursSnapshot: integer("late_cancel_notice_hours_snapshot"),
    lateCancelConsumesComponentSnapshot: boolean(
      "late_cancel_consumes_component_snapshot",
    )
      .notNull()
      .default(false),
    missedConsumesComponentSnapshot: boolean(
      "missed_consumes_component_snapshot",
    )
      .notNull()
      .default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByType: text("cancelled_by_type"),
    scheduledStart: timestamp("scheduled_start", {
      withTimezone: true,
    }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("scheduled"),
    locationOrChannel: text("location_or_channel"),
    customerResponseStatus: text("customer_response_status")
      .notNull()
      .default("pending"),
    rescheduleNote: text("reschedule_note"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check(
      "appointments_time_order",
      sql`${t.scheduledEnd} > ${t.scheduledStart}`,
    ),
    uniqueIndex("appointments_rescheduled_from_uq").on(
      t.rescheduledFromAppointmentId,
    ),
    index("appointments_subscription_idx").on(
      t.subscriptionId,
      t.scheduledStart,
    ),
    index("appointments_queue_idx").on(t.status, t.scheduledStart),
  ],
);

export const appointmentEvents = pgTable(
  "appointment_events",
  {
    id: idColumn(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorType: text("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("appointment_events_idx").on(t.appointmentId, t.createdAt)],
);

export const followUps = pgTable(
  "follow_ups",
  {
    id: idColumn(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    followUpType: text("follow_up_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    status: text("status").notNull().default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    attachmentDocumentId: uuid("attachment_document_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("follow_ups_due_idx").on(t.status, t.nextActionAt),
    index("follow_ups_subscription_idx").on(t.subscriptionId, t.occurredAt),
  ],
);

export const followUpEvents = pgTable(
  "follow_up_events",
  {
    id: idColumn(),
    followUpId: uuid("follow_up_id")
      .notNull()
      .references(() => followUps.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("follow_up_events_history_idx").on(t.followUpId, t.createdAt)],
);

export const subscriptionFollowUpCadenceHistory = pgTable(
  "subscription_follow_up_cadence_history",
  {
    id: idColumn(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    effectiveFrequencyDays: integer("effective_frequency_days"),
    source: text("source").notNull(),
    effectiveFrom: timestamp("effective_from", {
      withTimezone: true,
    }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("subscription_cadence_one_open_uq")
      .on(t.subscriptionId)
      .where(sql`${t.effectiveTo} IS NULL`),
    index("subscription_cadence_history_lookup_idx").on(
      t.subscriptionId,
      t.effectiveFrom,
    ),
    check(
      "subscription_cadence_history_range_valid",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
    check(
      "subscription_cadence_history_value_valid",
      sql`(${t.source} = 'none' AND ${t.effectiveFrequencyDays} IS NULL) OR (${t.source} IN ('override','variant','service') AND ${t.effectiveFrequencyDays} IS NOT NULL AND ${t.effectiveFrequencyDays} > 0)`,
    ),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: idColumn(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    category: text("category").notNull(),
    label: text("label").notNull(),
    metricKey: text("metric_key"),
    baselineValue: numeric("baseline_value"),
    targetValue: numeric("target_value"),
    unit: text("unit"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    suggestedStatus: text("suggested_status"),
    coachConfirmedAt: timestamp("coach_confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("goals_subscription_idx").on(t.subscriptionId, t.status)],
);

export const goalEvents = pgTable(
  "goal_events",
  {
    id: idColumn(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    suggestedStatusSnapshot: text("suggested_status_snapshot"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("goal_events_history_idx").on(t.goalId, t.createdAt)],
);

export const progressMeasurements = pgTable(
  "progress_measurements",
  {
    id: idColumn(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
    waistCm: numeric("waist_cm", { precision: 6, scale: 2 }),
    hipsCm: numeric("hips_cm", { precision: 6, scale: 2 }),
    chestCm: numeric("chest_cm", { precision: 6, scale: 2 }),
    bodyFatEstimate: numeric("body_fat_estimate", { precision: 5, scale: 2 }),
    feelingNote: text("feeling_note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("progress_measurements_idx").on(t.subscriptionId, t.measuredAt),
  ],
);

export const progressPhotos = pgTable(
  "progress_photos",
  {
    id: idColumn(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    measurementId: uuid("measurement_id").references(
      () => progressMeasurements.id,
      { onDelete: "set null" },
    ),
    documentId: uuid("document_id").notNull(),
    photoType: text("photo_type"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    marketingAuthorizationId: uuid("marketing_authorization_id"),
  },
  (t) => [
    index("progress_photos_subscription_idx").on(t.subscriptionId, t.takenAt),
  ],
);

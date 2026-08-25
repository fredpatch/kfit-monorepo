import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn } from "./_helpers.js";
import { users } from "./auth.js";

export const scheduledJobRuns = pgTable("scheduled_job_runs", {
  id: idColumn(),
  jobKey: text("job_key").notNull(),
  runKey: text("run_key").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  attempt: integer("attempt").notNull().default(1),
  resultJson: jsonb("result_json"),
  errorCode: text("error_code"),
}, (t) => [uniqueIndex("scheduled_job_runs_run_uq").on(t.jobKey, t.runKey), index("scheduled_job_runs_status_idx").on(t.jobKey, t.status, t.startedAt)]);

export const retentionHolds = pgTable("retention_holds", {
  id: idColumn(),
  scopeType: text("scope_type").notNull(),
  scopeId: uuid("scope_id").notNull(),
  holdType: text("hold_type").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  releasedByUserId: uuid("released_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("retention_holds_scope_idx").on(t.scopeType, t.scopeId, t.status)]);

export const anonymizationEvents = pgTable("anonymization_events", {
  id: idColumn(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  executedByUserId: uuid("executed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  metadataJson: jsonb("metadata_json"),
}, (t) => [index("anonymization_events_subject_idx").on(t.subjectType, t.subjectId, t.requestedAt)]);

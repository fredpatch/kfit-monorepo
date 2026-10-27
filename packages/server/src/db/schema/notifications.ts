import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers.js";
import { users } from "./auth.js";
import { customers, subscriptions } from "./customers.js";

/*
 * S7.2 (Gate 1 approved 2026-10-23). Additive: no business-domain table is altered.
 * A notification is durable operational history of an authoritative source condition; it never mutates the source.
 */
const kinds =
  "'follow_up_overdue','request_to_contact','installment_overdue','payment_proof_pending','quote_action_required','preparation_blocked','completion_due','supervision_alert'";

export const notifications = pgTable(
  "notifications",
  {
    id: idColumn(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "restrict",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    customerDisplayName: text("customer_display_name"),
    deepLink: text("deep_link").notNull(),
    /** Stable condition identity, e.g. installment_overdue:<installmentId>. Never contains display strings. */
    dedupeKey: text("dedupe_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    firstDetectedAt: timestamp("first_detected_at", {
      withTimezone: true,
    }).notNull(),
    lastDetectedAt: timestamp("last_detected_at", {
      withTimezone: true,
    }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("notifications_kind_known", sql.raw(`kind in (${kinds})`)),
    check(
      "notifications_severity_known",
      sql`${t.severity} in ('warning', 'info')`,
    ),
    // One open logical notification per recipient and condition; resolved rows stay as history.
    uniqueIndex("notifications_open_dedupe_uq")
      .on(t.recipientUserId, t.dedupeKey)
      .where(sql`${t.resolvedAt} is null`),
    index("notifications_recipient_open_idx").on(
      t.recipientUserId,
      t.resolvedAt,
      t.readAt,
    ),
    index("notifications_recipient_resolved_idx").on(
      t.recipientUserId,
      t.resolvedAt,
    ),
  ],
);

export const notificationEmailOutbox = pgTable(
  "notification_email_outbox",
  {
    id: idColumn(),
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "restrict",
    }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Frozen at creation: the exact address and content that will be sent. */
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    messageKind: text("message_kind").notNull(),
    /** reminder:<notificationId>:<window> or digest:<userId>:<YYYY-MM-DD> - one row ever per key. */
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
    }).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    lastErrorCode: text("last_error_code"),
    ...timestamps,
  },
  (t) => [
    check(
      "notification_outbox_status_known",
      sql`${t.status} in ('pending', 'sending', 'sent', 'failed', 'dead_letter')`,
    ),
    check(
      "notification_outbox_kind_known",
      sql`${t.messageKind} in ('reminder', 'digest')`,
    ),
    check(
      "notification_outbox_attempts_nonnegative",
      sql`${t.attemptCount} >= 0`,
    ),
    uniqueIndex("notification_outbox_dedupe_uq").on(t.dedupeKey),
    index("notification_outbox_due_idx").on(t.status, t.nextAttemptAt),
  ],
);

/** Closed typed registry lives in @kfit/shared; this table only stores overrides of known keys. */
export const operationalSettings = pgTable("operational_settings", {
  key: text("key").primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

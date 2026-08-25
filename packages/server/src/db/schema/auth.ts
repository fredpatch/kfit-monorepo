import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, idColumn, timestamps } from "./_helpers.js";

export const users = pgTable("users", {
  id: idColumn(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull().default("active"),
  role: text("role").notNull().default("coach"),
  ...timestamps,
  archivedAt,
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const trustedDevices = pgTable("trusted_devices", {
  id: idColumn(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  deviceFingerprintHash: text("device_fingerprint_hash").notNull(),
  trustedUntil: timestamp("trusted_until", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("trusted_devices_user_idx").on(t.userId)]);

export const authSessions = pgTable("auth_sessions", {
  id: idColumn(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  tokenFamilyId: uuid("token_family_id").notNull(),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  trustedDeviceId: uuid("trusted_device_id").references(() => trustedDevices.id, { onDelete: "set null" }),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
}, (t) => [index("auth_sessions_user_idx").on(t.userId), uniqueIndex("auth_sessions_refresh_hash_uq").on(t.refreshTokenHash)]);

export const otpChallenges = pgTable("otp_challenges", {
  id: idColumn(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  purpose: text("purpose").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  deliveryChannel: text("delivery_channel").notNull(),
  ...timestamps,
}, (t) => [index("otp_challenges_user_idx").on(t.userId), index("otp_challenges_expiry_idx").on(t.expiresAt)]);

export const auditEvents = pgTable("audit_events", {
  id: idColumn(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorType: text("actor_type").notNull(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  result: text("result").notNull(),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("audit_entity_idx").on(t.entityType, t.entityId, t.createdAt),
  index("audit_event_type_idx").on(t.eventType, t.createdAt),
]);

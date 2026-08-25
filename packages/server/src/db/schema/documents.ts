import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers.js";
import { users } from "./auth.js";

export const documents = pgTable("documents", {
  id: idColumn(),
  ownerType: text("owner_type").notNull(),
  ownerId: uuid("owner_id").notNull(),
  documentType: text("document_type").notNull(),
  sensitivity: text("sensitivity").notNull().default("private"),
  status: text("status").notNull().default("draft"),
  currentVersionId: uuid("current_version_id"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  purgeAfter: timestamp("purge_after", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("documents_owner_idx").on(t.ownerType, t.ownerId), index("documents_status_idx").on(t.status, t.purgeAfter)]);

export const documentVersions = pgTable("document_versions", {
  id: idColumn(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  malwareScanStatus: text("malware_scan_status").notNull().default("pending"),
  uploadedByType: text("uploaded_by_type").notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("document_versions_number_uq").on(t.documentId, t.versionNumber),
  uniqueIndex("document_versions_storage_key_uq").on(t.storageKey),
  index("document_versions_sha_idx").on(t.sha256),
]);

export const secureAccessTokens = pgTable("secure_access_tokens", {
  id: idColumn(),
  tokenHash: text("token_hash").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id").notNull(),
  action: text("action").notNull(),
  recipientHintHash: text("recipient_hint_hash"),
  requiresOtp: text("requires_otp").notNull().default("false"),
  deviceBindingHash: text("device_binding_hash"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  maxUses: integer("max_uses"),
  useCount: integer("use_count").notNull().default(0),
  ...timestamps,
}, (t) => [uniqueIndex("secure_access_tokens_hash_uq").on(t.tokenHash), index("secure_access_tokens_resource_idx").on(t.resourceType, t.resourceId), index("secure_access_tokens_expiry_idx").on(t.expiresAt, t.revokedAt)]);

export const externalAccessEvents = pgTable("external_access_events", {
  id: idColumn(),
  secureAccessTokenId: uuid("secure_access_token_id").notNull().references(() => secureAccessTokens.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  result: text("result").notNull(),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("external_access_events_idx").on(t.secureAccessTokenId, t.createdAt)]);

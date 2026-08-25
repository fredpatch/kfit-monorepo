import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const idColumn = () => uuid("id").defaultRandom().primaryKey();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const archivedAt = timestamp("archived_at", { withTimezone: true });

export const positiveIntegerCheck = (columnName: string) =>
  sql.raw(`${columnName} > 0`);

export const nonNegativeIntegerCheck = (columnName: string) =>
  sql.raw(`${columnName} >= 0`);

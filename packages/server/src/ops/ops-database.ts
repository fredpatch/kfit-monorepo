import pg from "pg";
import { RESTORE_DATABASE_NAME_PATTERN } from "./restore-target.js";

/** Maintenance database used for CREATE / DROP DATABASE (the target cannot be dropped from a connection to itself). */
export const MAINTENANCE_DATABASE = "postgres";
/** drizzle-kit migrate bookkeeping. */
const MIGRATIONS_TABLE = "drizzle.__drizzle_migrations";

export function databaseUrlFor(databaseUrl: string, database: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}
export const databaseNameOf = (databaseUrl: string) =>
  decodeURIComponent(new URL(databaseUrl).pathname.slice(1));

export async function withClient<T>(
  databaseUrl: string,
  work: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function serverMajor(client: pg.Client): Promise<number> {
  const { rows } = await client.query<{ v: string }>("show server_version_num");
  return Math.floor(Number(rows[0]?.v) / 10_000);
}

/** Row count of every user table, keyed `schema.table` (B7: recorded at backup, compared by the drill). */
export async function tableCounts(
  client: pg.Client,
): Promise<Record<string, number>> {
  const { rows: tables } = await client.query<{ schema: string; name: string }>(
    "select table_schema as schema, table_name as name from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema') order by 1, 2",
  );
  const counts: Record<string, number> = {};
  for (const { schema, name } of tables) {
    const { rows } = await client.query<{ n: string }>(
      `select count(*) as n from ${pg.escapeIdentifier(schema)}.${pg.escapeIdentifier(name)}`,
    );
    counts[`${schema}.${name}`] = Number(rows[0]?.n ?? 0);
  }
  return counts;
}

/** Latest applied drizzle migration (hash) and how many are applied; `none` on an unmigrated database. */
export async function migrationState(
  client: pg.Client,
): Promise<{ id: string; applied: number }> {
  const { rows: present } = await client.query<{ t: string | null }>(
    "select to_regclass($1) as t",
    [MIGRATIONS_TABLE],
  );
  if (!present[0]?.t) return { id: "none", applied: 0 };
  const { rows } = await client.query<{ hash: string; applied: string }>(
    `select hash, (select count(*) from ${MIGRATIONS_TABLE}) as applied from ${MIGRATIONS_TABLE} order by created_at desc, id desc limit 1`,
  );
  return {
    id: rows[0]?.hash ?? "none",
    applied: Number(rows[0]?.applied ?? 0),
  };
}

function assertIdentifier(name: string) {
  if (!RESTORE_DATABASE_NAME_PATTERN.test(name))
    throw new Error("database name is not a plain identifier");
}

export async function databaseExists(
  databaseUrl: string,
  name: string,
): Promise<boolean> {
  return withClient(
    databaseUrlFor(databaseUrl, MAINTENANCE_DATABASE),
    async (client) =>
      (
        await client.query("select 1 from pg_database where datname = $1", [
          name,
        ])
      ).rowCount === 1,
  );
}

export async function createDatabase(
  databaseUrl: string,
  name: string,
): Promise<void> {
  assertIdentifier(name);
  await withClient(
    databaseUrlFor(databaseUrl, MAINTENANCE_DATABASE),
    (client) => client.query(`create database ${pg.escapeIdentifier(name)}`),
  );
}

/** Drops even with open connections (PostgreSQL 13+). */
export async function dropDatabase(
  databaseUrl: string,
  name: string,
): Promise<void> {
  assertIdentifier(name);
  await withClient(
    databaseUrlFor(databaseUrl, MAINTENANCE_DATABASE),
    (client) =>
      client.query(
        `drop database if exists ${pg.escapeIdentifier(name)} with (force)`,
      ),
  );
}

/** True when the database has no user table (a fresh CREATE DATABASE). */
export async function databaseIsEmpty(
  databaseUrl: string,
  name: string,
): Promise<boolean> {
  return withClient(databaseUrlFor(databaseUrl, name), async (client) => {
    const { rows } = await client.query<{ n: string }>(
      "select count(*) as n from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')",
    );
    return Number(rows[0]?.n) === 0;
  });
}

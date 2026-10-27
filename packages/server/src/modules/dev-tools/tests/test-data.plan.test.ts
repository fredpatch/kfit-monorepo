import assert from "node:assert/strict";
import test from "node:test";
import {
  getTableConfig,
  pgTable,
  PgTable,
  uuid,
  type PgColumn,
} from "drizzle-orm/pg-core";
import { testDataKinds } from "@kfit/shared";
import * as schema from "../../../db/schema/index.js";
import {
  testDataDetachedColumns,
  testDataForeignKeys,
  testDataPolymorphicLinks,
  testDataPolymorphicTypes,
  testDataPurgePlan,
} from "../services/test-data.plan.js";

const planned = new Set<PgTable>(testDataPurgePlan.map(([, table]) => table));
/** Tables outside the plan that hold an FK into a planned table: a purge could never delete what they reference. */
function uncoveredTables(tables: PgTable[]): string[] {
  return tables
    .filter(
      (table) =>
        !planned.has(table) &&
        getTableConfig(table).foreignKeys.some((fk) =>
          planned.has(fk.reference().foreignTable),
        ),
    )
    .map((table) => getTableConfig(table).name);
}
const schemaTables: PgTable[] = Object.values(
  schema as Record<string, unknown>,
).filter((value): value is PgTable => value instanceof PgTable);

test("TEST-01 every table with an FK into a covered table is in the plan (D7)", () => {
  assert.deepEqual(uncoveredTables(schemaTables), []);
  for (const [kind, table] of testDataPurgePlan)
    assert.equal(getTableConfig(table).name, kind);
  assert.deepEqual(
    [...testDataPurgePlan.map(([kind]) => kind)].sort(),
    [...testDataKinds].sort(),
  );
});

test("TEST-01 the coverage check fails for a new table pointing at a covered root (D7)", () => {
  const futureTable = pgTable("future_service_notes", {
    id: uuid("id").primaryKey(),
    serviceId: uuid("service_id").references(() => schema.services.id),
  });
  assert.deepEqual(uncoveredTables([...schemaTables, futureTable]), [
    "future_service_notes",
  ]);
});

test("TEST-01 the plan deletes children before parents; only nullable detached columns break cycles (D7)", () => {
  const order = new Map<string, number>(
    testDataPurgePlan.map(([kind], index) => [kind, index]),
  );
  const detached = new Set<PgColumn>(
    testDataDetachedColumns.map(([, column]) => column),
  );
  for (const fk of testDataForeignKeys) {
    if (fk.kind === fk.parent || detached.has(fk.column)) continue;
    assert.ok(
      order.get(fk.kind)! < order.get(fk.parent)!,
      `${fk.kind}.${fk.column.name} -> ${fk.parent}`,
    );
  }
  for (const [, column] of testDataDetachedColumns)
    assert.equal(column.notNull, false, column.name);
  assert.ok(testDataForeignKeys.length > 60);
});

test("TEST-01 polymorphic links and types resolve to planned kinds (D5)", () => {
  const kinds = new Set<string>(testDataKinds);
  for (const link of testDataPolymorphicLinks) assert.ok(kinds.has(link.kind));
  for (const kind of Object.values(testDataPolymorphicTypes))
    assert.ok(kinds.has(kind), kind);
});

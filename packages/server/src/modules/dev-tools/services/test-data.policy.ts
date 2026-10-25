import { createHash } from "node:crypto";
import { testDataKinds, type TestDataCounts, type TestDataKeptKind, type TestDataKind } from "@kfit/shared";
import { isTestLabel, testDataAnchorKinds, testDataRootLabels, type TestDataRootKind } from "./test-data.plan.js";

export type TestDataRef = { kind: TestDataKind; id: string };
/** One loaded row: `foreignKeys` are enforced by the database, `links` are polymorphic owner/resource references. */
export type TestDataRow = { id: string; label?: string; foreignKeys: TestDataRef[]; links: TestDataRef[] };
export type TestDataRows = Partial<Record<TestDataKind, TestDataRow[]>>;
export type TestDataClassification = {
  doomed: Map<TestDataKind, string[]>;
  kept: Map<TestDataKind, string[]>;
  syntheticUsers: number;
};

const key = (ref: TestDataRef) => `${ref.kind}:${ref.id}`;
const isRootKind = (kind: TestDataKind): kind is TestDataRootKind => kind in testDataRootLabels;
const anchorKinds: readonly TestDataKind[] = testDataAnchorKinds;

/**
 * TEST-01 D5, pure. candidates = labelled roots plus every row that references a candidate (FK or link), roots excepted.
 * real = candidates referencing a non-test customer or subscription, and candidates referencing real rows.
 * needed = candidates that kept or non-candidate rows still reference through an FK (a request converted for a real customer,
 * the [TEST] prospect of a real customer).
 * Doomed = candidates − real − needed, so no surviving row can reference a deleted one.
 */
export function classifyTestData(rows: TestDataRows, syntheticUsers = 0): TestDataClassification {
  const all = testDataKinds.flatMap((kind) => (rows[kind] ?? []).map((row) => ({ kind, row })));
  const refs = (row: TestDataRow) => [...row.foreignKeys, ...row.links];

  const candidates = new Set(all.filter(({ kind, row }) => isRootKind(kind) && row.label !== undefined && isTestLabel(row.label)).map(({ kind, row }) => key({ kind, id: row.id })));
  const grow = (set: Set<string>, joins: (kind: TestDataKind, row: TestDataRow) => boolean) => {
    for (let changed = true; changed;) {
      changed = false;
      for (const { kind, row } of all) {
        const id = key({ kind, id: row.id });
        if (!set.has(id) && joins(kind, row)) { set.add(id); changed = true; }
      }
    }
  };
  grow(candidates, (kind, row) => !isRootKind(kind) && refs(row).some((ref) => candidates.has(key(ref))));

  const isCandidate = (kind: TestDataKind, row: TestDataRow) => candidates.has(key({ kind, id: row.id }));
  const real = new Set<string>();
  grow(real, (kind, row) => isCandidate(kind, row)
    && refs(row).some((ref) => real.has(key(ref)) || (anchorKinds.includes(ref.kind) && !candidates.has(key(ref)))));

  const kept = new Set(real);
  for (let changed = true; changed;) {
    changed = false;
    for (const { kind, row } of all) {
      const own = key({ kind, id: row.id });
      if (candidates.has(own) && !kept.has(own)) continue;
      for (const parent of row.foreignKeys) {
        const parentKey = key(parent);
        if (candidates.has(parentKey) && !kept.has(parentKey)) { kept.add(parentKey); changed = true; }
      }
    }
  }

  const doomed = new Map<TestDataKind, string[]>();
  const keptByKind = new Map<TestDataKind, string[]>();
  for (const { kind, row } of all) {
    const id = key({ kind, id: row.id });
    if (!candidates.has(id)) continue;
    const target = kept.has(id) ? keptByKind : doomed;
    const ids = target.get(kind) ?? [];
    ids.push(row.id);
    target.set(kind, ids);
  }
  for (const ids of [...doomed.values(), ...keptByKind.values()]) ids.sort();
  return { doomed, kept: keptByKind, syntheticUsers };
}

const countsOf = (ids: Map<TestDataKind, string[]>): TestDataCounts =>
  Object.fromEntries(testDataKinds.filter((kind) => ids.get(kind)?.length).map((kind) => [kind, ids.get(kind)!.length]));

export function testDataCounts(classification: TestDataClassification): { counts: TestDataCounts; kept: TestDataCounts<TestDataKeptKind> } {
  const kept: TestDataCounts<TestDataKeptKind> = countsOf(classification.kept);
  return { counts: countsOf(classification.doomed), kept: classification.syntheticUsers ? { ...kept, users: classification.syntheticUsers } : kept };
}

/** TEST-01 D6: identifies exactly which rows an analysis would delete and keep; any change between analyse and purge changes it. */
export function testDataFingerprint(classification: TestDataClassification): string {
  const entries = (ids: Map<TestDataKind, string[]>) => testDataKinds.filter((kind) => ids.get(kind)?.length).map((kind) => [kind, ids.get(kind)]);
  return createHash("sha256").update(JSON.stringify({ doomed: entries(classification.doomed), kept: entries(classification.kept), users: classification.syntheticUsers })).digest("hex");
}

import assert from "node:assert/strict";
import test from "node:test";
import type { TestDataKind } from "@kfit/shared";
import {
  classifyTestData,
  testDataCounts,
  testDataFingerprint,
  type TestDataRow,
  type TestDataRows,
} from "../services/test-data.policy.js";

const row = (
  id: string,
  foreignKeys: Array<[TestDataKind, string]> = [],
  label?: string,
  links: Array<[TestDataKind, string]> = [],
): TestDataRow => ({
  id,
  ...(label === undefined ? {} : { label }),
  foreignKeys: foreignKeys.map(([kind, ref]) => ({ kind, id: ref })),
  links: links.map(([kind, ref]) => ({ kind, id: ref })),
});
const ids = (map: Map<TestDataKind, string[]>) => Object.fromEntries(map);

test("TEST-01 classifier selects [TEST] and legacy roots with their dependents, never untagged roots (D5)", () => {
  const rows: TestDataRows = {
    services: [
      row("s-test", [], "[TEST] Coaching"),
      row("s-legacy", [], "Integration test service"),
      row("s-real", [], "Programme sportif"),
    ],
    prospects: [
      row("p-test", [], "Integration Test"),
      row("p-real", [], "Awa N."),
    ],
    customers: [row("c-test", [["prospects", "p-test"]], "[TEST] Client")],
    service_requests: [
      row("r-1", [
        ["prospects", "p-real"],
        ["services", "s-legacy"],
      ]),
      row("r-real", [
        ["prospects", "p-real"],
        ["services", "s-real"],
      ]),
    ],
    subscriptions: [
      row("sub-test", [
        ["customers", "c-test"],
        ["services", "s-real"],
      ]),
    ],
    appointments: [row("a-1", [["subscriptions", "sub-test"]])],
    documents: [row("d-1", [], undefined, [["subscriptions", "sub-test"]])],
    consent_definitions: [
      row("cd-test", [], "[TEST] Données de santé"),
      row("cd-real", [], "Données de santé"),
    ],
  };
  const result = classifyTestData(rows, 2);
  assert.deepEqual(ids(result.doomed), {
    appointments: ["a-1"],
    documents: ["d-1"],
    subscriptions: ["sub-test"],
    service_requests: ["r-1"],
    customers: ["c-test"],
    prospects: ["p-test"],
    consent_definitions: ["cd-test"],
    services: ["s-legacy", "s-test"],
  });
  assert.deepEqual(ids(result.kept), {});
  assert.deepEqual(testDataCounts(result).kept, { users: 2 });
});

test("TEST-01 rows linked to a real customer stay, with everything they still reference (D5)", () => {
  const rows: TestDataRows = {
    services: [row("s-test", [], "[TEST] Coaching")],
    prospects: [
      row("p-test", [], "[TEST] Prospect"),
      row("p-real", [], "Awa N."),
    ],
    customers: [
      row("c-real", [["prospects", "p-test"]], "Ondzounga Alvin Bruce"),
      row("c-test", [], "[TEST] Client"),
    ],
    service_requests: [
      row("r-converted", [
        ["prospects", "p-real"],
        ["services", "s-test"],
      ]),
      row("r-open", [
        ["prospects", "p-test"],
        ["services", "s-test"],
      ]),
    ],
    subscriptions: [
      row("sub-real", [
        ["customers", "c-real"],
        ["services", "s-test"],
        ["service_requests", "r-converted"],
      ]),
      row("sub-test", [
        ["customers", "c-test"],
        ["services", "s-test"],
      ]),
    ],
    appointments: [
      row("a-real", [["subscriptions", "sub-real"]]),
      row("a-test", [["subscriptions", "sub-test"]]),
    ],
    notifications: [
      row("n-real", [["customers", "c-real"]], undefined, [
        ["service_requests", "r-open"],
      ]),
    ],
  };
  const result = classifyTestData(rows);
  assert.deepEqual(ids(result.kept), {
    notifications: ["n-real"],
    appointments: ["a-real"],
    subscriptions: ["sub-real"],
    service_requests: ["r-converted"],
    prospects: ["p-test"],
    services: ["s-test"],
  });
  assert.deepEqual(ids(result.doomed), {
    appointments: ["a-test"],
    subscriptions: ["sub-test"],
    service_requests: ["r-open"],
    customers: ["c-test"],
  });
  assert.equal(testDataCounts(result).counts.customers, 1);
});

test("TEST-01 fingerprint changes with any doomed or kept row and is stable otherwise (D6)", () => {
  const base: TestDataRows = { services: [row("s-test", [], "[TEST] A")] };
  const first = testDataFingerprint(classifyTestData(base));
  assert.equal(
    testDataFingerprint(
      classifyTestData({ services: [row("s-test", [], "[TEST] A")] }),
    ),
    first,
  );
  assert.notEqual(
    testDataFingerprint(
      classifyTestData({
        services: [...base.services!, row("s-other", [], "[TEST] B")],
      }),
    ),
    first,
  );
  assert.notEqual(testDataFingerprint(classifyTestData(base, 1)), first);
  assert.match(first, /^[0-9a-f]{64}$/);
});

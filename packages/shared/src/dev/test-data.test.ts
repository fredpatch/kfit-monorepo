import assert from "node:assert/strict";
import test from "node:test";
import { parseTestDataPurgeInput, testDataKinds, testDataTotal } from "./test-data.js";

test("TEST-01 purge input carries exactly one sha-256 fingerprint (D6)", () => {
  const fingerprint = "a".repeat(64);
  assert.deepEqual(parseTestDataPurgeInput({ fingerprint }), { fingerprint });
  for (const input of [null, [], {}, { fingerprint: "A".repeat(64) }, { fingerprint: "a".repeat(63) }, { fingerprint, extra: true }, { fingerprint: 1 }, "x"]) {
    assert.equal(parseTestDataPurgeInput(input), null, JSON.stringify(input));
  }
});

test("TEST-01 kinds are unique and totals add only present counts (D5, D6)", () => {
  assert.equal(new Set(testDataKinds).size, testDataKinds.length);
  assert.equal(testDataTotal({ services: 2, prospects: 3 }), 5);
  assert.equal(testDataTotal({}), 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { historicalCadence, type CadenceHistoryInterval } from "./cadence-history.policy.js";
import { calculateCadence, InvalidCadenceError } from "./follow-up-cadence.policy.js";

const date = (day: number) => new Date(Date.UTC(2026, 0, day));
const intervals: CadenceHistoryInterval[] = [
  { effectiveFrom: date(1), effectiveTo: date(10), effectiveFrequencyDays: 7, source: "service" },
  { effectiveFrom: date(10), effectiveTo: null, effectiveFrequencyDays: 14, source: "service" },
];

test("historical cadence before prospective authority is unavailable", () => {
  assert.equal(historicalCadence(intervals, date(0)), null);
});
test("historical cadence resolves the exact stored interval", () => {
  assert.deepEqual(historicalCadence(intervals, date(5)), { days: 7, source: "service" });
});
test("historical cadence transition is inclusive at the new start and exclusive at the old end", () => {
  assert.deepEqual(historicalCadence(intervals, date(10)), { days: 14, source: "service" });
});
test("historical cadence gaps never use a nearest segment", () => {
  assert.equal(historicalCadence([{ ...intervals[0]!, effectiveTo: date(3) }, intervals[1]!], date(5)), null);
});
test("historical cadence rejects multiple matching authority intervals", () => {
  assert.throws(() => historicalCadence([...intervals, { ...intervals[1]!, effectiveFrom: date(4) }], date(5)), InvalidCadenceError);
});
test("historical none is known disabled monitoring, distinct from unavailable", () => {
  assert.deepEqual(historicalCadence([{ ...intervals[1]!, source: "none", effectiveFrequencyDays: null }], date(11)), { days: null, source: "none" });
});
test("historical cadence rejects inconsistent source/value evidence", () => {
  for (const invalid of [{ source: "none", effectiveFrequencyDays: 7 }, { source: "service", effectiveFrequencyDays: null }, { source: "variant", effectiveFrequencyDays: 0 }, { source: "other", effectiveFrequencyDays: 7 }]) {
    assert.throws(() => historicalCadence([{ ...intervals[1]!, ...invalid }], date(11)), InvalidCadenceError);
  }
});
test("seven to fourteen day history changes historical overdue classification through the owner policy", () => {
  const classify = (at: Date) => {
    const cadence = historicalCadence(intervals, at);
    assert.ok(cadence);
    return calculateCadence({ status: "active", actualStartDate: date(1), activity: { at: date(1), type: "activation" }, pauses: [], cadence, now: at }).cadenceState;
  };
  assert.equal(classify(date(9)), "overdue");
  assert.equal(classify(date(10)), "healthy");
});

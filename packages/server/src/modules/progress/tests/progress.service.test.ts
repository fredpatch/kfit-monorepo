import assert from "node:assert/strict";
import test from "node:test";
import { ProgressService, type ProgressRepository, type ProgressCommand } from "../services/progress.service.js";
import { suggestGoal, goalCommands, validMetric } from "../services/progress.policy.js";
const id = "11111111-1111-1111-1111-111111111111", actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
const denied: ProgressRepository = { async execute() { assert.fail("invalid persistence"); } };
const service = new ProgressService(denied);
const now = new Date("2026-10-21T12:00:00Z");
const base = { metricKey: "weight_kg" as const, baselineValue: 50, targetValue: 60, targetDate: now, latestValue: 55 };
for (const [latestValue, expected] of [[60, "achieved"], [61, "achieved"], [55, "partially_achieved"], [50, "not_achieved"], [48, "not_achieved"], [null, null]] as const) test(`increase suggestion ${latestValue}`, () => {
  assert.equal(suggestGoal({ ...base, latestValue }, new Date(now.getTime() + 1)), expected);
});
for (const [latestValue, expected] of [[80, "achieved"], [79, "achieved"], [85, "partially_achieved"], [90, "not_achieved"], [95, "not_achieved"]] as const) test(`decrease suggestion ${latestValue}`, () => {
  assert.equal(suggestGoal({ ...base, baselineValue: 90, targetValue: 80, latestValue }, new Date(now.getTime() + 1)), expected);
});
test("exact target date and absent target date cannot imply failure", () => {
  assert.equal(suggestGoal(base, now), null); assert.equal(suggestGoal(base, new Date(now.getTime() - 1)), null);
  assert.equal(suggestGoal({ ...base, targetDate: null }, new Date(now.getTime() + 1)), null);
  assert.equal(suggestGoal({ ...base, metricKey: null }, new Date(now.getTime() + 1)), null);
});
test("only named transitions available; outcomes are terminal", () => {
  assert.deepEqual(goalCommands("paused"), ["resume", "cancel"]);
  for (const state of ["achieved", "partially_achieved", "not_achieved", "cancelled"] as const) assert.deepEqual(goalCommands(state), []);
});
test("metrics enforce finite positive technical bounds and storage precision", () => {
  for (const value of [0, -1, Infinity, NaN, "80", 1001, 80.123]) assert.equal(validMetric(value, "weightKg"), false);
  assert.ok(validMetric(82.4, "weightKg")); assert.ok(validMetric(1000, "waistCm")); assert.equal(validMetric(101, "bodyFatEstimate"), false);
});
const invalid: Array<[ProgressCommand["action"], unknown, string]> = [
  ["measurement", { measuredAt: now.toISOString() }, "PROGRESS_INVALID_INPUT"],
  ["measurement", { measuredAt: "2026-02-30T12:00:00Z", weightKg: 80 }, "PROGRESS_INVALID_INPUT"],
  ["measurement", { measuredAt: now.toISOString(), weightKg: "80" }, "PROGRESS_INVALID_INPUT"],
  ["measurement", { measuredAt: now.toISOString(), weightKg: 80, status: "active" }, "PROGRESS_INVALID_INPUT"],
  ["create-goal", { category: "custom", label: "Synthetic", metricKey: "BMI" }, "GOAL_METRIC_INVALID"],
  ["create-goal", { category: "custom", label: "Synthetic", baselineValue: 50 }, "GOAL_NUMERIC_FIELDS_INCOMPLETE"],
  ["create-goal", { category: "custom", label: "Synthetic", metricKey: "weight_kg", baselineValue: 50, targetValue: 50, unit: "kg" }, "GOAL_TARGET_INVALID"],
  ["create-goal", { category: "custom", label: "Synthetic", targetDate: "tomorrow" }, "GOAL_TARGET_DATE_INVALID"],
  ["cancel", { reason: " " }, "GOAL_OUTCOME_REASON_REQUIRED"],
  ["confirm-outcome", { outcome: "active" }, "GOAL_INVALID_INPUT"],
];
for (const [action, body, error] of invalid) test(`validation rejects ${action} ${JSON.stringify(body)}`, async () => {
  assert.deepEqual(await service.execute(id, action, body, actor), { ok: false, error });
});
test("measurement payload normalizes blank note and omitted metrics", async () => {
  const capture = new ProgressService({ async execute(_id, command) {
    assert.deepEqual(command, { action: "measurement", measuredAt: now, feelingNote: null, values: { weightKg: 82.4, waistCm: null, hipsCm: null, chestCm: null, bodyFatEstimate: null } });
    return { ok: false, error: "PROGRESS_HEALTH_CONSENT_REQUIRED" };
  } });
  await capture.execute(id, "measurement", { measuredAt: now.toISOString(), weightKg: 82.4, feelingNote: "   " }, actor);
});

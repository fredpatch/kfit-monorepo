import assert from "node:assert/strict";
import test from "node:test";
import { goalMetricKeys, goalOutcomes, progressApiRoutes, progressErrorCodes, progressMetrics } from "./contracts.js";
test("progress contract has five distinct metric mappings and three outcomes", () => {
  assert.equal(new Set(progressMetrics).size, 5); assert.equal(new Set(goalMetricKeys).size, 5);
  assert.deepEqual(goalOutcomes, ["achieved", "partially_achieved", "not_achieved"]);
});
test("progress contracts expose only admin routes and stable unique errors", () => {
  assert.ok(Object.values(progressApiRoutes).every(route => route.startsWith("/admin/")));
  assert.equal(new Set(progressErrorCodes).size, progressErrorCodes.length);
  assert.equal(progressApiRoutes.confirmOutcome, "/admin/goals/:goalId/confirm-outcome");
});

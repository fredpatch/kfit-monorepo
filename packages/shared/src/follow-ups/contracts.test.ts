import assert from "node:assert/strict";
import test from "node:test";
import { followUpApiRoutes, followUpTypes, followUpErrorCodes, type CreateFollowUpInput } from "./contracts.js";
test("follow-up contracts expose the closed vocabulary and named routes", () => {
  assert.deepEqual(followUpTypes, ["check_in", "progress_review", "coaching_contact", "other"]);
  assert.equal(followUpApiRoutes.cadence, "/admin/subscriptions/:subscriptionId/follow-up-cadence");
  assert.equal(followUpApiRoutes.queue, "/admin/follow-ups/queue");
  assert.equal(new Set(followUpErrorCodes).size, followUpErrorCodes.length);
});
test("follow-up creation contract contains caller-owned structured facts", () => {
  const input: CreateFollowUpInput = { followUpType: "check_in", occurredAt: "2026-10-21T10:00:00Z", nextAction: "Synthetic action", nextActionAt: "2026-10-22T10:00:00Z" };
  assert.ok(!("status" in input)); assert.ok(!("overdue" in input));
});

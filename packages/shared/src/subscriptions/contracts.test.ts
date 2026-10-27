import assert from "node:assert/strict";
import test from "node:test";
import {
  subscriptionApiRoutes,
  subscriptionCommands,
  subscriptionErrorCodes,
} from "./contracts.js";
test("subscription routes expose named commands with stable unique errors", () => {
  assert.equal(subscriptionCommands.length, 8);
  for (const action of subscriptionCommands)
    assert.equal(
      subscriptionApiRoutes[action],
      `/admin/subscriptions/:subscriptionId/${action}`,
    );
  assert.equal(
    new Set(subscriptionErrorCodes).size,
    subscriptionErrorCodes.length,
  );
  assert.ok(subscriptionErrorCodes.includes("SUBSCRIPTION_DURATION_INVALID"));
});

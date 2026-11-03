import assert from "node:assert/strict";
import test from "node:test";
import {
  endFromDuration,
  resolveDuration,
  transitions,
  parseLifecycleDate,
} from "../services/subscription-lifecycle.policy.js";
import { SubscriptionsService } from "../services/subscriptions.service.js";
const id = "11111111-1111-1111-1111-111111111111";
const actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
test("duration resolution uses whole variant pair and rejects partial or unsupported pairs", () => {
  assert.deepEqual(
    resolveDuration({ value: 3, unit: "week" }, { value: 1, unit: "month" }),
    { value: 3, unit: "week" },
  );
  assert.deepEqual(
    resolveDuration({ value: null, unit: null }, { value: 1, unit: "month" }),
    { value: 1, unit: "month" },
  );
  for (const value of [
    { value: 2, unit: null },
    { value: null, unit: "week" },
    { value: 0, unit: "day" },
    { value: 1, unit: "year" },
  ])
    assert.equal(resolveDuration(value, { value: 1, unit: "month" }), null);
});
test("duration arithmetic uses UTC calendar days/weeks and clamps months across leap years", () => {
  const start = new Date("2028-01-31T12:34:56Z");
  assert.equal(
    endFromDuration(start, { value: 1, unit: "month" })?.toISOString(),
    "2028-02-29T12:34:56.000Z",
  );
  assert.equal(
    endFromDuration(new Date("2027-01-31T12:00:00Z"), {
      value: 1,
      unit: "month",
    })?.toISOString(),
    "2027-02-28T12:00:00.000Z",
  );
  assert.equal(
    endFromDuration(start, { value: 1, unit: "week" })?.toISOString(),
    "2028-02-07T12:34:56.000Z",
  );
  assert.equal(endFromDuration(start, { value: null, unit: null }), null);
});
test("transition map excludes terminal mutations and only permits completed renewal", () => {
  for (const [action, states] of Object.entries(transitions)) {
    assert.ok(!states.includes("cancelled"));
    assert.equal(states.includes("completed"), action === "renew");
  }
});
test("lifecycle date parser rejects ambiguous, rolled-over and invalid dates", () => {
  for (const value of [
    "2026-02-30T12:00:00Z",
    "2026-11-01",
    "nonsense",
    123,
    "2026-01-01T25:00:00Z",
  ])
    assert.equal(parseLifecycleDate(value), null);
});
for (const [action, body, error] of [
  ["activate", { status: "active" }, "SUBSCRIPTION_INVALID_INPUT"],
  ["pause", { reason: " " }, "SUBSCRIPTION_INVALID_INPUT"],
  [
    "complete",
    { overrideOutstandingComponents: true },
    "SUBSCRIPTION_COMPLETION_REASON_REQUIRED",
  ],
  [
    "complete",
    { overrideOutstandingComponents: "true" },
    "SUBSCRIPTION_INVALID_INPUT",
  ],
  [
    "resume",
    { revisedEndDate: "2026-02-30T12:00:00Z" },
    "SUBSCRIPTION_RESUME_DATE_INVALID",
  ],
  ["renew", {}, "SUBSCRIPTION_INVALID_INPUT"],
] as const)
  test(`${action} rejects malformed input before persistence (${error})`, async () => {
    const service = new SubscriptionsService({
      async execute() {
        assert.fail("invalid input reached repository");
      },
    });
    assert.deepEqual(await service.execute(id, action, body, actor), {
      status: "error",
      error,
    });
  });
test("service forwards only named fields and trims reasons", async () => {
  const service = new SubscriptionsService({
    async execute(subscriptionId, command, who) {
      assert.equal(subscriptionId, id);
      assert.equal(who, actor);
      assert.deepEqual(command, { action: "pause", reason: "Synthetic" });
      return { status: "error", error: "SUBSCRIPTION_NOT_FOUND" };
    },
  });
  await service.execute(id, "pause", { reason: " Synthetic " }, actor);
});

for (const [body, expected] of [
  [
    { overrideOutstandingComponents: false },
    { action: "complete", overrideOutstandingComponents: false },
  ],
  [
    {
      overrideOutstandingComponents: false,
      overrideReason: " Synthetic reason only ",
    },
    {
      action: "complete",
      overrideOutstandingComponents: false,
      reason: "Synthetic reason only",
    },
  ],
  [
    {
      overrideOutstandingComponents: true,
      overrideReason: " Synthetic override ",
    },
    {
      action: "complete",
      overrideOutstandingComponents: true,
      reason: "Synthetic override",
    },
  ],
] as const) {
  test(`completion forwards explicit boolean and normalized reason: ${JSON.stringify(body)}`, async () => {
    let calls = 0;
    const service = new SubscriptionsService({
      async execute(subscriptionId, command, who) {
        calls++;
        assert.equal(subscriptionId, id);
        assert.equal(who, actor);
        assert.deepEqual(command, expected);
        return {
          status: "error",
          error: "SUBSCRIPTION_COMPONENTS_OUTSTANDING",
        };
      },
    });
    assert.deepEqual(await service.execute(id, "complete", body, actor), {
      status: "error",
      error: "SUBSCRIPTION_COMPONENTS_OUTSTANDING",
    });
    assert.equal(calls, 1);
  });
}

for (const [body, error] of [
  [
    { overrideOutstandingComponents: true },
    "SUBSCRIPTION_COMPLETION_REASON_REQUIRED",
  ],
  [
    { overrideOutstandingComponents: true, overrideReason: " \n " },
    "SUBSCRIPTION_COMPLETION_REASON_REQUIRED",
  ],
  [
    { overrideOutstandingComponents: "true", overrideReason: "Synthetic" },
    "SUBSCRIPTION_INVALID_INPUT",
  ],
  [
    { overrideOutstandingComponents: 1, overrideReason: "Synthetic" },
    "SUBSCRIPTION_INVALID_INPUT",
  ],
  [{ overrideReason: "Synthetic" }, "SUBSCRIPTION_INVALID_INPUT"],
  [
    { overrideOutstandingComponents: false, unknown: true },
    "SUBSCRIPTION_INVALID_INPUT",
  ],
  [
    { overrideOutstandingComponents: true, overrideReason: 123 },
    "SUBSCRIPTION_INVALID_INPUT",
  ],
  [
    { overrideOutstandingComponents: true, overrideReason: "x".repeat(2001) },
    "SUBSCRIPTION_INVALID_INPUT",
  ],
] as const) {
  test(`completion rejects invalid intent before persistence (${error}, ${JSON.stringify(body).slice(0, 130)})`, async () => {
    const service = new SubscriptionsService({
      async execute() {
        assert.fail("invalid completion reached repository");
      },
    });
    assert.deepEqual(await service.execute(id, "complete", body, actor), {
      status: "error",
      error,
    });
  });
}

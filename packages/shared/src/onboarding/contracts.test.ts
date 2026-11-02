import assert from "node:assert/strict";
import test from "node:test";
import {
  onboardingApiRoutes,
  onboardingErrorCodes,
  type CapacityReservationInput,
  type ClearMedicalOnboardingInput,
  type WaiveOnboardingInput,
} from "./contracts.js";

test("onboarding contracts expose only the seven approved admin commands", () => {
  assert.deepEqual(onboardingApiRoutes, {
    detail: "/admin/subscriptions/:subscriptionId/onboarding",
    initialize: "/admin/subscriptions/:subscriptionId/onboarding/initialize",
    complete:
      "/admin/subscriptions/:subscriptionId/onboarding/items/:itemId/complete",
    waive:
      "/admin/subscriptions/:subscriptionId/onboarding/items/:itemId/waive",
    reservation:
      "/admin/subscriptions/:subscriptionId/onboarding/capacity-reservation",
    ready: "/admin/subscriptions/:subscriptionId/onboarding/ready",
    medicalClearance:
      "/admin/subscriptions/:subscriptionId/onboarding/medical-clearance/clear",
  });
  assert.equal(new Set(onboardingErrorCodes).size, onboardingErrorCodes.length);
  assert.ok(onboardingErrorCodes.includes("ONBOARDING_CAPACITY_EXHAUSTED"));
  assert.ok(
    onboardingErrorCodes.includes("ONBOARDING_MEDICAL_CLEARANCE_NOT_REQUIRED"),
  );
  assert.ok(
    onboardingErrorCodes.includes(
      "ONBOARDING_MEDICAL_CLEARANCE_HISTORY_INVALID",
    ),
  );
});
test("onboarding transport inputs contain only caller-owned values", () => {
  const waiver: WaiveOnboardingInput = {
    reason: "Synthetic operational exception",
  };
  const hold: CapacityReservationInput = {
    capacityReservedUntil: "2026-11-01T00:00:00Z",
  };
  assert.deepEqual(Object.keys(waiver), ["reason"]);
  assert.deepEqual(Object.keys(hold), ["capacityReservedUntil"]);
  const medical: ClearMedicalOnboardingInput = { note: "Synthetic note" };
  assert.deepEqual(Object.keys(medical), ["note"]);
});

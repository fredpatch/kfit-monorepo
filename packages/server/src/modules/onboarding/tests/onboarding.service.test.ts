import assert from "node:assert/strict";
import test from "node:test";
import { checklistDefinition, deriveOnboarding, itemPermissions, OnboardingService, resolveCapacity, resolveEffectivePolicy } from "../services/onboarding.service.js";

const id = "11111111-1111-1111-1111-111111111111";
const now = new Date("2026-10-20T10:00:00Z");
const future = new Date("2026-11-20T10:00:00Z");
const actor = { userId: id, requestId: "synthetic-onboarding", ipAddress: null, userAgent: null };
const completed = checklistDefinition(false).map(item => ({ ...item, status: "completed", isBlocking: true, waiverReason: null, waivedAt: null }));
const base = { status: "onboarding", plannedStartDate: future, until: null, limited: false, capacityAvailable: true, items: completed, questionnaireRequired: false, now };

test("onboarding policy uses complete variant policy before service fallback", () => {
  const service = { variantId: null, questionnaireTemplateId: id, medicalClearancePolicy: "required_if_risk_flag" };
  const variant = { variantId: id, questionnaireTemplateId: null, medicalClearancePolicy: "not_required" };
  assert.deepEqual(resolveEffectivePolicy([service, variant], id), { status: "ok", source: "variant", questionnaireRequired: false });
  assert.deepEqual(resolveEffectivePolicy([service], id), { status: "ok", source: "service", questionnaireRequired: true });
  assert.deepEqual(resolveEffectivePolicy([], id), { status: "ok", source: "none", questionnaireRequired: false });
  assert.deepEqual(resolveEffectivePolicy([service, service], null), { status: "policy_invalid" });
});
test("checklist is deterministic, system start completed, questionnaire conditional, no speculative medical item", () => {
  assert.deepEqual(checklistDefinition(false).map(item => [item.itemType, item.status]), [["start_date_confirmed", "completed"], ["service_terms", "pending"], ["payment_condition", "pending"]]);
  assert.deepEqual(checklistDefinition(true), checklistDefinition(true));
  assert.ok(checklistDefinition(true).some(item => item.itemType === "questionnaire"));
  assert.ok(!checklistDefinition(true).some(item => item.itemType === "medical_clearance"));
});
for (const [type, complete, waive] of [["start_date_confirmed", false, false], ["service_terms", false, false], ["questionnaire", false, true], ["payment_condition", true, true], ["medical_clearance", false, false], ["unknown", false, false]] as const) {
  test(`onboarding ownership for ${type}`, () => {
    assert.equal(itemPermissions(type).canComplete, complete);
    assert.equal(itemPermissions(type).canWaive, waive);
  });
}
test("capacity resolves variant override and rejects invalid limited configuration", () => {
  assert.deepEqual(resolveCapacity("limited", 3, 1), { status: "ok", mode: "limited", limit: 1, scope: "variant" });
  assert.deepEqual(resolveCapacity("limited", 3, null), { status: "ok", mode: "limited", limit: 3, scope: "service" });
  assert.deepEqual(resolveCapacity("unlimited", null, null), { status: "ok", mode: "unlimited", limit: null, scope: "service" });
  for (const limit of [null, 0, -1, 1.5]) assert.equal(resolveCapacity("limited", limit, null).status, "capacity_invalid");
});
test("unlimited readiness requires complete checklist and planned start", () => {
  assert.equal(deriveOnboarding(base).state, "ready");
  assert.equal(deriveOnboarding({ ...base, items: [] }).state, "blocked");
  assert.equal(deriveOnboarding({ ...base, plannedStartDate: null }).state, "blocked");
  assert.equal(deriveOnboarding({ ...base, items: completed.filter(item => item.itemType !== "service_terms") }).initialized, false);
});
test("limited missing/expired holds block readiness and derive stalled without altering input status", () => {
  assert.equal(deriveOnboarding({ ...base, limited: true }).state, "blocked");
  const input = { ...base, limited: true, until: now };
  assert.equal(deriveOnboarding(input).state, "stalled");
  assert.equal(input.status, "onboarding");
  assert.equal(deriveOnboarding({ ...input, until: future }).canReady, true);
  assert.equal(deriveOnboarding({ ...input, until: future, capacityAvailable: false }).canReady, false);
});
test("only authorized waivers with reason and timestamp satisfy blockers", () => {
  for (const item of completed) {
    const replace = { ...item, status: "waived", waiverReason: "Synthetic reason", waivedAt: now };
    assert.equal(deriveOnboarding({ ...base, items: completed.map(value => value.itemType === item.itemType ? replace : value) }).state,
      item.itemType === "payment_condition" ? "ready" : "blocked");
  }
  const invalid = completed.map(item => item.itemType === "payment_condition" ? { ...item, status: "waived", waiverReason: " ", waivedAt: now } : item);
  assert.equal(deriveOnboarding({ ...base, items: invalid }).state, "blocked");
  assert.equal(deriveOnboarding({ ...base, status: "ready_to_start" }).canReady, false);
});
test("onboarding service rejects bad identifiers, unknown fields, invalid deadlines and empty waiver reasons before persistence", async () => {
  const service = new OnboardingService({ async execute() { assert.fail("invalid command reached DB"); } });
  assert.equal((await service.execute("invalid", "read", {}, undefined, actor)).status, "invalid");
  assert.equal((await service.execute(id, "complete", {}, "invalid", actor)).status, "invalid");
  assert.equal((await service.execute(id, "ready", { status: "active" }, undefined, actor)).status, "invalid");
  for (const reason of [undefined, null, "", " ", 123]) assert.equal((await service.execute(id, "waive", { reason }, id, actor)).status, "reason_required");
  for (const capacityReservedUntil of [null, "2026-11-01", "2026-02-30T10:00:00Z", "invalid", 123]) assert.equal((await service.execute(id, "reserve", { capacityReservedUntil }, undefined, actor)).status, "invalid");
});
test("onboarding service trims waiver reason, preserves explicit deadline and propagates failure", async () => {
  const calls: unknown[] = [];
  const service = new OnboardingService({ async execute(subscriptionId, command, context) { assert.equal(subscriptionId, id); assert.equal(context, actor); calls.push(command); return { status: "blocked" }; } });
  await service.execute(id, "waive", { reason: " Synthetic reason " }, id, actor);
  await service.execute(id, "reserve", { capacityReservedUntil: future.toISOString() }, undefined, actor);
  assert.deepEqual(calls, [{ action: "waive", itemId: id, reason: "Synthetic reason" }, { action: "reserve", until: future }]);
  await assert.rejects(new OnboardingService({ async execute() { throw new Error("synthetic audit failure"); } }).execute(id, "initialize", {}, undefined, actor), /synthetic/);
});

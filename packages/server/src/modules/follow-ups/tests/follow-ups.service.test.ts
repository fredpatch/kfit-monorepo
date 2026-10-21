import assert from "node:assert/strict";
import test from "node:test";
import { calculateCadence, cadenceDayMs, effectiveFollowUpStatus, latestMeaningfulActivity, resolveCadence } from "../services/follow-up-cadence.policy.js";
import { FollowUpsService } from "../services/follow-ups.service.js";
const id = "11111111-1111-1111-1111-111111111111", now = new Date("2026-10-21T12:00:00Z"), at = (days: number) => new Date(now.getTime() + days * cadenceDayMs);
const actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
test("cadence resolves override then per-field variant/service fallback and disabled null", () => {
  const base = { variantId: null, followUpFrequencyDays: 7 }, variant = { variantId: id, followUpFrequencyDays: null };
  assert.deepEqual(resolveCadence(null, [base, variant], id), { days: 7, source: "service" });
  assert.deepEqual(resolveCadence(null, [base, { ...variant, followUpFrequencyDays: 3 }], id), { days: 3, source: "variant" });
  assert.deepEqual(resolveCadence(2, [base], id), { days: 2, source: "override" }); assert.deepEqual(resolveCadence(null, [], null), { days: null, source: "none" });
  assert.equal(resolveCadence(0, [base], null), null); assert.equal(resolveCadence(null, [base, base], null), null);
});
function calc(baseline: Date, pauses: Array<{ startedAt: Date; endedAt: Date | null }> = [], time = now, status = "active") {
  return calculateCadence({ status, actualStartDate: baseline, cadence: { days: 7, source: "service" }, activity: { at: baseline, type: "activation" }, pauses, now: time });
}
test("exact cadence instant is due, one millisecond before healthy, after overdue", () => {
  assert.equal(calc(at(-7), [], new Date(now.getTime() - 1)).cadenceState, "healthy"); assert.equal(calc(at(-7)).cadenceState, "due");
  const overdue = calc(at(-7), [], new Date(now.getTime() + 1)); assert.equal(overdue.cadenceState, "overdue"); assert.equal(overdue.overdueByDays, 0);
});
test("20-day pause retains four active days and ongoing pause freezes elapsed", () => {
  const pauses = [{ startedAt: at(-20), endedAt: null }]; const first = calc(at(-23), pauses, now, "paused"), later = calc(at(-23), pauses, at(10), "paused");
  assert.equal(first.activeElapsedMs, 3 * cadenceDayMs); assert.equal(later.activeElapsedMs, first.activeElapsedMs); assert.equal(first.cadenceState, null);
  const resumed = calc(at(-23), [{ startedAt: at(-20), endedAt: now }]); assert.equal(resumed.nextFollowUpDueAt, at(4).toISOString());
});
test("overlapping/adjacent pauses are merged and baseline crossing is clipped", () => {
  assert.equal(calc(at(-10), [{ startedAt: at(-8), endedAt: at(-5) }, { startedAt: at(-6), endedAt: at(-4) }]).activeElapsedMs, 6 * cadenceDayMs);
  const crossing = calc(at(-3), [{ startedAt: at(-5), endedAt: at(-2) }]); assert.equal(crossing.activeElapsedMs, 2 * cadenceDayMs); assert.equal(crossing.nextFollowUpDueAt, at(5).toISOString());
});
test("pauses after historical deadline freeze overdue duration without moving that deadline into pause", () => {
  const view = calc(at(-20), [{ startedAt: at(-10), endedAt: at(-5) }]); assert.equal(view.nextFollowUpDueAt, at(-13).toISOString()); assert.equal(view.overdueByDays, 8);
});
test("pause starting exactly at deadline keeps the remaining interval at zero on resume", () => {
  const view = calc(at(-10), [{ startedAt: at(-3), endedAt: now }]); assert.equal(view.nextFollowUpDueAt, now.toISOString()); assert.equal(view.cadenceState, "due");
});
test("meaningful activity chooses latest timestamp and cancellation itself adds nothing", () => {
  const activity = latestMeaningfulActivity(at(-10), [{ completedAt: at(-4) }], [{ occurredAt: at(-3), completedAt: null, status: "cancelled" }]);
  assert.equal(activity?.at.toISOString(), at(-3).toISOString()); assert.equal(activity?.type, "follow_up_recorded");
  assert.equal(latestMeaningfulActivity(null, [{ completedAt: now }], []), null);
});
test("next-action exact boundary is due and overdue remains read-time", () => {
  assert.equal(effectiveFollowUpStatus("open", now, now), "due"); assert.equal(effectiveFollowUpStatus("open", at(-1), now), "overdue"); assert.equal(effectiveFollowUpStatus("done", at(-1), now), "done");
});
for (const [action, body, error] of [
  ["create", { followUpType: "unvalidated", occurredAt: now.toISOString() }, "FOLLOW_UP_INVALID_INPUT"],
  ["create", { followUpType: "check_in", occurredAt: now.toISOString(), nextAction: " " }, "FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED"],
  ["create", { followUpType: "check_in", occurredAt: now.toISOString(), nextActionAt: at(1).toISOString() }, "FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED"],
  ["create", { followUpType: "check_in", occurredAt: now.toISOString(), nextAction: "Synthetic", nextActionAt: now.toISOString() }, "FOLLOW_UP_NEXT_ACTION_DATE_INVALID"],
  ["cadence", { frequencyDays: 0 }, "FOLLOW_UP_CADENCE_INVALID"], ["cadence", { frequencyDays: -1 }, "FOLLOW_UP_CADENCE_INVALID"], ["cadence", { frequencyDays: 1.5 }, "FOLLOW_UP_CADENCE_INVALID"],
  ["complete", { status: "overdue" }, "FOLLOW_UP_INVALID_INPUT"], ["cancel", { reason: " " }, "FOLLOW_UP_INVALID_INPUT"],
] as const) test(`follow-up ${action} rejects ${error} before persistence (${JSON.stringify(body)})`, async () => {
  const service = new FollowUpsService({ async execute() { assert.fail("invalid input reached persistence"); } }); assert.deepEqual(await service.execute(id, action, body, actor), { ok: false, error });
});

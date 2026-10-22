import assert from "node:assert/strict";
import test from "node:test";
import { cadenceAnalytics, computeCustomerAnalytics, linkAnalytics, paceAnalytics, pausedMs, resolvePeriod, selectFocusSubscription, weeklyAttendance, type AnalyticsSource, type AnalyticsSubscription } from "../services/customer-analytics.policy.js";

const day = 86_400_000;
const now = new Date("2026-10-22T10:00:00Z"); // Thursday
const at = (offsetDays: number, hour = 10) => new Date(Date.UTC(2026, 9, 22 + offsetDays, hour));

function sub(overrides: Partial<AnalyticsSubscription> = {}): AnalyticsSubscription {
  return {
    id: "sub-1", reference: "SUB-1", status: "active", serviceName: "Synthetic", serviceSlug: "synthetic", variantName: null,
    createdAt: at(-40), plannedStartDate: at(-30), actualStartDate: at(-30), plannedEndDate: at(30), actualEndDate: null,
    renewedFromSubscriptionId: null, cadenceDays: 7, pauses: [], components: [{ entitled: 12, consumed: 3 }], consumption: [], ...overrides,
  };
}
function source(overrides: Partial<AnalyticsSource> = {}): AnalyticsSource {
  return { customerId: "c-1", subscriptions: [sub()], appointments: [], followUps: [], links: [], rescheduleRequests: [], ...overrides };
}

test("focus subscription: requested id only if owned, else current (newest first), else newest", () => {
  const old = sub({ id: "old", status: "completed", createdAt: at(-100) });
  const current = sub({ id: "cur", status: "paused", createdAt: at(-50) });
  const draft = sub({ id: "new", status: "onboarding", createdAt: at(-1) });
  assert.equal(selectFocusSubscription([old, current, draft], null)?.id, "cur");
  assert.equal(selectFocusSubscription([old, draft], null)?.id, "new");
  assert.equal(selectFocusSubscription([old], "old")?.id, "old");
  assert.equal(selectFocusSubscription([old], "other"), null);
  assert.equal(selectFocusSubscription([], null), null);
});

test("periods: 30 days, focus subscription start (future start falls back to 30 days), earliest subscription", () => {
  const focus = sub();
  assert.equal(resolvePeriod("30j", focus, [focus], now).start.toISOString(), at(-30).toISOString());
  assert.equal(resolvePeriod("abonnement", focus, [focus], now).start.toISOString(), at(-30).toISOString());
  const future = sub({ actualStartDate: null, plannedStartDate: at(5) });
  assert.equal(resolvePeriod("abonnement", future, [future], now).start.toISOString(), at(-30).toISOString());
  assert.equal(resolvePeriod("tout", focus, [focus, sub({ createdAt: at(-200) })], now).start.toISOString(), at(-200).toISOString());
});

test("attendance rate = completed / (completed + missed); rescheduled shown but excluded, cancelled ignored, outside period ignored", () => {
  const appointments = [
    ...["completed", "completed", "completed", "missed", "rescheduled", "cancelled"].map((status, i) => ({ subscriptionId: "sub-1", scheduledStart: at(-i - 1), status, completedAt: null })),
    { subscriptionId: "sub-1", scheduledStart: at(-60), status: "missed", completedAt: null },
  ];
  const result = computeCustomerAnalytics(source({ appointments }), { period: "30j", focus: sub(), now });
  assert.deepEqual(result.attendance, { honored: 3, missed: 1, rescheduled: 1, rate: 0.75 });
  assert.equal(result.journey[0]?.attendanceRate, 0.6);
});

test("weekly attendance: 6 Monday-based UTC weeks ending with the current week", () => {
  const weeks = weeklyAttendance([
    { subscriptionId: "s", scheduledStart: new Date("2026-10-19T00:00:00Z"), status: "completed", completedAt: null },
    { subscriptionId: "s", scheduledStart: new Date("2026-10-18T23:59:00Z"), status: "missed", completedAt: null },
    { subscriptionId: "s", scheduledStart: new Date("2026-09-14T09:00:00Z"), status: "rescheduled", completedAt: null },
    { subscriptionId: "s", scheduledStart: new Date("2026-09-13T09:00:00Z"), status: "completed", completedAt: null },
  ], now);
  assert.deepEqual(weeks.map((w) => w.weekStart), ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  assert.deepEqual(weeks[0], { weekStart: "2026-09-14", honored: 0, rescheduled: 1, missed: 0 });
  assert.deepEqual(weeks[4], { weekStart: "2026-10-12", honored: 0, rescheduled: 0, missed: 1 });
  assert.deepEqual(weeks[5], { weekStart: "2026-10-19", honored: 1, rescheduled: 0, missed: 0 });
});

test("cadence: days since last meaningful activity per day, threshold = cadence, paused days not measured", () => {
  const focus = sub({ actualStartDate: at(-20), pauses: [{ startedAt: at(-5, 0), endedAt: at(-3, 0) }] });
  const data = source({
    subscriptions: [focus],
    appointments: [{ subscriptionId: "sub-1", scheduledStart: at(-15), status: "completed", completedAt: at(-15) }, { subscriptionId: "sub-1", scheduledStart: at(-14), status: "missed", completedAt: null }],
    followUps: [{ subscriptionId: "other", occurredAt: at(-1), completedAt: null, status: "open" }],
  });
  const result = cadenceAnalytics(focus, data, { start: at(-20), end: now });
  assert.ok(result);
  const byDate = new Map(result.series.map((p) => [p.date, p.daysSinceContact]));
  assert.equal(byDate.get("2026-10-02"), 0); // activation day
  assert.equal(byDate.get("2026-10-07"), 0); // completed appointment
  assert.equal(byDate.get("2026-10-14"), 7); // still within cadence
  assert.equal(byDate.get("2026-10-15"), 8); // over cadence
  assert.equal(byDate.get("2026-10-17"), null); // paused (17 & 18)
  assert.equal(byDate.get("2026-10-18"), null);
  // 2026-10-19: last activity 7 oct ~10:00, end of day 19 oct, minus 2 paused days → 10 active days.
  assert.equal(byDate.get("2026-10-19"), 10);
  // Today (measured until now = 10:00): 15 days − 2 paused = 13 → 6 days over cadence.
  assert.equal(byDate.get("2026-10-22"), 13);
  assert.equal(result.overdueByDays, 6);
  const measured = result.series.filter((p) => p.daysSinceContact !== null);
  const within = measured.filter((p) => (p.daysSinceContact as number) <= 7).length;
  assert.equal(within, 13); // 2 → 14 oct.
  assert.equal(result.inCadenceRate, Math.round((within / measured.length) * 10000) / 10000);
  const wider = cadenceAnalytics(focus, data, { start: at(-40), end: now });
  assert.equal(wider?.series[0]?.date, "2026-10-02"); // never before the subscription start
  assert.equal(cadenceAnalytics(sub({ cadenceDays: null }), data, { start: at(-20), end: now }), null);
  assert.equal(cadenceAnalytics(sub({ actualStartDate: null }), data, { start: at(-20), end: now }), null);
});

test("pace: linear expectation over active days, behind when realized < floor(expected), unrecorded consumption placed at start", () => {
  const focus = sub({
    actualStartDate: at(-30), plannedEndDate: at(30), components: [{ entitled: 10, consumed: 3 }, { entitled: 2, consumed: 0 }],
    consumption: [{ at: at(-20), delta: 1 }, { at: at(-10), delta: 2 }, { at: at(-9), delta: -1 }],
  });
  const pace = paceAnalytics(focus, now);
  assert.ok(pace);
  assert.equal(pace.entitled, 12);
  assert.equal(pace.realized, 3);
  assert.equal(pace.expected, 6);
  assert.equal(pace.behind, true);
  assert.deepEqual(pace.series.map((p) => p.realized), [1, 2, 4, 3, 3]);
  const paused = paceAnalytics(sub({ actualStartDate: at(-30), plannedEndDate: at(30), pauses: [{ startedAt: at(-10), endedAt: null }], components: [{ entitled: 10, consumed: 3 }] }), now);
  // 20 active days elapsed out of 50 active days (the open pause counts until now only).
  assert.equal(paused?.elapsedDays, 20);
  assert.equal(paused?.expected, 4);
  assert.equal(paused?.behind, true);
  assert.equal(paceAnalytics(sub({ components: [] }), now), null);
  assert.equal(paceAnalytics(sub({ plannedEndDate: null }), now), null);
});

test("links: median hours from creation to first use for links created in the period; reschedule requests counted", () => {
  const period = { start: at(-30), end: now };
  const links = [
    { createdAt: at(-5, 8), usedAt: at(-5, 9) },
    { createdAt: at(-4, 8), usedAt: at(-4, 11) },
    { createdAt: at(-3, 8), usedAt: at(-3, 20) },
    { createdAt: at(-2, 8), usedAt: null },
    { createdAt: at(-60, 8), usedAt: at(-60, 9) },
  ];
  assert.deepEqual(linkAnalytics(source({ links, rescheduleRequests: [at(-1), at(-90)] }), period), { sent: 4, used: 3, medianHoursToUse: 3, rescheduleRequests: 1 });
  assert.equal(linkAnalytics(source({ links: links.slice(0, 2) }), period).medianHoursToUse, 2);
  assert.equal(linkAnalytics(source(), period).medianHoursToUse, null);
});

test("pausedMs merges overlapping pauses and clips to the window", () => {
  const pauses = [{ startedAt: new Date(0), endedAt: new Date(3 * day) }, { startedAt: new Date(2 * day), endedAt: new Date(5 * day) }, { startedAt: new Date(8 * day), endedAt: null }];
  assert.equal(pausedMs(pauses, day, 10 * day), 4 * day + 2 * day);
});

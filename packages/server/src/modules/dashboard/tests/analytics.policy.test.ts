import assert from "node:assert/strict";
import test from "node:test";
import type { DashboardHistoricalPoint } from "@kfit/shared";
import {
  analyticsBuckets,
  dashboardDelta,
  inAnalyticsBucket,
  requestCohortFunnel,
} from "../services/analytics.policy.js";

const now = new Date("2026-10-25T23:00:00Z"); // Monday midnight in Libreville, still Sunday UTC.
for (const [period, count] of [
  ["4w", 4],
  ["8w", 8],
  ["12m", 12],
] as const)
  test(`dashboard ${period} returns ${count} contiguous business buckets`, () => {
    const rows = analyticsBuckets(period, now);
    assert.equal(rows.length, count);
    rows.forEach((row, index) => {
      assert.ok(row.end > row.start);
      assert.equal(row.isCurrent, index === count - 1);
      if (index)
        assert.equal(
          row.start.toISOString(),
          rows[index - 1]!.end.toISOString(),
        );
    });
  });
test("dashboard weeks begin on Libreville Monday rather than UTC Monday", () => {
  const last = analyticsBuckets("4w", now).at(-1)!;
  assert.equal(last.start.toISOString(), "2026-10-25T23:00:00.000Z");
  assert.equal(last.end.toISOString(), "2026-11-01T23:00:00.000Z");
});
test("dashboard calendar months span year rollover and real month lengths", () => {
  const rows = analyticsBuckets("12m", new Date("2026-01-31T23:30:00Z"));
  assert.equal(rows[0]!.start.toISOString(), "2025-02-28T23:00:00.000Z");
  assert.equal(rows.at(-1)!.start.toISOString(), "2026-01-31T23:00:00.000Z");
  assert.equal(rows.at(-1)!.end.toISOString(), "2026-02-28T23:00:00.000Z");
});
test("dashboard bucket membership is start-inclusive and end-exclusive", () => {
  const bucket = analyticsBuckets("4w", now).at(-1)!;
  assert.equal(inAnalyticsBucket(bucket.start, bucket), true);
  assert.equal(inAnalyticsBucket(bucket.end, bucket), false);
  assert.equal(
    inAnalyticsBucket(new Date(bucket.start.getTime() - 1), bucket),
    false,
  );
});
const point = (value: number): DashboardHistoricalPoint => ({
  start: "2026-01-01",
  end: "2026-01-08",
  value,
  availability: "complete",
});
test("dashboard deltas retain exact absolute and percentage changes", () => {
  assert.deepEqual(dashboardDelta(point(15), point(10)), {
    current: 15,
    previous: 10,
    absoluteChange: 5,
    percentageChange: 50,
    direction: "up",
    favourable: true,
  });
});
test("dashboard zero previous yields null percentage rather than Infinity", () => {
  assert.equal(dashboardDelta(point(1), point(0))?.percentageChange, null);
});
test("dashboard falling overdue stock is favourable", () => {
  const result = dashboardDelta(point(2), point(4), true);
  assert.equal(result?.direction, "down");
  assert.equal(result?.favourable, true);
});
test("dashboard rising overdue stock is unfavourable", () => {
  assert.equal(dashboardDelta(point(4), point(2), true)?.favourable, false);
});
test("dashboard flat deltas have no favourable direction", () => {
  assert.equal(dashboardDelta(point(4), point(4))?.direction, "flat");
  assert.equal(dashboardDelta(point(4), point(4))?.favourable, null);
});
test("dashboard unavailable endpoint on either side suppresses the delta", () => {
  const unknown: DashboardHistoricalPoint = {
    ...point(0),
    value: null,
    availability: "unavailable",
  };
  assert.equal(dashboardDelta(unknown, point(0)), null);
  assert.equal(dashboardDelta(point(0), unknown), null);
});
test("dashboard empty cohort has null conversion rate", () => {
  assert.deepEqual(requestCohortFunnel([], new Set(), new Set()), {
    funnel: { received: 0, contacted: 0, qualified: 0, converted: 0 },
    conversionRate: null,
  });
});
test("dashboard cumulative funnel includes later stages without recorded contact", () => {
  const rows = ["new", "contacted", "qualified", "converted"].map((id) => ({
    id,
    submittedAt: now,
    convertedSubscriptionId: id === "converted" ? "subscription" : null,
  }));
  assert.deepEqual(
    requestCohortFunnel(rows, new Set(["contacted"]), new Set(["qualified"])),
    {
      funnel: { received: 4, contacted: 3, qualified: 2, converted: 1 },
      conversionRate: 0.25,
    },
  );
});
test("dashboard cohort conversion is evaluated now regardless of submission age", () => {
  const rows = [
    {
      id: "old",
      submittedAt: new Date("2025-01-01"),
      convertedSubscriptionId: "later-subscription",
    },
  ];
  assert.equal(
    requestCohortFunnel(rows, new Set(), new Set()).funnel.converted,
    1,
  );
});

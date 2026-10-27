import {
  addBusinessDays,
  businessDateKey,
  businessDayStartFromKey,
  startOfBusinessWeek,
  type DashboardDelta,
  type DashboardHistoricalPoint,
  type DashboardPeriod,
} from "@kfit/shared";

export type AnalyticsBucket = { start: Date; end: Date; isCurrent: boolean };
export function analyticsBuckets(
  period: DashboardPeriod,
  now: Date,
): AnalyticsBucket[] {
  if (period !== "12m") {
    const count = period === "4w" ? 4 : 8,
      current = startOfBusinessWeek(now);
    return Array.from({ length: count }, (_, index) => ({
      start: addBusinessDays(current, (index - count + 1) * 7),
      end: addBusinessDays(current, (index - count + 2) * 7),
      isCurrent: index === count - 1,
    }));
  }
  const [year, month] = businessDateKey(now).split("-").map(Number);
  const monthStart = (offset: number) => {
    const calendar = new Date(Date.UTC(year!, month! - 1 + offset, 1));
    const instant = businessDayStartFromKey(
      calendar.toISOString().slice(0, 10),
    );
    if (!instant) throw new Error("Invalid analytics month boundary");
    return instant;
  };
  return Array.from({ length: 12 }, (_, index) => ({
    start: monthStart(index - 11),
    end: monthStart(index - 10),
    isCurrent: index === 11,
  }));
}
export const inAnalyticsBucket = (
  at: Date,
  bucket: Pick<AnalyticsBucket, "start" | "end">,
) => at >= bucket.start && at < bucket.end;
export function dashboardDelta(
  current: DashboardHistoricalPoint,
  previous: DashboardHistoricalPoint,
  lowerIsBetter = false,
): DashboardDelta | null {
  if (
    current.availability === "unavailable" ||
    previous.availability === "unavailable"
  )
    return null;
  const change = current.value - previous.value;
  return {
    current: current.value,
    previous: previous.value,
    absoluteChange: change,
    percentageChange:
      previous.value === 0 ? null : (change / previous.value) * 100,
    direction: change === 0 ? "flat" : change > 0 ? "up" : "down",
    favourable: change === 0 ? null : lowerIsBetter ? change < 0 : change > 0,
  };
}
export type RequestCohortRow = {
  id: string;
  submittedAt: Date;
  convertedSubscriptionId: string | null;
};
export function requestCohortFunnel(
  rows: readonly RequestCohortRow[],
  contactedIds: ReadonlySet<string>,
  qualifiedIds: ReadonlySet<string>,
) {
  let contacted = 0,
    qualified = 0,
    converted = 0;
  for (const row of rows) {
    const isConverted = row.convertedSubscriptionId !== null,
      isQualified = isConverted || qualifiedIds.has(row.id);
    if (isConverted) converted++;
    if (isQualified) qualified++;
    // Fred's S7.1 decision: later-stage reach implies cumulative earlier reach,
    // including requests converted without a separately logged contact attempt.
    if (isQualified || contactedIds.has(row.id)) contacted++;
  }
  return {
    funnel: { received: rows.length, contacted, qualified, converted },
    conversionRate: rows.length ? converted / rows.length : null,
  };
}

import { businessDateKey, dashboardPeriods, type DashboardAnalyticsResponse, type DashboardFinanceSummary, type DashboardHistoricalPoint, type DashboardKpiTrend, type DashboardPeriod } from "@kfit/shared";
import type { DrizzleDashboardAnalyticsRepository } from "../repositories/analytics.repository.js";
import { analyticsBuckets, dashboardDelta, inAnalyticsBucket, requestCohortFunnel } from "./analytics.policy.js";
import { historicalStocks } from "./historical-stock.policy.js";
import { sumXaf } from "../../finance/services/finance.policy.js";

export class DashboardAnalyticsService {
  constructor(private readonly repository: Pick<DrizzleDashboardAnalyticsRepository, "snapshot">, private readonly clock: () => Date = () => new Date()) {}
  async analytics(query: { periode?: unknown }): Promise<{ status: "invalid" } | { status: "ok"; response: DashboardAnalyticsResponse }> {
    const period = query.periode === undefined ? "4w" : query.periode;
    const periode = dashboardPeriods.find(candidate => candidate === period);
    if (!periode) return { status: "invalid" };
    return { status: "ok", response: await this.read(periode) };
  }
  private async read(periode: DashboardPeriod): Promise<DashboardAnalyticsResponse> {
    const now = this.clock(), weeks = analyticsBuckets("8w", now), selected = analyticsBuckets(periode, now);
    const from = new Date(Math.min(weeks[0]!.start.getTime(), selected[0]!.start.getTime()));
    const data = await this.repository.snapshot(from, now);
    const trends: DashboardAnalyticsResponse["trends"] = { activeClients: { points: [], delta: null }, followUpsOverdue: { points: [], delta: null }, newRequests: { points: [], delta: null }, sessionsCompleted: { points: [], delta: null } };
    const point = (start: Date, end: Date, value: number | null): DashboardHistoricalPoint => value === null ? { start: start.toISOString(), end: end.toISOString(), value, availability: "unavailable" } : { start: start.toISOString(), end: end.toISOString(), value, availability: "complete" };
    for (const week of weeks) {
      const at = new Date(Math.min(now.getTime(), week.end.getTime() - 1)), stock = historicalStocks(data, at);
      trends.activeClients.points.push(point(week.start, week.end, stock.activeClients));
      trends.followUpsOverdue.points.push(point(week.start, week.end, stock.followUpsOverdue));
      trends.newRequests.points.push(point(week.start, week.end, data.requests.filter(row => inAnalyticsBucket(row.submittedAt, week)).length));
      trends.sessionsCompleted.points.push(point(week.start, week.end, data.appointments.filter(row => row.completedAt && inAnalyticsBucket(row.completedAt, week)).length));
    }
    for (const [key, trend] of Object.entries(trends) as Array<[keyof typeof trends, DashboardKpiTrend]>) trend.delta = dashboardDelta(trend.points[7]!, trend.points[6]!, key === "followUpsOverdue");
    const cohort = data.requests.filter(row => row.submittedAt >= selected[0]!.start && row.submittedAt < selected.at(-1)!.end);
    const today = businessDateKey(now), collected: number[] = [], due: number[] = [], future: number[] = [], overdue: number[] = [];
    for (const view of data.finance) {
      for (const event of view.paymentHistory) if (event.eventType === "payment_received" && new Date(event.occurredAt) >= selected[0]!.start && new Date(event.occurredAt) < selected.at(-1)!.end && new Date(event.occurredAt) <= now) collected.push(event.correctableXaf);
      for (const item of view.activePaymentPlan?.installments ?? []) {
        const day = businessDateKey(new Date(item.dueDate));
        (day < today ? overdue : day > today ? future : due).push(item.remainingXaf);
      }
    }
    const finance: DashboardFinanceSummary = { collectedXaf: sumXaf(collected), dueXaf: sumXaf(due), futureXaf: sumXaf(future), overdueXaf: sumXaf(overdue), outstandingXaf: sumXaf([...overdue, ...due, ...future]) };
    return { asOf: now.toISOString(), businessDate: today, periode, trends, requests: { buckets: selected.map(bucket => ({ start: bucket.start.toISOString(), end: bucket.end.toISOString(), isCurrent: bucket.isCurrent, count: cohort.filter(row => inAnalyticsBucket(row.submittedAt, bucket)).length })), totalRequests: cohort.length, ...requestCohortFunnel(cohort, data.contactedIds, data.qualifiedIds) }, finance };
  }
}

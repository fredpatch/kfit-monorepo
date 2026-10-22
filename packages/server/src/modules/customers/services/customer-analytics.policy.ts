import type { CustomerAnalytics, CustomerAnalyticsPeriod, CustomerAnalyticsWeek } from "@kfit/shared";
import { cadenceDayMs, meaningfulActivities, type CadencePause } from "../../follow-ups/services/follow-up-cadence.policy.js";

/*
 * Client analytics (UX-4c, board 03b). Pure calculations over existing rows — no writes, no new state.
 * Rules validated by Fred on 2026-10-22:
 *  1. Attendance = completed ÷ (completed + missed), appointments scheduled in the period, all subscriptions.
 *     Rescheduled are counted for display but excluded from the rate; cancellations ignored.
 *  2. Cadence respect = share of measured days where « days since last meaningful activity » ≤ cadence.
 *     Activity = S5.3 definition (meaningfulActivities). Paused time is excluded. Focus subscription only.
 *  3. Pace = realized (sum consumed) vs linear expectation entitled × elapsed active days ÷ total active days
 *     (actual start → planned end, pauses excluded). Behind when realized < floor(expected). Focus subscription only.
 *  4. Link responsiveness = median time between a client link being created and its first use, links created in the period.
 *  5. Weekly attendance = last 6 weeks (Monday, UTC), honored / rescheduled / missed, all subscriptions.
 *  6. Journey = every subscription, read-only, with all-time attendance per subscription.
 * Days are UTC days until the time-zone decision is taken (backlog).
 */

export type AnalyticsSubscription = {
  id: string; reference: string; status: string; serviceName: string; serviceSlug: string; variantName: string | null;
  createdAt: Date; plannedStartDate: Date | null; actualStartDate: Date | null; plannedEndDate: Date | null; actualEndDate: Date | null;
  renewedFromSubscriptionId: string | null;
  /** Effective cadence (override → variant → service); null when none or invalid. */
  cadenceDays: number | null;
  pauses: CadencePause[];
  components: Array<{ entitled: number; consumed: number }>;
  /** Consumption history: +quantity for consumptive events, −quantity for restorations. */
  consumption: Array<{ at: Date; delta: number }>;
};
export type AnalyticsSource = {
  customerId: string;
  subscriptions: AnalyticsSubscription[];
  appointments: Array<{ subscriptionId: string; scheduledStart: Date; status: string; completedAt: Date | null }>;
  followUps: Array<{ subscriptionId: string; occurredAt: Date; completedAt: Date | null; status: string }>;
  links: Array<{ createdAt: Date; usedAt: Date | null }>;
  rescheduleRequests: Date[];
};

const currentStatuses = ["active", "paused", "completion_due"];
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const startOfUtcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function selectFocusSubscription(subscriptions: AnalyticsSubscription[], requestedId: string | null): AnalyticsSubscription | null {
  if (requestedId) return subscriptions.find((s) => s.id === requestedId) ?? null;
  const byNewest = [...subscriptions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return byNewest.find((s) => currentStatuses.includes(s.status)) ?? byNewest[0] ?? null;
}

export function resolvePeriod(period: CustomerAnalyticsPeriod, focus: AnalyticsSubscription | null, subscriptions: AnalyticsSubscription[], now: Date): { start: Date; end: Date } {
  const thirtyDays = new Date(now.getTime() - 30 * cadenceDayMs);
  if (period === "abonnement" && focus) {
    const start = focus.actualStartDate ?? focus.plannedStartDate ?? focus.createdAt;
    return { start: start > now ? thirtyDays : start, end: now };
  }
  if (period === "tout" && subscriptions.length) {
    return { start: new Date(Math.min(...subscriptions.map((s) => s.createdAt.getTime()))), end: now };
  }
  return { start: thirtyDays, end: now };
}

/** Paused milliseconds inside [from, to]. Open pauses run until `to`. */
export function pausedMs(pauses: CadencePause[], from: number, to: number): number {
  const intervals = pauses
    .map((p) => [Math.max(from, p.startedAt.getTime()), Math.min(to, p.endedAt?.getTime() ?? to)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cursor = -Infinity;
  for (const [a, b] of intervals) {
    const start = Math.max(a, cursor);
    if (b > start) total += b - start;
    cursor = Math.max(cursor, b);
  }
  return total;
}

function attendanceOf(rows: AnalyticsSource["appointments"]) {
  const honored = rows.filter((a) => a.status === "completed").length;
  const missed = rows.filter((a) => a.status === "missed").length;
  const rescheduled = rows.filter((a) => a.status === "rescheduled").length;
  return { honored, missed, rescheduled, rate: honored + missed ? round(honored / (honored + missed), 4) : null };
}

export function weeklyAttendance(appointments: AnalyticsSource["appointments"], now: Date, weeks = 6): CustomerAnalyticsWeek[] {
  const today = startOfUtcDay(now);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * cadenceDayMs;
  return Array.from({ length: weeks }, (_, i) => {
    const start = monday - (weeks - 1 - i) * 7 * cadenceDayMs;
    const end = start + 7 * cadenceDayMs;
    const rows = appointments.filter((a) => a.scheduledStart.getTime() >= start && a.scheduledStart.getTime() < end);
    const { honored, missed, rescheduled } = attendanceOf(rows);
    return { weekStart: isoDay(start), honored, rescheduled, missed };
  });
}

export function cadenceAnalytics(focus: AnalyticsSubscription, source: AnalyticsSource, period: { start: Date; end: Date }): CustomerAnalytics["cadence"] {
  if (focus.cadenceDays === null || !focus.actualStartDate) return null;
  const activities = meaningfulActivities(
    focus.actualStartDate,
    source.appointments.filter((a) => a.subscriptionId === focus.id && a.status === "completed"),
    source.followUps.filter((f) => f.subscriptionId === focus.id),
  ).map((a) => a.at.getTime()).sort((a, b) => a - b);
  const startMs = focus.actualStartDate.getTime();
  const stopMs = Math.min(period.end.getTime(), focus.actualEndDate?.getTime() ?? Infinity);
  const series: Array<{ date: string; daysSinceContact: number | null }> = [];
  let measured = 0;
  let within = 0;
  let lastOverdue: number | null = null;
  // The series starts at the later of the period start and the subscription start: days before it are not part of the cadence.
  const firstDay = startOfUtcDay(new Date(Math.max(period.start.getTime(), startMs)));
  for (let day = firstDay; day <= startOfUtcDay(period.end); day += cadenceDayMs) {
    const t = Math.min(day + cadenceDayMs - 1, stopMs);
    const inPause = focus.pauses.some((p) => p.startedAt.getTime() <= t && (p.endedAt === null || p.endedAt.getTime() > t));
    if (t < startMs || day > stopMs || inPause) {
      series.push({ date: isoDay(day), daysSinceContact: null });
      lastOverdue = null;
      continue;
    }
    const last = activities.filter((a) => a <= t).at(-1) ?? startMs;
    const activeMs = Math.max(0, t - last - pausedMs(focus.pauses, last, t));
    const days = Math.floor(activeMs / cadenceDayMs);
    series.push({ date: isoDay(day), daysSinceContact: days });
    measured += 1;
    // Whole days, same value as the chart: « 7 j » with a 7-day cadence is within cadence.
    if (days <= focus.cadenceDays) within += 1;
    lastOverdue = Math.max(0, days - focus.cadenceDays);
  }
  return { subscriptionId: focus.id, cadenceDays: focus.cadenceDays, inCadenceRate: measured ? round(within / measured, 4) : null, overdueByDays: lastOverdue, series };
}

export function paceAnalytics(focus: AnalyticsSubscription, now: Date): CustomerAnalytics["pace"] {
  const entitled = focus.components.reduce((sum, c) => sum + c.entitled, 0);
  if (!focus.actualStartDate || !focus.plannedEndDate || entitled === 0) return null;
  const start = focus.actualStartDate.getTime();
  const end = focus.plannedEndDate.getTime();
  if (end <= start) return null;
  const realized = focus.components.reduce((sum, c) => sum + c.consumed, 0);
  // An open pause counts until now only: the future is not assumed paused.
  const pauses = focus.pauses.map((p) => ({ startedAt: p.startedAt, endedAt: p.endedAt ?? now }));
  const totalMs = Math.max(1, end - start - pausedMs(pauses, start, end));
  const stop = Math.min(now.getTime(), focus.actualEndDate?.getTime() ?? Infinity, end);
  const elapsedMs = Math.max(0, stop - start - pausedMs(pauses, start, stop));
  const expected = round(entitled * Math.min(1, elapsedMs / totalMs), 1);

  // Consumption counted before the first event (or never recorded as an event) is placed at the start.
  const events = [...focus.consumption].sort((a, b) => a.at.getTime() - b.at.getTime());
  const recorded = events.reduce((sum, e) => sum + e.delta, 0);
  let cumulative = realized - recorded;
  const series = [{ date: new Date(start).toISOString(), realized: Math.max(0, cumulative) }];
  for (const event of events) {
    cumulative += event.delta;
    series.push({ date: new Date(Math.max(start, event.at.getTime())).toISOString(), realized: Math.max(0, cumulative) });
  }
  series.push({ date: new Date(Math.max(start, stop)).toISOString(), realized });

  return {
    subscriptionId: focus.id, entitled, realized, expected,
    elapsedDays: Math.floor(elapsedMs / cadenceDayMs), totalDays: Math.ceil(totalMs / cadenceDayMs),
    behind: realized < Math.floor(expected),
    startDate: focus.actualStartDate.toISOString(), endDate: focus.plannedEndDate.toISOString(), series,
  };
}

export function linkAnalytics(source: AnalyticsSource, period: { start: Date; end: Date }): CustomerAnalytics["links"] {
  const inPeriod = (d: Date) => d >= period.start && d <= period.end;
  const links = source.links.filter((l) => inPeriod(l.createdAt));
  const hours = links.filter((l) => l.usedAt).map((l) => ((l.usedAt as Date).getTime() - l.createdAt.getTime()) / 3_600_000).sort((a, b) => a - b);
  const middle = Math.floor(hours.length / 2);
  const median = hours.length === 0 ? null : hours.length % 2 ? (hours[middle] as number) : ((hours[middle - 1] as number) + (hours[middle] as number)) / 2;
  return { sent: links.length, used: hours.length, medianHoursToUse: median === null ? null : round(median, 1), rescheduleRequests: source.rescheduleRequests.filter(inPeriod).length };
}

export function computeCustomerAnalytics(source: AnalyticsSource, input: { period: CustomerAnalyticsPeriod; focus: AnalyticsSubscription | null; now: Date }): CustomerAnalytics {
  const { focus, now } = input;
  const period = resolvePeriod(input.period, focus, source.subscriptions, now);
  const inPeriod = source.appointments.filter((a) => a.scheduledStart >= period.start && a.scheduledStart <= period.end);
  return {
    customerId: source.customerId,
    period: input.period,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    focusSubscriptionId: focus?.id ?? null,
    attendance: attendanceOf(inPeriod),
    weeklyAttendance: weeklyAttendance(source.appointments, now),
    cadence: focus ? cadenceAnalytics(focus, source, period) : null,
    pace: focus ? paceAnalytics(focus, now) : null,
    links: linkAnalytics(source, period),
    journey: [...source.subscriptions]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((s) => ({
        subscriptionId: s.id, reference: s.reference, serviceName: s.serviceName, serviceSlug: s.serviceSlug, variantName: s.variantName, status: s.status,
        startDate: (s.actualStartDate ?? s.plannedStartDate)?.toISOString() ?? null,
        endDate: (s.actualEndDate ?? s.plannedEndDate)?.toISOString() ?? null,
        entitled: s.components.reduce((sum, c) => sum + c.entitled, 0),
        consumed: s.components.reduce((sum, c) => sum + c.consumed, 0),
        attendanceRate: attendanceOf(source.appointments.filter((a) => a.subscriptionId === s.id)).rate,
        renewedFromSubscriptionId: s.renewedFromSubscriptionId,
      })),
  };
}

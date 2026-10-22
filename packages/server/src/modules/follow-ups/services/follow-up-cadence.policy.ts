import type { CadenceSource, FollowUpCadence, MeaningfulActivityType } from "@kfit/shared";
export const cadenceDayMs = 86400000;
export class InvalidCadenceError extends Error {}
export const validCadence = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
type Policy = { variantId: string | null; followUpFrequencyDays: number | null };
export function resolveCadence(override: number | null, rows: Policy[], variantId: string | null): { days: number | null; source: CadenceSource } | null {
  if (override !== null) return validCadence(override) ? { days: override, source: "override" } : null;
  const base = rows.filter(r => r.variantId === null), variants = variantId ? rows.filter(r => r.variantId === variantId) : [];
  if (variants.length > 1 || base.length > 1) return null;
  const days = variants[0]?.followUpFrequencyDays ?? base[0]?.followUpFrequencyDays ?? null;
  return days === null ? { days: null, source: "none" } : validCadence(days) ? { days, source: variants[0]?.followUpFrequencyDays !== null && variants[0]?.followUpFrequencyDays !== undefined ? "variant" : "service" } : null;
}
export type MeaningfulActivity = { at: Date; type: MeaningfulActivityType };
export type CadencePause = { startedAt: Date; endedAt: Date | null };
/** Every meaningful activity (S5.3 definition), unordered. Also used by the client analytics (UX-4c). */
export function meaningfulActivities(start: Date | null, completedAppointments: Array<{ completedAt: Date | null }>, followUps: Array<{ occurredAt: Date; completedAt: Date | null; status: string }>): MeaningfulActivity[] {
  if (!start) return [];
  const candidates: MeaningfulActivity[] = [{ at: start, type: "activation" }];
  for (const app of completedAppointments) if (app.completedAt) candidates.push({ at: app.completedAt, type: "appointment_completed" });
  for (const row of followUps) {
    candidates.push({ at: row.occurredAt, type: "follow_up_recorded" });
    if (row.status === "done" && row.completedAt) candidates.push({ at: row.completedAt, type: "follow_up_completed" });
  }
  return candidates;
}
export function latestMeaningfulActivity(start: Date | null, completedAppointments: Array<{ completedAt: Date | null }>, followUps: Array<{ occurredAt: Date; completedAt: Date | null; status: string }>): MeaningfulActivity | null {
  const candidates = meaningfulActivities(start, completedAppointments, followUps);
  return candidates.reduce<MeaningfulActivity | null>((latest, candidate) => !latest || candidate.at > latest.at ? candidate : latest, null);
}
export function calculateCadence(input: { status: string; actualStartDate: Date | null; cadence: { days: number | null; source: CadenceSource }; activity: MeaningfulActivity | null; pauses: CadencePause[]; now: Date }): FollowUpCadence {
  const { cadence, now, activity } = input;
  const eligible = input.status === "active" && input.actualStartDate !== null && cadence.days !== null;
  const result: FollowUpCadence = { effectiveCadenceDays: cadence.days, cadenceSource: cadence.source, monitoringDisabled: cadence.days === null,
    cadenceEligible: eligible, clockFrozen: input.status === "paused", latestMeaningfulActivityAt: activity?.at.toISOString() ?? null, latestActivityType: activity?.type ?? null,
    nextFollowUpDueAt: null, cadenceState: null, overdueByDays: null, activeElapsedMs: null };
  if (cadence.days === null || !activity || !input.actualStartDate) return result;
  const baseline = activity.at.getTime(), current = now.getTime(), span = cadence.days * cadenceDayMs;
  const intervals = input.pauses.map(p => [Math.max(baseline, p.startedAt.getTime()), Math.min(current, p.endedAt?.getTime() ?? current)] as const)
    .filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
  }
  const pausedMs = merged.reduce((sum, [start, end]) => sum + end - start, 0);
  const activeMs = Math.max(0, current - baseline - pausedMs);
  // Walk the active-time deadline. Pauses after an already-missed deadline cannot
  // move that historical deadline into a pause; they still freeze overdue elapsed time.
  let deadline = baseline + span;
  for (const [start, end] of merged) { if (start > deadline) break; deadline += end - start; }
  result.activeElapsedMs = activeMs;
  const dueDate = new Date(deadline);
  if (!Number.isFinite(dueDate.getTime())) throw new InvalidCadenceError("Cadence deadline outside supported date range");
  result.nextFollowUpDueAt = dueDate.toISOString();
  if (eligible) {
    result.cadenceState = current < deadline ? "healthy" : current === deadline ? "due" : "overdue";
    result.overdueByDays = result.cadenceState === "overdue" ? Math.floor(Math.max(0, activeMs - span) / cadenceDayMs) : null;
  }
  return result;
}
export function effectiveFollowUpStatus(status: "open" | "done" | "cancelled", dueAt: Date | null, now: Date) {
  return status !== "open" || !dueAt ? status : dueAt < now ? "overdue" : dueAt.getTime() === now.getTime() ? "due" : "open";
}

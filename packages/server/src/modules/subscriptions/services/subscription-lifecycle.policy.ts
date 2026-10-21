import type { SubscriptionCommand } from "@kfit/shared";

export const transitions: Record<SubscriptionCommand, readonly string[]> = {
  activate: ["ready_to_start"], pause: ["active"], resume: ["paused"], "completion-due": ["active"],
  complete: ["completion_due"], "resume-active": ["completion_due"], cancel: ["ready_to_start", "active", "paused", "completion_due"], renew: ["completion_due", "completed"],
};
export type Duration = { value: number | null; unit: string | null };
export function validDuration(duration: Duration): boolean {
  return duration.value === null && duration.unit === null || duration.value !== null && Number.isInteger(duration.value) && duration.value > 0
    && duration.unit !== null && ["day", "week", "month"].includes(duration.unit);
}
export function resolveDuration(variant: Duration | null, service: Duration): Duration | null {
  const selected = variant && (variant.value !== null || variant.unit !== null) ? variant : service;
  return validDuration(selected) ? selected : null;
}
// Calendar months clamp to the last valid day, preserving the UTC time of activation.
export function endFromDuration(start: Date, duration: Duration): Date | null {
  if (!validDuration(duration)) throw new Error("Invalid duration snapshot");
  if (duration.value === null) return null;
  const end = new Date(start);
  if (duration.unit === "month") {
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + duration.value);
    const last = new Date(end);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    end.setUTCDate(Math.min(day, last.getUTCDate()));
  } else end.setUTCDate(end.getUTCDate() + duration.value * (duration.unit === "week" ? 7 : 1));
  if (!Number.isFinite(end.getTime())) throw new Error("Duration outside supported date range");
  return end;
}
export function parseLifecycleDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value), day = new Date(value.slice(0, 10));
  return Number.isFinite(date.getTime()) && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10) ? date : null;
}

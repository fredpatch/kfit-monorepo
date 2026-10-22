/**
 * Business time (decision Fred 2026-10-22): « aujourd'hui », « cette semaine » (Monday start) and appointment
 * times follow Africa/Libreville, whatever the server or browser time zone. Pure Intl — no dependency.
 */
export const businessTimeZone = "Africa/Libreville";
const dayMs = 86_400_000;

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: businessTimeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Offset (ms) of the business time zone at this instant: local wall time − UTC. */
export function businessOffsetMs(date: Date): number {
  const parts = formatter.formatToParts(date);
  const v = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return wallAsUtc - (date.getTime() - date.getUTCMilliseconds());
}

/** "YYYY-MM-DD" of the business day containing this instant. */
export function businessDateKey(date: Date): string {
  return new Date(date.getTime() + businessOffsetMs(date)).toISOString().slice(0, 10);
}

/** Instant at which the business day containing `date` starts. */
export function startOfBusinessDay(date: Date): Date {
  const key = businessDateKey(date);
  const guess = new Date(`${key}T00:00:00.000Z`);
  return new Date(guess.getTime() - businessOffsetMs(guess));
}

/** Instant at which a "YYYY-MM-DD" business day starts; null when the key is invalid. */
export function businessDayStartFromKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const guess = new Date(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(guess.getTime()) || guess.toISOString().slice(0, 10) !== key) return null;
  return new Date(guess.getTime() - businessOffsetMs(guess));
}

/** Monday 00:00 (business time) of the week containing `date`. */
export function startOfBusinessWeek(date: Date): Date {
  const dayStart = startOfBusinessDay(date);
  const weekday = new Date(`${businessDateKey(date)}T12:00:00.000Z`).getUTCDay(); // 0 = Sunday
  return startOfBusinessDay(new Date(dayStart.getTime() - ((weekday + 6) % 7) * dayMs + dayMs / 2));
}

export function addBusinessDays(dayStart: Date, days: number): Date {
  return startOfBusinessDay(new Date(dayStart.getTime() + days * dayMs + dayMs / 2));
}

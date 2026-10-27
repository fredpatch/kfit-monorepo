import {
  businessDateKey,
  businessOffsetMs,
  businessTimeZone,
} from "@kfit/shared";

/** French display helpers. Dates show in business time, Africa/Libreville (decision 2026-10-22), whatever the device time zone. */
const tz = { timeZone: businessTimeZone } as const;

export function dateFr(iso: string | null | undefined, fallback = "-"): string {
  return iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        ...tz,
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : fallback;
}

export function shortDateFr(
  iso: string | null | undefined,
  fallback = "-",
): string {
  return iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        ...tz,
        day: "numeric",
        month: "short",
      })
    : fallback;
}

export function dateTimeFr(
  iso: string | null | undefined,
  fallback = "-",
): string {
  return iso
    ? new Date(iso).toLocaleString("fr-FR", {
        ...tz,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : fallback;
}

export function timeFr(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    ...tz,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function numberFr(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined
    ? "-"
    : value.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

export function moneyXaf(value: number): string {
  return `${value.toLocaleString("fr-FR")} XAF`;
}

/** "il y a 3 j", "aujourd'hui", "dans 2 j". */
export function relativeDaysFr(
  iso: string | null | undefined,
  now = Date.now(),
): string {
  if (!iso) return "-";
  const days = Math.round((new Date(iso).getTime() - now) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === -1) return "hier";
  if (days === 1) return "demain";
  return days < 0 ? `il y a ${-days} j` : `dans ${days} j`;
}

/** Value for <input type="datetime-local"> from a Date, as business wall time (Africa/Libreville). */
export function toLocalInput(date: Date): string {
  return new Date(date.getTime() + businessOffsetMs(date))
    .toISOString()
    .slice(0, 16);
}

/** ISO string from a datetime-local value read as business wall time; null when empty or invalid. */
export function fromLocalInput(
  value: string | undefined | null,
): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const wall = new Date(`${value.slice(0, 16)}:00.000Z`);
  if (!Number.isFinite(wall.getTime())) return null;
  return new Date(wall.getTime() - businessOffsetMs(wall)).toISOString();
}

/** "YYYY-MM-DD" business day of an instant (for <input type="date"> defaults and day grouping). */
export const businessDay = (date: Date) => businessDateKey(date);

/** "lundi 22 octobre" in business time. */
export function longDayFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    ...tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

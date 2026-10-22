/** French display helpers. Dates show in the device time zone (pending the time-zone decision in the backlog). */

export function dateFr(iso: string | null | undefined, fallback = "—"): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : fallback;
}

export function shortDateFr(iso: string | null | undefined, fallback = "—"): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : fallback;
}

export function dateTimeFr(iso: string | null | undefined, fallback = "—"): string {
  return iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : fallback;
}

export function timeFr(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function numberFr(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

export function moneyXaf(value: number): string {
  return `${value.toLocaleString("fr-FR")} XAF`;
}

/** "il y a 3 j", "aujourd'hui", "dans 2 j". */
export function relativeDaysFr(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const days = Math.round((new Date(iso).getTime() - now) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === -1) return "hier";
  if (days === 1) return "demain";
  return days < 0 ? `il y a ${-days} j` : `dans ${days} j`;
}

/** Value for <input type="datetime-local"> from a Date, in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** ISO string from a datetime-local value; null when empty or invalid. */
export function fromLocalInput(value: string | undefined | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

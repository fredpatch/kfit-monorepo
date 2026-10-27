import { businessDateKey } from "@kfit/shared";
import { parseBundleName } from "./backup-manifest.js";

/** S7.4 D7 / S7.4b B5: retention on the Africa/Libreville calendar (businessDateKey). */
export const RETAIN_DAILY_BUNDLES = 7;
export const RETAIN_WEEKLY_BUNDLES = 4;

/** A directory entry seen in BACKUP_DIR; `manifestValid` = manifest parsed and MAC verified with the current key. */
export type RotationEntry = { name: string; manifestValid: boolean };

/** ISO 8601 week (`2026-W44`) of a `YYYY-MM-DD` calendar date. */
export function isoWeekKey(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00Z`);
  const thursday = new Date(
    day.getTime() + (3 - ((day.getUTCDay() + 6) % 7)) * 86_400_000,
  );
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(
    ((thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Latest bundle of each period, for the `limit` most recent periods that hold a bundle. */
function latestPerPeriod(
  bundles: Array<{ name: string; at: Date }>,
  period: (at: Date) => string,
  limit: number,
): string[] {
  const latest = new Map<string, { name: string; at: Date }>();
  for (const bundle of bundles) {
    const key = period(bundle.at),
      current = latest.get(key);
    if (!current || bundle.at > current.at) latest.set(key, bundle);
  }
  return [...latest.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit)
    .map(([, bundle]) => bundle.name);
}

/**
 * B5: keeps the latest bundle of each of the 7 most recent days and of the 4 most recent ISO weeks. The newest bundle is
 * always the latest of the most recent day, so the one just written is never deleted. Entries that are not well-formed
 * bundles with a valid manifest appear in neither list (never deleted). Bundles dated after `now` (clock skew) are kept.
 */
export function planRotation(
  entries: RotationEntry[],
  now: Date,
): { keep: string[]; delete: string[] } {
  const bundles = entries.flatMap((entry) => {
    const at = entry.manifestValid ? parseBundleName(entry.name) : null;
    return at ? [{ name: entry.name, at }] : [];
  });
  const past = bundles.filter((bundle) => bundle.at <= now);
  const keep = new Set([
    ...bundles.filter((bundle) => bundle.at > now).map((bundle) => bundle.name),
    ...latestPerPeriod(past, businessDateKey, RETAIN_DAILY_BUNDLES),
    ...latestPerPeriod(
      past,
      (at) => isoWeekKey(businessDateKey(at)),
      RETAIN_WEEKLY_BUNDLES,
    ),
  ]);
  return {
    keep: [...keep].sort(),
    delete: bundles
      .map((bundle) => bundle.name)
      .filter((name) => !keep.has(name))
      .sort(),
  };
}

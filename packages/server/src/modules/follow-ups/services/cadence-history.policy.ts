import type { CadenceSource } from "@kfit/shared";
import { InvalidCadenceError, validCadence } from "./follow-up-cadence.policy.js";

export type CadenceHistoryInterval = {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  effectiveFrequencyDays: number | null;
  source: string;
};

/** Half-open authority intervals. Missing evidence must never use live policy. */
export function historicalCadence(rows: readonly CadenceHistoryInterval[], at: Date): { days: number | null; source: CadenceSource } | null {
  if (!Number.isFinite(at.getTime())) throw new InvalidCadenceError("Invalid historical instant");
  const matches = rows.filter(row => row.effectiveFrom <= at && (row.effectiveTo === null || at < row.effectiveTo));
  if (matches.length > 1) throw new InvalidCadenceError("Overlapping cadence authority");
  const row = matches[0];
  if (!row) return null;
  if (row.source === "none" && row.effectiveFrequencyDays === null) return { days: null, source: "none" };
  if ((row.source === "override" || row.source === "variant" || row.source === "service") && validCadence(row.effectiveFrequencyDays)) {
    return { days: row.effectiveFrequencyDays, source: row.source };
  }
  throw new InvalidCadenceError("Invalid historical cadence evidence");
}

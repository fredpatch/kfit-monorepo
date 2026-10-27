import type {
  CoachingGoal,
  GoalAction,
  GoalMetricKey,
  ProgressMetric,
} from "@kfit/shared";

/** Labels and units for body measurements - same wording as the former progress panel. */
export const metricMeta: Record<
  ProgressMetric,
  { label: string; short: string; unit: string; max: number }
> = {
  weightKg: { label: "Poids", short: "Poids", unit: "kg", max: 1000 },
  waistCm: { label: "Tour de taille", short: "Taille", unit: "cm", max: 1000 },
  hipsCm: { label: "Tour de hanches", short: "Hanches", unit: "cm", max: 1000 },
  chestCm: {
    label: "Tour de poitrine",
    short: "Poitrine",
    unit: "cm",
    max: 1000,
  },
  bodyFatEstimate: {
    label: "Masse grasse estimée",
    short: "Masse grasse",
    unit: "%",
    max: 100,
  },
};

export const goalMetricToProgress: Record<GoalMetricKey, ProgressMetric> = {
  weight_kg: "weightKg",
  waist_cm: "waistCm",
  hips_cm: "hipsCm",
  chest_cm: "chestCm",
  body_fat_estimate: "bodyFatEstimate",
};

export const goalActionLabels: Record<GoalAction, string> = {
  pause: "Mettre l'objectif en pause",
  resume: "Reprendre l'objectif",
  cancel: "Annuler l'objectif",
  "confirm-outcome": "Confirmer le résultat",
};

export const goalEventLabels: Record<string, string> = {
  "goal.created": "Objectif créé",
  "goal.paused": "Objectif mis en pause",
  "goal.resumed": "Objectif repris",
  "goal.cancelled": "Objectif annulé",
  "goal.outcome_confirmed": "Résultat confirmé par la coach",
};

/** Share of the way from baseline to target (0–1), from the latest matching measurement. Display only. */
export function goalProgress(goal: CoachingGoal): number | null {
  const { baselineValue: base, targetValue: target } = goal;
  const latest = goal.latestMatchingMetric?.value;
  if (
    base === null ||
    target === null ||
    latest === undefined ||
    base === target
  )
    return null;
  return Math.min(1, Math.max(0, (latest - base) / (target - base)));
}

/** At most two decimals (server rule PROGRESS_INVALID_INPUT / GOAL_TARGET_INVALID). */
export function hasTwoDecimalsMax(value: string): boolean {
  return /^\d+([.,]\d{1,2})?$/.test(value.trim());
}

export function parseDecimal(value: string): number {
  return Number(value.trim().replace(",", "."));
}

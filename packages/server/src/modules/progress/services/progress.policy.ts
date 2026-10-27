import {
  type GoalMetricKey,
  type GoalOutcome,
  type GoalStatus,
  type GoalAction,
  type ProgressMetric,
} from "@kfit/shared";

export const metricFields: Record<GoalMetricKey, ProgressMetric> = {
  weight_kg: "weightKg",
  waist_cm: "waistCm",
  hips_cm: "hipsCm",
  chest_cm: "chestCm",
  body_fat_estimate: "bodyFatEstimate",
};
// Storage precision and defensive input limits, without medical interpretation.
export function validMetric(
  value: unknown,
  metric: ProgressMetric,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= (metric === "bodyFatEstimate" ? 100 : 1000) &&
    Number(value.toFixed(2)) === value
  );
}
export function suggestGoal(
  input: {
    metricKey: GoalMetricKey | null;
    baselineValue: number | null;
    targetValue: number | null;
    targetDate: Date | null;
    latestValue: number | null;
  },
  now: Date,
): GoalOutcome | null {
  const {
    metricKey,
    baselineValue: baseline,
    targetValue: target,
    targetDate,
    latestValue: latest,
  } = input;
  if (
    !metricKey ||
    baseline === null ||
    target === null ||
    latest === null ||
    baseline === target
  )
    return null;
  const direction = target > baseline ? 1 : -1;
  if ((latest - target) * direction >= 0) return "achieved";
  if (!targetDate || now <= targetDate) return null;
  return (latest - baseline) * direction > 0
    ? "partially_achieved"
    : "not_achieved";
}
export function goalCommands(status: GoalStatus): GoalAction[] {
  return status === "active"
    ? ["pause", "cancel", "confirm-outcome"]
    : status === "paused"
      ? ["resume", "cancel"]
      : [];
}

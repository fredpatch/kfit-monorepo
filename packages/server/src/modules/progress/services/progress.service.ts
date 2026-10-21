import { goalMetricKeys, goalOutcomes, progressMetrics, type GoalMetricKey, type GoalOutcome, type ProgressValues,
  type ProgressErrorCode, type ProgressResponse, type GoalsResponse } from "@kfit/shared";
import { parseLifecycleDate } from "../../subscriptions/services/subscription-lifecycle.policy.js";
import { metricFields, validMetric } from "./progress.policy.js";

export type ProgressActor = { userId: string; requestId: string; ipAddress: string | null; userAgent: string | null };
export type MeasurementCommand = { action: "measurement"; measuredAt: Date; values: ProgressValues; feelingNote: string | null };
export type CreateGoalCommand = { action: "create-goal"; category: string; label: string; metricKey: GoalMetricKey | null;
  baselineValue: number | null; targetValue: number | null; unit: string | null; targetDate: Date | null };
export type ProgressCommand = { action: "progress" } | { action: "goals" } | MeasurementCommand | CreateGoalCommand
  | { action: "pause"; reason: string | null } | { action: "resume"; reason: string | null } | { action: "cancel"; reason: string | null }
  | { action: "confirm-outcome"; outcome: GoalOutcome; reason: string | null };
export type ProgressResult = { ok: true; body: ProgressResponse | GoalsResponse } | { ok: false; error: ProgressErrorCode };
export const progressFailure = (error: ProgressErrorCode): ProgressResult => ({ ok: false, error });
export interface ProgressRepository { execute(id: string, command: ProgressCommand, actor: ProgressActor): Promise<ProgressResult> }
const fields: Record<ProgressCommand["action"], readonly string[]> = { progress: [], goals: [], measurement: ["measuredAt", ...progressMetrics, "feelingNote"],
  "create-goal": ["category", "label", "metricKey", "baselineValue", "targetValue", "unit", "targetDate"], pause: ["reason"], resume: ["reason"], cancel: ["reason"], "confirm-outcome": ["outcome", "reason"] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number): string | null | undefined => value === undefined || value === null ? null : typeof value === "string" && value.length <= max ? value.trim() || null : undefined;
export class ProgressService {
  constructor(private readonly repository: ProgressRepository) {}
  async execute(id: string, action: ProgressCommand["action"], body: unknown, actor: ProgressActor): Promise<ProgressResult> {
    const invalid = action === "measurement" || action === "progress" ? "PROGRESS_INVALID_INPUT" : "GOAL_INVALID_INPUT";
    if (!uuid.test(id) || !body || typeof body !== "object" || Array.isArray(body)) return progressFailure(invalid);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !fields[action].includes(key))) return progressFailure(invalid);
    let command: ProgressCommand;
    if (action === "measurement") {
      const measuredAt = parseLifecycleDate(input.measuredAt), feelingNote = text(input.feelingNote, 4000);
      if (!measuredAt || feelingNote === undefined) return progressFailure(invalid);
      const values: ProgressValues = { weightKg: null, waistCm: null, hipsCm: null, chestCm: null, bodyFatEstimate: null };
      for (const key of progressMetrics) {
        const value = input[key];
        if (value !== undefined && value !== null) { if (!validMetric(value, key)) return progressFailure(invalid); values[key] = value; }
      }
      if (progressMetrics.every(key => values[key] === null)) return progressFailure(invalid);
      command = { action, measuredAt, feelingNote, values };
    } else if (action === "create-goal") {
      const category = text(input.category, 100), label = text(input.label, 500), unit = text(input.unit, 30);
      if (!category || !label || unit === undefined) return progressFailure(invalid);
      const metricKey = input.metricKey === undefined || input.metricKey === null ? null : goalMetricKeys.find(key => key === input.metricKey);
      if (metricKey === undefined) return progressFailure("GOAL_METRIC_INVALID");
      const baselineValue = input.baselineValue ?? null, targetValue = input.targetValue ?? null;
      const supplied = [baselineValue !== null, targetValue !== null, unit !== null];
      if (supplied.some(Boolean) && !supplied.every(Boolean) || metricKey && !supplied.every(Boolean)) return progressFailure("GOAL_NUMERIC_FIELDS_INCOMPLETE");
      for (const value of [baselineValue, targetValue]) {
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000 || Number(value.toFixed(2)) !== value)) return progressFailure("GOAL_TARGET_INVALID");
        if (metricKey && !validMetric(value, metricFields[metricKey])) return progressFailure("GOAL_TARGET_INVALID");
      }
      if (metricKey && baselineValue === targetValue) return progressFailure("GOAL_TARGET_INVALID");
      const targetDate = input.targetDate === undefined || input.targetDate === null ? null : parseLifecycleDate(input.targetDate);
      if (input.targetDate !== undefined && input.targetDate !== null && !targetDate) return progressFailure("GOAL_TARGET_DATE_INVALID");
      // Narrow after validating the unknown numeric inputs above.
      if (baselineValue !== null && typeof baselineValue !== "number" || targetValue !== null && typeof targetValue !== "number") return progressFailure("GOAL_TARGET_INVALID");
      command = { action, category, label, metricKey, baselineValue, targetValue, unit, targetDate };
    } else if (action === "progress" || action === "goals") command = { action };
    else {
      const reason = text(input.reason, 2000);
      if (reason === undefined) return progressFailure(invalid);
      if (action === "cancel" && !reason) return progressFailure("GOAL_OUTCOME_REASON_REQUIRED");
      if (action === "confirm-outcome") {
        const outcome = goalOutcomes.find(outcome => outcome === input.outcome);
        if (!outcome) return progressFailure(invalid);
        command = { action, outcome, reason };
      } else command = { action, reason };
    }
    return this.repository.execute(id, command, actor);
  }
}

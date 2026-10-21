export const progressMetrics = ["weightKg", "waistCm", "hipsCm", "chestCm", "bodyFatEstimate"] as const;
export type ProgressMetric = (typeof progressMetrics)[number];
export const goalMetricKeys = ["weight_kg", "waist_cm", "hips_cm", "chest_cm", "body_fat_estimate"] as const;
export type GoalMetricKey = (typeof goalMetricKeys)[number];
export const goalOutcomes = ["achieved", "partially_achieved", "not_achieved"] as const;
export type GoalOutcome = (typeof goalOutcomes)[number];
export type GoalStatus = "active" | "paused" | GoalOutcome | "cancelled";
export type GoalAction = "pause" | "resume" | "cancel" | "confirm-outcome";
export const progressApiRoutes = {
  progress: "/admin/subscriptions/:subscriptionId/progress",
  measurements: "/admin/subscriptions/:subscriptionId/progress-measurements",
  goals: "/admin/subscriptions/:subscriptionId/goals",
  pause: "/admin/goals/:goalId/pause", resume: "/admin/goals/:goalId/resume",
  cancel: "/admin/goals/:goalId/cancel", confirmOutcome: "/admin/goals/:goalId/confirm-outcome",
} as const;
export const progressErrorCodes = ["PROGRESS_INVALID_INPUT", "PROGRESS_SUBSCRIPTION_NOT_ELIGIBLE", "PROGRESS_HEALTH_CONSENT_REQUIRED",
  "PROGRESS_MEASUREMENT_DUPLICATE", "PROGRESS_MEASUREMENT_NOT_FOUND", "GOAL_NOT_FOUND", "GOAL_INVALID_INPUT", "GOAL_SUBSCRIPTION_NOT_ELIGIBLE",
  "GOAL_METRIC_INVALID", "GOAL_NUMERIC_FIELDS_INCOMPLETE", "GOAL_TARGET_INVALID", "GOAL_TARGET_DATE_INVALID", "GOAL_TRANSITION_INVALID",
  "GOAL_OUTCOME_REASON_REQUIRED", "PROGRESS_ADMIN_FORBIDDEN", "PROGRESS_ROUTE_UNEXPECTED_FAILURE"] as const;
export type ProgressErrorCode = (typeof progressErrorCodes)[number];
export type ProgressValues = Record<ProgressMetric, number | null>;
export type CreateMeasurementInput = Partial<ProgressValues> & { measuredAt: string; feelingNote?: string | null };
export type ProgressMeasurement = ProgressValues & { id: string; measuredAt: string; createdAt: string; feelingNote: string | null };
export type MetricObservation = { value: number; measuredAt: string; measurementId: string };
export type ProgressDetail = { subscriptionId: string; subscriptionStatus: string; asOf: string; canRecord: boolean;
  measurements: ProgressMeasurement[]; latestMeasurement: ProgressMeasurement | null;
  metrics: Record<ProgressMetric, { latest: MetricObservation | null; previous: MetricObservation | null; delta: number | null }> };
export type CreateGoalInput = { category: string; label: string; metricKey?: GoalMetricKey | null; baselineValue?: number | null;
  targetValue?: number | null; unit?: string | null; targetDate?: string | null };
export type GoalCommandInput = { reason?: string | null };
export type ConfirmGoalOutcomeInput = GoalCommandInput & { outcome: GoalOutcome };
export type GoalEvent = { id: string; eventType: string; fromStatus: GoalStatus | null; toStatus: GoalStatus | null;
  suggestedStatusSnapshot: GoalOutcome | null; actorUserId: string | null; reason: string | null; createdAt: string };
export type CoachingGoal = { id: string; category: string; label: string; metricKey: GoalMetricKey | null; baselineValue: number | null;
  targetValue: number | null; unit: string | null; targetDate: string | null; status: GoalStatus; suggestedStatus: GoalOutcome | null;
  latestMatchingMetric: MetricObservation | null; coachConfirmedAt: string | null; createdAt: string; events: GoalEvent[]; availableCommands: GoalAction[] };
export type GoalsDetail = { subscriptionId: string; subscriptionStatus: string; asOf: string; canCreate: boolean; goals: CoachingGoal[] };
export type ProgressResponse = { progress: ProgressDetail };
export type GoalsResponse = { goals: GoalsDetail };

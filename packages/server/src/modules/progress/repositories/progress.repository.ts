import { assertCustomerWritable } from "../../privacy/repositories/subject-freeze.js";
import { and, eq, inArray, lte } from "drizzle-orm";
import {
  goalMetricKeys,
  goalOutcomes,
  progressMetrics,
  type CoachingGoal,
  type GoalMetricKey,
  type GoalOutcome,
  type GoalStatus,
  type MetricObservation,
  type ProgressMeasurement,
  type ProgressMetric,
  type ProgressDetail,
  type GoalsDetail,
} from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import {
  goals,
  goalEvents,
  progressMeasurements,
} from "../../../db/schema/coaching.js";
import { subscriptions } from "../../../db/schema/customers.js";
import { consentRecords } from "../../../db/schema/onboarding.js";
import {
  AuditService,
  type AuditMetadata,
} from "../../auth/services/audit.service.js";
import {
  lockConsentDefinitions,
  readConsentEvidence,
} from "../../consents/repositories/consent.repository.js";
import { latestDefinitions } from "../../consents/services/consent.service.js";
import {
  goalCommands,
  metricFields,
  suggestGoal,
} from "../services/progress.policy.js";
import {
  progressFailure,
  type ProgressActor,
  type ProgressCommand,
  type ProgressRepository,
  type ProgressResult,
} from "../services/progress.service.js";

type Database = typeof appDb;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Subscription = typeof subscriptions.$inferSelect;
type Goal = typeof goals.$inferSelect;
function status(value: string): GoalStatus {
  if (
    value === "active" ||
    value === "paused" ||
    value === "cancelled" ||
    goalOutcomes.some((s) => s === value)
  )
    return value as GoalStatus;
  throw new Error("Invalid goal state");
}
function outcome(value: string | null): GoalOutcome | null {
  if (value === null) return null;
  const valid = goalOutcomes.find((s) => s === value);
  if (!valid) throw new Error("Invalid goal suggestion");
  return valid;
}
function metricKey(value: string | null): GoalMetricKey | null {
  if (value === null) return null;
  const valid = goalMetricKeys.find((key) => key === value);
  if (!valid) throw new Error("Invalid goal metric");
  return valid;
}
const eligible = (sub: Subscription) =>
  sub.status === "active" || sub.status === "paused";
export class DrizzleProgressRepository implements ProgressRepository {
  constructor(
    private readonly database: Database,
    private readonly options: { auditHashPepper: string },
    private readonly clock: () => Date = () => new Date(),
  ) {}
  private async measurements(
    tx: Tx,
    subscriptionId: string,
    now: Date,
  ): Promise<ProgressMeasurement[]> {
    const rows = await tx
      .select()
      .from(progressMeasurements)
      .where(
        and(
          eq(progressMeasurements.subscriptionId, subscriptionId),
          lte(progressMeasurements.measuredAt, now),
        ),
      )
      .orderBy(
        progressMeasurements.measuredAt,
        progressMeasurements.createdAt,
        progressMeasurements.id,
      );
    return rows.map((row) => ({
      id: row.id,
      measuredAt: row.measuredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      feelingNote: row.feelingNote,
      weightKg: row.weightKg === null ? null : Number(row.weightKg),
      waistCm: row.waistCm === null ? null : Number(row.waistCm),
      hipsCm: row.hipsCm === null ? null : Number(row.hipsCm),
      chestCm: row.chestCm === null ? null : Number(row.chestCm),
      bodyFatEstimate:
        row.bodyFatEstimate === null ? null : Number(row.bodyFatEstimate),
    }));
  }
  private latest(
    rows: ProgressMeasurement[],
    key: ProgressMetric,
  ): MetricObservation | null {
    const row = [...rows].reverse().find((row) => row[key] !== null);
    return row && row[key] !== null
      ? { measurementId: row.id, value: row[key], measuredAt: row.measuredAt }
      : null;
  }
  private suggestion(
    goal: Goal,
    rows: ProgressMeasurement[],
    now: Date,
  ): GoalOutcome | null {
    const key = metricKey(goal.metricKey);
    return suggestGoal(
      {
        metricKey: key,
        baselineValue:
          goal.baselineValue === null ? null : Number(goal.baselineValue),
        targetValue:
          goal.targetValue === null ? null : Number(goal.targetValue),
        targetDate: goal.targetDate,
        latestValue: key
          ? (this.latest(rows, metricFields[key])?.value ?? null)
          : null,
      },
      now,
    );
  }
  private async healthGranted(tx: Tx, sub: Subscription): Promise<boolean> {
    const evidence = await readConsentEvidence(tx, sub.id);
    const definition = latestDefinitions(evidence.definitions).find(
      (d) => d.consentType === "health_data",
    );
    const current = evidence.current?.find(
      (c) => c.consentType === "health_data",
    );
    if (
      !definition ||
      current?.decision !== "granted" ||
      current.consentDefinitionId !== definition.id
    )
      return false;
    const [record] = await tx
      .select({ id: consentRecords.id })
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.id, current.id),
          eq(consentRecords.customerId, sub.customerId),
        ),
      );
    return Boolean(record);
  }
  private async progress(
    tx: Tx,
    sub: Subscription,
    now: Date,
  ): Promise<ProgressDetail> {
    const rows = await this.measurements(tx, sub.id, now);
    const summary = (key: ProgressMetric) => {
      const matching = rows.filter((row) => row[key] !== null),
        latest = this.latest(matching, key),
        previous = this.latest(matching.slice(0, -1), key);
      return {
        latest,
        previous,
        delta:
          latest && previous
            ? Math.round(latest.value * 100 - previous.value * 100) / 100
            : null,
      };
    };
    return {
      subscriptionId: sub.id,
      subscriptionStatus: sub.status,
      asOf: now.toISOString(),
      canRecord: eligible(sub) && (await this.healthGranted(tx, sub)),
      measurements: rows,
      latestMeasurement: rows.at(-1) ?? null,
      metrics: {
        weightKg: summary("weightKg"),
        waistCm: summary("waistCm"),
        hipsCm: summary("hipsCm"),
        chestCm: summary("chestCm"),
        bodyFatEstimate: summary("bodyFatEstimate"),
      },
    };
  }
  private async goalsDetail(
    tx: Tx,
    sub: Subscription,
    now: Date,
  ): Promise<GoalsDetail> {
    const rows = await tx
      .select()
      .from(goals)
      .where(eq(goals.subscriptionId, sub.id))
      .orderBy(goals.createdAt, goals.id);
    const history = await tx
      .select({ event: goalEvents })
      .from(goalEvents)
      .innerJoin(goals, eq(goals.id, goalEvents.goalId))
      .where(eq(goals.subscriptionId, sub.id))
      .orderBy(goalEvents.createdAt, goalEvents.id);
    const measurements = await this.measurements(tx, sub.id, now);
    const dto: CoachingGoal[] = rows.map((row) => {
      const key = metricKey(row.metricKey),
        currentStatus = status(row.status),
        commands = goalCommands(currentStatus);
      return {
        id: row.id,
        category: row.category,
        label: row.label,
        metricKey: key,
        baselineValue:
          row.baselineValue === null ? null : Number(row.baselineValue),
        targetValue: row.targetValue === null ? null : Number(row.targetValue),
        unit: row.unit,
        targetDate: row.targetDate?.toISOString() ?? null,
        status: currentStatus,
        suggestedStatus: commands.length
          ? this.suggestion(row, measurements, now)
          : outcome(row.suggestedStatus),
        latestMatchingMetric: key
          ? this.latest(measurements, metricFields[key])
          : null,
        coachConfirmedAt: row.coachConfirmedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        availableCommands: commands,
        events: history
          .filter(({ event }) => event.goalId === row.id)
          .map(({ event }) => ({
            id: event.id,
            eventType: event.eventType,
            fromStatus:
              event.fromStatus === null ? null : status(event.fromStatus),
            toStatus: event.toStatus === null ? null : status(event.toStatus),
            suggestedStatusSnapshot: outcome(event.suggestedStatusSnapshot),
            actorUserId: event.actorUserId,
            reason: event.reason,
            createdAt: event.createdAt.toISOString(),
          })),
      };
    });
    return {
      subscriptionId: sub.id,
      subscriptionStatus: sub.status,
      canCreate: eligible(sub),
      asOf: now.toISOString(),
      goals: dto,
    };
  }
  private async audit(
    tx: Tx,
    actor: ProgressActor,
    entityType: string,
    entityId: string,
    eventType: string,
    metadata: AuditMetadata,
  ) {
    await new AuditService(tx, this.options).record({
      actorType: "user",
      actorUserId: actor.userId,
      eventType,
      entityType,
      entityId,
      result: "success",
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata,
    });
  }
  async execute(
    id: string,
    command: ProgressCommand,
    actor: ProgressActor,
  ): Promise<ProgressResult> {
    if (command.action === "progress" || command.action === "goals") {
      return this.database.transaction(
        async (tx) => {
          const [sub] = await tx
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, id));
          if (!sub)
            return progressFailure(
              command.action === "progress"
                ? "PROGRESS_MEASUREMENT_NOT_FOUND"
                : "GOAL_NOT_FOUND",
            );
          const now = this.clock();
          return command.action === "progress"
            ? {
                ok: true,
                body: { progress: await this.progress(tx, sub, now) },
              }
            : {
                ok: true,
                body: { goals: await this.goalsDetail(tx, sub, now) },
              };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    }
    return this.database.transaction(async (tx) => {
      const goalCommand =
        command.action !== "measurement" && command.action !== "create-goal";
      const initial = goalCommand
        ? (
            await tx
              .select({ subscriptionId: goals.subscriptionId })
              .from(goals)
              .where(eq(goals.id, id))
          )[0]
        : null;
      if (goalCommand && !initial) return progressFailure("GOAL_NOT_FOUND");
      const subscriptionId = initial?.subscriptionId ?? id;
      await assertCustomerWritable(tx, { subscriptionId });
      // Parent first in every command: compatible with consent/lifecycle writers and measurement goal refresh.
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId))
        .for("update");
      if (!sub)
        return progressFailure(
          command.action === "measurement"
            ? "PROGRESS_MEASUREMENT_NOT_FOUND"
            : "GOAL_NOT_FOUND",
        );
      if (command.action === "measurement") {
        if (!eligible(sub))
          return progressFailure("PROGRESS_SUBSCRIPTION_NOT_ELIGIBLE");
        await lockConsentDefinitions(tx);
        if (!(await this.healthGranted(tx, sub)))
          return progressFailure("PROGRESS_HEALTH_CONSENT_REQUIRED");
        const now = this.clock();
        if (command.measuredAt > now)
          return progressFailure("PROGRESS_INVALID_INPUT");
        const atTime = await tx
          .select()
          .from(progressMeasurements)
          .where(
            and(
              eq(progressMeasurements.subscriptionId, sub.id),
              eq(progressMeasurements.measuredAt, command.measuredAt),
            ),
          );
        if (
          atTime.some(
            (row) =>
              progressMetrics.every((key) =>
                row[key] === null
                  ? command.values[key] === null
                  : Number(row[key]) === command.values[key],
              ) && (row.feelingNote?.trim() || null) === command.feelingNote,
          )
        )
          return progressFailure("PROGRESS_MEASUREMENT_DUPLICATE");
        const values = command.values;
        const [created] = await tx
          .insert(progressMeasurements)
          .values({
            subscriptionId: sub.id,
            measuredAt: command.measuredAt,
            createdAt: now,
            feelingNote: command.feelingNote,
            createdByUserId: actor.userId,
            weightKg: values.weightKg?.toFixed(2) ?? null,
            waistCm: values.waistCm?.toFixed(2) ?? null,
            hipsCm: values.hipsCm?.toFixed(2) ?? null,
            chestCm: values.chestCm?.toFixed(2) ?? null,
            bodyFatEstimate: values.bodyFatEstimate?.toFixed(2) ?? null,
          })
          .returning();
        if (!created)
          throw new Error("Measurement insert did not return a row");
        const suppliedKeys = goalMetricKeys.filter(
          (key) => values[metricFields[key]] !== null,
        );
        const affected = await tx
          .select()
          .from(goals)
          .where(
            and(
              eq(goals.subscriptionId, sub.id),
              inArray(goals.status, ["active", "paused"]),
              inArray(goals.metricKey, suppliedKeys),
            ),
          )
          .orderBy(goals.id)
          .for("update");
        const rows = await this.measurements(tx, sub.id, now);
        for (const goal of affected)
          await tx
            .update(goals)
            .set({
              suggestedStatus: this.suggestion(goal, rows, now),
              updatedAt: now,
            })
            .where(eq(goals.id, goal.id));
        await this.audit(
          tx,
          actor,
          "progress_measurement",
          created.id,
          "progress.measurement_recorded",
          {
            subscriptionId: sub.id,
            measurementId: created.id,
            metricKeys: suppliedKeys,
            measuredAt: command.measuredAt.toISOString(),
          },
        );
        return {
          ok: true,
          body: { progress: await this.progress(tx, sub, now) },
        };
      }
      if (command.action === "create-goal") {
        if (!eligible(sub))
          return progressFailure("GOAL_SUBSCRIPTION_NOT_ELIGIBLE");
        const now = this.clock();
        if (command.targetDate && command.targetDate <= now)
          return progressFailure("GOAL_TARGET_DATE_INVALID");
        const [goal] = await tx
          .insert(goals)
          .values({
            subscriptionId: sub.id,
            category: command.category,
            label: command.label,
            metricKey: command.metricKey,
            baselineValue: command.baselineValue?.toFixed(2) ?? null,
            targetValue: command.targetValue?.toFixed(2) ?? null,
            unit: command.unit,
            targetDate: command.targetDate,
            status: "active",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!goal) throw new Error("Goal insert did not return a row");
        const suggestion = this.suggestion(
          goal,
          await this.measurements(tx, sub.id, now),
          now,
        );
        await tx
          .update(goals)
          .set({ suggestedStatus: suggestion })
          .where(eq(goals.id, goal.id));
        await tx.insert(goalEvents).values({
          goalId: goal.id,
          eventType: "goal.created",
          fromStatus: null,
          toStatus: "active",
          suggestedStatusSnapshot: suggestion,
          actorUserId: actor.userId,
          createdAt: now,
        });
        await this.audit(tx, actor, "goal", goal.id, "goal.created", {
          subscriptionId: sub.id,
          goalId: goal.id,
          metricKey: goal.metricKey,
          toStatus: "active",
          suggestedStatus: suggestion,
        });
        return {
          ok: true,
          body: { goals: await this.goalsDetail(tx, sub, now) },
        };
      }
      const [goal] = await tx
        .select()
        .from(goals)
        .where(and(eq(goals.id, id), eq(goals.subscriptionId, sub.id)))
        .for("update");
      if (!goal) return progressFailure("GOAL_NOT_FOUND");
      if (!goalCommands(status(goal.status)).includes(command.action))
        return progressFailure("GOAL_TRANSITION_INVALID");
      const now = this.clock(),
        suggestion = this.suggestion(
          goal,
          await this.measurements(tx, sub.id, now),
          now,
        );
      if (
        (command.action === "cancel" ||
          (command.action === "confirm-outcome" &&
            command.outcome !== suggestion)) &&
        !command.reason
      )
        return progressFailure("GOAL_OUTCOME_REASON_REQUIRED");
      const toStatus: GoalStatus =
        command.action === "pause"
          ? "paused"
          : command.action === "resume"
            ? "active"
            : command.action === "cancel"
              ? "cancelled"
              : command.outcome;
      const eventType =
        command.action === "confirm-outcome"
          ? "goal.outcome_confirmed"
          : command.action === "pause"
            ? "goal.paused"
            : command.action === "resume"
              ? "goal.resumed"
              : "goal.cancelled";
      await tx
        .update(goals)
        .set({
          status: toStatus,
          suggestedStatus: suggestion,
          updatedAt: now,
          ...(command.action === "confirm-outcome"
            ? { coachConfirmedAt: now }
            : {}),
        })
        .where(eq(goals.id, goal.id));
      await tx.insert(goalEvents).values({
        goalId: goal.id,
        eventType,
        fromStatus: goal.status,
        toStatus,
        suggestedStatusSnapshot: suggestion,
        actorUserId: actor.userId,
        reason: command.reason,
        createdAt: now,
      });
      await this.audit(tx, actor, "goal", goal.id, eventType, {
        subscriptionId: sub.id,
        goalId: goal.id,
        metricKey: goal.metricKey,
        fromStatus: goal.status,
        toStatus,
        suggestedStatus: suggestion,
        ...(command.action === "confirm-outcome"
          ? { chosenOutcome: command.outcome }
          : {}),
      });
      return {
        ok: true,
        body: { goals: await this.goalsDetail(tx, sub, now) },
      };
    });
  }
}

import {
  calculateCadence,
  latestMeaningfulActivity,
  type CadencePause,
} from "../../follow-ups/services/follow-up-cadence.policy.js";
import {
  historicalCadence,
  type CadenceHistoryInterval,
} from "../../follow-ups/services/cadence-history.policy.js";

export type HistoricalSubscription = {
  id: string;
  customerId: string;
  createdAt: Date;
  actualStartDate: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
};
export type HistoricalStatus = {
  subscriptionId: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: Date;
};
export type HistoricalActivity = {
  subscriptionId: string;
  occurredAt: Date;
  completedAt: Date | null;
  status: string;
};
export function historicalSubscriptionStatus(
  sub: HistoricalSubscription,
  history: readonly HistoricalStatus[],
  pauses: readonly CadencePause[],
  at: Date,
): string | null {
  if (sub.createdAt > at || !sub.actualStartDate || sub.actualStartDate > at)
    return null;
  // actualStartDate is the activation fact. Later owner transitions take precedence.
  const relevant = history.filter(
    (row) =>
      row.subscriptionId === sub.id &&
      row.changedAt >= sub.actualStartDate! &&
      row.changedAt <= at,
  );
  const lastTime = relevant.reduce(
    (time, row) => Math.max(time, row.changedAt.getTime()),
    -Infinity,
  );
  const latest = relevant.filter((row) => row.changedAt.getTime() === lastTime);
  let state = "active";
  if (latest.length === 1) state = latest[0]!.toStatus;
  else if (latest.length > 1) {
    // Resolve a same-timestamp causal chain; UUID sorting cannot prove its order.
    const terminal = latest.filter(
      (row) =>
        !latest.some(
          (other) => other !== row && other.fromStatus === row.toStatus,
        ),
    );
    if (terminal.length !== 1) throw new Error("Ambiguous lifecycle history");
    state = terminal[0]!.toStatus;
  }
  if (sub.cancelledAt && sub.cancelledAt <= at) return "cancelled";
  if (sub.completedAt && sub.completedAt <= at) return "completed";
  if (
    pauses.some(
      (pause) =>
        pause.startedAt <= at && (pause.endedAt === null || at < pause.endedAt),
    )
  )
    return "paused";
  return state;
}
export function historicalStocks(
  input: {
    subscriptions: readonly HistoricalSubscription[];
    statuses: readonly HistoricalStatus[];
    pauses: readonly (CadencePause & { subscriptionId: string })[];
    cadenceHistory: readonly (CadenceHistoryInterval & {
      subscriptionId: string;
    })[];
    followUps: readonly HistoricalActivity[];
    appointments: readonly {
      subscriptionId: string;
      completedAt: Date | null;
      createdAt: Date;
    }[];
  },
  at: Date,
): { activeClients: number; followUpsOverdue: number | null } {
  const clients = new Set<string>();
  let overdue = 0,
    complete = true;
  for (const sub of input.subscriptions) {
    const pauses = input.pauses.filter((row) => row.subscriptionId === sub.id);
    const status = historicalSubscriptionStatus(
      sub,
      input.statuses,
      pauses,
      at,
    );
    if (status !== "active") continue;
    clients.add(sub.customerId);
    const cadence = historicalCadence(
      input.cadenceHistory.filter((row) => row.subscriptionId === sub.id),
      at,
    );
    if (!cadence) {
      complete = false;
      continue;
    }
    const appointments = input.appointments.filter(
      (row) =>
        row.subscriptionId === sub.id &&
        row.createdAt <= at &&
        row.completedAt &&
        row.completedAt <= at,
    );
    const followUps = input.followUps
      .filter((row) => row.subscriptionId === sub.id && row.occurredAt <= at)
      .map((row) => ({
        ...row,
        completedAt:
          row.completedAt && row.completedAt <= at ? row.completedAt : null,
      }));
    const activity = latestMeaningfulActivity(
      sub.actualStartDate,
      appointments,
      followUps,
    );
    if (
      calculateCadence({
        status,
        actualStartDate: sub.actualStartDate,
        cadence,
        activity,
        pauses,
        now: at,
      }).cadenceState === "overdue"
    )
      overdue++;
  }
  return {
    activeClients: clients.size,
    followUpsOverdue: complete ? overdue : null,
  };
}

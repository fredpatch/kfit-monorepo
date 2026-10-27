import { eq, inArray, sql } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import { servicePolicies } from "../../../db/schema/catalogue.js";
import { subscriptions } from "../../../db/schema/customers.js";
import { subscriptionFollowUpCadenceHistory } from "../../../db/schema/coaching.js";
import {
  InvalidCadenceError,
  resolveCadence,
} from "../services/follow-up-cadence.policy.js";

type Tx = Parameters<Parameters<typeof appDb.transaction>[0]>[0];
type Subscription = typeof subscriptions.$inferSelect;
export type ResolvedCadence = NonNullable<ReturnType<typeof resolveCadence>>;
export const sameCadence = (a: ResolvedCadence, b: ResolvedCadence) =>
  a.days === b.days && a.source === b.source;

export async function resolvedCadence(
  tx: Tx,
  sub: Pick<
    Subscription,
    "serviceId" | "variantId" | "followUpFrequencyDaysOverride"
  >,
): Promise<ResolvedCadence> {
  const policies = await tx
    .select({
      variantId: servicePolicies.variantId,
      followUpFrequencyDays: servicePolicies.followUpFrequencyDays,
    })
    .from(servicePolicies)
    .where(eq(servicePolicies.serviceId, sub.serviceId));
  const result = resolveCadence(
    sub.followUpFrequencyDaysOverride,
    policies,
    sub.variantId,
  );
  if (!result)
    throw new InvalidCadenceError("Invalid cadence source configuration");
  return result;
}

// All cadence-source writers acquire this transaction fence before row locks.
// Subscription -> catalogue row order is retained for existing owner operations.
export async function lockCadenceWrites(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(7247001)`);
}

/** Caller supplies the existing owner transaction; only the current end may close. */
export async function recordEffectiveCadence(
  tx: Tx,
  sub: Pick<Subscription, "id">,
  next: ResolvedCadence,
  at: Date,
  expectedPrevious?: ResolvedCadence,
): Promise<boolean> {
  await tx
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.id, sub.id))
    .for("update");
  const rows = await tx
    .select()
    .from(subscriptionFollowUpCadenceHistory)
    .where(eq(subscriptionFollowUpCadenceHistory.subscriptionId, sub.id))
    .orderBy(subscriptionFollowUpCadenceHistory.effectiveFrom)
    .for("update");
  const opens = rows.filter((row) => row.effectiveTo === null),
    current = opens[0];
  if (
    opens.length > 1 ||
    rows.some(
      (row, index) =>
        index > 0 &&
        (rows[index - 1]!.effectiveTo === null ||
          rows[index - 1]!.effectiveTo! > row.effectiveFrom),
    )
  )
    throw new InvalidCadenceError("Overlapping cadence history");
  if (current) {
    const previous = {
      days: current.effectiveFrequencyDays,
      source: current.source,
    };
    if (
      expectedPrevious &&
      (previous.days !== expectedPrevious.days ||
        previous.source !== expectedPrevious.source)
    )
      throw new InvalidCadenceError(
        "Current cadence history does not match the source",
      );
    if (previous.days === next.days && previous.source === next.source)
      return false;
    if (at <= current.effectiveFrom)
      throw new InvalidCadenceError("Cadence transition must advance time");
    await tx
      .update(subscriptionFollowUpCadenceHistory)
      .set({ effectiveTo: at })
      .where(eq(subscriptionFollowUpCadenceHistory.id, current.id));
  } else if (rows.length)
    throw new InvalidCadenceError("Cadence history has no open interval");
  await tx.insert(subscriptionFollowUpCadenceHistory).values({
    subscriptionId: sub.id,
    effectiveFrequencyDays: next.days,
    source: next.source,
    effectiveFrom: at,
    createdAt: at,
  });
  return true;
}

/** Capture source values before a policy mutation while locking its affected scope. */
export async function lockPolicyCadenceScope(
  tx: Tx,
  serviceIds: readonly string[],
) {
  if (!serviceIds.length) return [];
  const owners = await tx
    .select()
    .from(subscriptions)
    .where(inArray(subscriptions.serviceId, [...serviceIds]))
    .orderBy(subscriptions.id)
    .for("update");
  const before = [];
  for (const sub of owners)
    before.push({ sub, cadence: await resolvedCadence(tx, sub) });
  return before;
}

export async function recordPolicyCadenceChanges(
  tx: Tx,
  before: Awaited<ReturnType<typeof lockPolicyCadenceScope>>,
  at: Date,
): Promise<void> {
  for (const { sub, cadence } of before) {
    const next = await resolvedCadence(tx, sub);
    if (!sameCadence(cadence, next))
      await recordEffectiveCadence(tx, sub, next, at, cadence);
  }
}

/** Explicit prospective initialization; never derive an earlier authority date. */
export async function initializeCurrentCadenceHistory(
  database: typeof appDb,
  clock: () => Date = () => new Date(),
  expectedApplicableCount?: number,
): Promise<number> {
  return database.transaction(async (tx) => {
    await lockCadenceWrites(tx);
    const owners = await tx
      .select()
      .from(subscriptions)
      .where(
        inArray(subscriptions.status, ["active", "paused", "completion_due"]),
      )
      .orderBy(subscriptions.id)
      .for("update");
    if (
      expectedApplicableCount !== undefined &&
      owners.filter((sub) => sub.actualStartDate !== null).length !==
        expectedApplicableCount
    )
      throw new InvalidCadenceError(
        "Initialization scope changed since preflight",
      );
    const at = clock();
    let initialized = 0;
    for (const sub of owners) {
      if (!sub.actualStartDate) continue;
      const [existing] = await tx
        .select({ id: subscriptionFollowUpCadenceHistory.id })
        .from(subscriptionFollowUpCadenceHistory)
        .where(eq(subscriptionFollowUpCadenceHistory.subscriptionId, sub.id))
        .limit(1);
      if (
        !existing &&
        (await recordEffectiveCadence(
          tx,
          sub,
          await resolvedCadence(tx, sub),
          at,
        ))
      )
        initialized += 1;
    }
    return initialized;
  });
}

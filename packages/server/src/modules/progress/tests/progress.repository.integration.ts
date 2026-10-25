import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import type { CoachingGoal, GoalsDetail, ProgressDetail, CreateMeasurementInput, CreateGoalInput } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { users, auditEvents } from "../../../db/schema/auth.js";
import { goals, goalEvents, progressMeasurements } from "../../../db/schema/coaching.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { services } from "../../../db/schema/catalogue.js";
import { consentDefinitions, consentRecords } from "../../../db/schema/onboarding.js";
import { DrizzleProgressRepository } from "../repositories/progress.repository.js";
import { ProgressService, type ProgressCommand } from "../services/progress.service.js";

const userId = randomUUID(), customerId = randomUUID(), serviceId = randomUUID(), definitionId = randomUUID(), subIds: string[] = [];
const now = new Date("2026-10-21T12:00:00.000Z"), at = (offset: number) => new Date(now.getTime() + offset);
const options = { auditHashPepper: "synthetic-progress-pepper-at-least-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.54", userAgent: "synthetic-progress-tests" };
const repositoryAt = (time = now) => new DrizzleProgressRepository(db, options, () => new Date(time));
const repo = repositoryAt(), service = new ProgressService(repo);
let safe = false;
before(async () => {
  assertLocalTestDatabase(); safe = true;
  await db.insert(users).values({ id: userId, email: `progress-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Progress Customer", whatsapp: "+241000005454" });
  await db.insert(services).values({ id: serviceId, name: "Synthetic Progress Service", slug: `progress-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  const content = "Synthetic health collection permission";
  await db.insert(consentDefinitions).values({ id: definitionId, consentType: "health_data", version: "2147483540", title: "Synthetic health consent", content,
    contentHash: createHash("sha256").update(content).digest("hex"), status: "published", publishedAt: at(-10000) });
});
after(async () => {
  try {
    if (!safe) return;
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    if (subIds.length) {
      const rows = await db.select({ id: goals.id }).from(goals).where(inArray(goals.subscriptionId, subIds));
      if (rows.length) await db.delete(goalEvents).where(inArray(goalEvents.goalId, rows.map(r => r.id)));
      await db.delete(goals).where(inArray(goals.subscriptionId, subIds));
      await db.delete(progressMeasurements).where(inArray(progressMeasurements.subscriptionId, subIds));
      await db.delete(consentRecords).where(inArray(consentRecords.subscriptionId, subIds));
      await db.delete(subscriptions).where(inArray(subscriptions.id, subIds));
    }
    await db.delete(consentDefinitions).where(eq(consentDefinitions.id, definitionId));
    await db.delete(services).where(eq(services.id, serviceId)); await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});
async function owner(status = "active", decision: "granted" | "refused" | null = "granted") {
  const id = randomUUID(); subIds.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-PROGRESS-${id}`, customerId, serviceId, status, agreedPriceXaf: 45000, createdByUserId: userId });
  if (decision) await consent(id, decision);
  return id;
}
async function consent(id: string, decision: "granted" | "refused" | "revoked") {
  const prior = await db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, id));
  const superseded = new Set(prior.map(row => row.supersedesConsentRecordId));
  const head = prior.find(row => !superseded.has(row.id));
  await db.insert(consentRecords).values({ customerId, subscriptionId: id, consentDefinitionId: definitionId, decision, capturedVia: "coach_assisted", capturedByUserId: userId,
    supersedesConsentRecordId: head?.id ?? null, capturedAt: now });
}
const execute = (id: string, command: ProgressCommand, repository = repo) => repository.execute(id, command, actor);
async function progress(id: string, repository = repo): Promise<ProgressDetail> {
  const result = await execute(id, { action: "progress" }, repository); assert.ok(result.ok && "progress" in result.body);
  if (!result.ok || !("progress" in result.body)) throw new Error("Missing progress"); return result.body.progress;
}
async function detail(id: string, repository = repo): Promise<GoalsDetail> {
  const result = await execute(id, { action: "goals" }, repository); assert.ok(result.ok && "goals" in result.body);
  if (!result.ok || !("goals" in result.body)) throw new Error("Missing goals"); return result.body.goals;
}
const measure = (id: string, input: Partial<CreateMeasurementInput> = {}, repository = repo) => new ProgressService(repository).execute(id, "measurement", { measuredAt: at(-1000).toISOString(), weightKg: 82.4, ...input }, actor);
async function goal(id: string, input: Partial<CreateGoalInput> = {}, repository = repo): Promise<CoachingGoal> {
  const result = await new ProgressService(repository).execute(id, "create-goal", { category: "Synthetic category", label: "Synthetic private goal", ...input }, actor);
  assert.ok(result.ok && "goals" in result.body, JSON.stringify(result)); if (!result.ok || !("goals" in result.body)) throw new Error("Missing goal");
  return result.body.goals.goals.at(-1)!;
}
const numeric = { metricKey: "weight_kg", baselineValue: 90, targetValue: 80, unit: "kg" } as const;
const fail = (error: string) => ({ ok: false, error });
async function storedGoal(id: string) { const [row] = await db.select().from(goals).where(eq(goals.id, id)); assert.ok(row); return row; }

for (const status of ["active", "paused"]) test(`PostgreSQL ${status} with health grant records immutable measurement facts`, async () => {
  const id = await owner(status); assert.ok((await measure(id, { feelingNote: " Synthetic private feeling " })).ok);
  const view = await progress(id); assert.equal(view.measurements.length, 1); assert.equal(view.measurements[0]?.weightKg, 82.4); assert.equal(view.measurements[0]?.feelingNote, "Synthetic private feeling"); assert.equal(view.measurements[0]?.createdAt, now.toISOString());
});
for (const decision of [null, "refused"] as const) test(`PostgreSQL ${decision ?? "absent"} health consent blocks collection`, async () => {
  const id = await owner("active", decision); assert.deepEqual(await measure(id), fail("PROGRESS_HEALTH_CONSENT_REQUIRED")); assert.equal((await progress(id)).canRecord, false);
});
test("PostgreSQL revoked health grant blocks new collection and preserves historical read", async () => {
  const id = await owner(); await measure(id); const before = (await progress(id)).measurements; await consent(id, "revoked");
  assert.deepEqual(await measure(id, { weightKg: 81 }), fail("PROGRESS_HEALTH_CONSENT_REQUIRED")); assert.deepEqual((await progress(id)).measurements, before);
});
for (const state of ["onboarding", "awaiting_payment", "medical_clearance_required", "ready_to_start", "completion_due", "completed", "cancelled"]) test(`PostgreSQL ${state} rejects collection and goal creation but allows history`, async () => {
  const id = await owner(state); assert.deepEqual(await measure(id), fail("PROGRESS_SUBSCRIPTION_NOT_ELIGIBLE"));
  assert.deepEqual(await service.execute(id, "create-goal", { category: "custom", label: "Synthetic" }, actor), fail("GOAL_SUBSCRIPTION_NOT_ELIGIBLE"));
  assert.equal((await progress(id)).measurements.length, 0); assert.equal((await detail(id)).goals.length, 0);
});
for (const [input, label] of [
  [{ measuredAt: at(1).toISOString() }, "future"], [{ weightKg: null }, "empty"], [{ weightKg: -1 }, "negative"], [{ weightKg: 1001 }, "technical cap"], [{ bodyFatEstimate: 101 }, "percentage cap"], [{ weightKg: 80.123 }, "excess precision"],
] as const) test(`PostgreSQL invalid measurement ${label} leaves no facts`, async () => {
  const id = await owner(); assert.deepEqual(await measure(id, input), fail("PROGRESS_INVALID_INPUT")); assert.equal((await progress(id)).measurements.length, 0);
});
test("PostgreSQL normalized exact duplicate rejects without another fact or audit", async () => {
  const id = await owner(); await measure(id, { feelingNote: " synthetic " }); assert.deepEqual(await measure(id, { feelingNote: "synthetic", waistCm: null }), fail("PROGRESS_MEASUREMENT_DUPLICATE"));
  assert.equal((await progress(id)).measurements.length, 1); const audits = await db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, userId), eq(auditEvents.entityId, (await progress(id)).measurements[0]!.id))); assert.equal(audits.length, 1);
});
test("PostgreSQL concurrent identical submissions persist exactly one measurement", async () => {
  const id = await owner(), results = await Promise.all([measure(id), measure(id)]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "PROGRESS_MEASUREMENT_DUPLICATE")); assert.equal((await progress(id)).measurements.length, 1);
});
test("PostgreSQL backdated chronology and previous comparable metrics retain all facts", async () => {
  const id = await owner(); await measure(id, { measuredAt: at(-1000).toISOString(), weightKg: 82.4 }); await measure(id, { measuredAt: at(-3000).toISOString(), weightKg: 84, waistCm: 90 }); await measure(id, { measuredAt: at(-2000).toISOString(), weightKg: null, hipsCm: 98 });
  const view = await progress(id); assert.deepEqual(view.measurements.map(row => row.measuredAt), [-3000, -2000, -1000].map(offset => at(offset).toISOString()));
  assert.equal(view.metrics.weightKg.latest?.value, 82.4); assert.equal(view.metrics.weightKg.previous?.value, 84); assert.equal(view.metrics.weightKg.delta, -1.6); assert.equal(view.metrics.waistCm.previous, null); assert.equal(view.metrics.chestCm.latest, null);
});
test("PostgreSQL equal measurement dates use server creation timestamp tie break", async () => {
  const id = await owner(); await measure(id, { weightKg: 84 }); await measure(id, { weightKg: 82 }, repositoryAt(at(1)));
  const view = await progress(id, repositoryAt(at(1))); assert.equal(view.metrics.weightKg.latest?.value, 82); assert.equal(view.metrics.weightKg.previous?.value, 84);
});
test("PostgreSQL qualitative goal has no numeric suggestion and creation evidence", async () => {
  const id = await owner(), item = await goal(id); assert.equal(item.status, "active"); assert.equal(item.metricKey, null); assert.equal(item.suggestedStatus, null); assert.equal(item.events[0]?.eventType, "goal.created");
});
for (const increasing of [true, false]) test(`PostgreSQL ${increasing ? "increase" : "decrease"} metric goal creation`, async () => {
  const id = await owner(), item = await goal(id, { ...numeric, baselineValue: increasing ? 50 : 90, targetValue: increasing ? 60 : 80 }); assert.equal(item.metricKey, "weight_kg"); assert.equal(item.suggestedStatus, null);
});
for (const [input, error, label] of [
  [{ metricKey: "unsupported" }, "GOAL_METRIC_INVALID", "unsupported metric"], [{ baselineValue: 50 }, "GOAL_NUMERIC_FIELDS_INCOMPLETE", "partial triplet"],
  [{ ...numeric, baselineValue: 80 }, "GOAL_TARGET_INVALID", "equal target"], [{ targetDate: at(-1).toISOString() }, "GOAL_TARGET_DATE_INVALID", "past date"],
  [{ targetDate: now.toISOString() }, "GOAL_TARGET_DATE_INVALID", "current date"], [{ targetDate: "invalid" }, "GOAL_TARGET_DATE_INVALID", "invalid date"],
] as const) test(`PostgreSQL rejects goal ${label}`, async () => {
  const id = await owner(); assert.deepEqual(await service.execute(id, "create-goal", { category: "custom", label: "Synthetic", ...input }, actor), fail(error)); assert.equal((await detail(id)).goals.length, 0);
});
for (const [baselineValue, targetValue, latest, expected] of [[50, 60, 60, "achieved"], [90, 80, 80, "achieved"], [50, 60, 55, "partially_achieved"], [90, 80, 85, "partially_achieved"], [50, 60, 50, "not_achieved"], [90, 80, 95, "not_achieved"]] as const) test(`PostgreSQL directional suggestion ${baselineValue} to ${targetValue} at ${latest}`, async () => {
  const id = await owner(); await measure(id, { weightKg: latest }); const item = await goal(id, { ...numeric, baselineValue, targetValue, targetDate: at(1000).toISOString() });
  const atDeadline = (await detail(id, repositoryAt(at(1000)))).goals[0]!;
  assert.equal(atDeadline.suggestedStatus, expected === "achieved" ? "achieved" : null);
  const later = (await detail(id, repositoryAt(at(1001)))).goals[0]!; assert.equal(later.suggestedStatus, expected); assert.equal(later.status, "active"); assert.equal((await storedGoal(item.id)).status, "active");
});
test("PostgreSQL no matching metric and no deadline remain advisory null", async () => {
  const id = await owner(); await measure(id, { weightKg: null, waistCm: 70 }); const item = await goal(id, numeric); assert.equal(item.suggestedStatus, null); assert.equal(item.latestMatchingMetric, null);
  await measure(id, { weightKg: 85 }); assert.equal((await detail(id)).goals[0]?.suggestedStatus, null);
});
test("PostgreSQL matching metric refreshes paused and active goals without authoritative transition", async () => {
  const id = await owner(), active = await goal(id, numeric), paused = await goal(id, numeric); await execute(paused.id, { action: "pause", reason: null }); await measure(id, { weightKg: 79 });
  assert.equal((await storedGoal(active.id)).suggestedStatus, "achieved"); assert.equal((await storedGoal(paused.id)).suggestedStatus, "achieved"); assert.equal((await storedGoal(paused.id)).status, "paused");
});
test("PostgreSQL unrelated or older measurement cannot replace current matching suggestion", async () => {
  const id = await owner(), item = await goal(id, numeric); await measure(id, { weightKg: 79 }); const before = await storedGoal(item.id);
  await measure(id, { weightKg: null, waistCm: 100 }); assert.deepEqual(await storedGoal(item.id), before);
  await measure(id, { measuredAt: at(-2000).toISOString(), weightKg: 95 }); assert.equal((await storedGoal(item.id)).suggestedStatus, "achieved");
});
test("PostgreSQL accepting matching suggestion records explicit terminal outcome and timestamp", async () => {
  const id = await owner(); await measure(id, { weightKg: 79 }); const item = await goal(id, numeric); assert.ok((await execute(item.id, { action: "confirm-outcome", outcome: "achieved", reason: null })).ok);
  const stored = await storedGoal(item.id); assert.equal(stored.status, "achieved"); assert.equal(stored.coachConfirmedAt?.toISOString(), now.toISOString());
  const event = (await detail(id)).goals[0]!.events.find(e => e.eventType === "goal.outcome_confirmed"); assert.equal(event?.suggestedStatusSnapshot, "achieved"); assert.deepEqual((await detail(id)).goals[0]?.availableCommands, []);
});
test("PostgreSQL differing suggestion requires a reason, then preserves override evidence", async () => {
  const id = await owner(); await measure(id, { weightKg: 79 }); const item = await goal(id, numeric);
  assert.deepEqual(await execute(item.id, { action: "confirm-outcome", outcome: "not_achieved", reason: null }), fail("GOAL_OUTCOME_REASON_REQUIRED"));
  assert.ok((await execute(item.id, { action: "confirm-outcome", outcome: "not_achieved", reason: "Synthetic private override" })).ok); assert.equal((await detail(id)).goals[0]?.events.find(e => e.eventType === "goal.outcome_confirmed")?.reason, "Synthetic private override");
});
test("PostgreSQL null suggestion requires manual outcome reason", async () => {
  const id = await owner(), item = await goal(id); assert.deepEqual(await execute(item.id, { action: "confirm-outcome", outcome: "achieved", reason: null }), fail("GOAL_OUTCOME_REASON_REQUIRED"));
  assert.ok((await execute(item.id, { action: "confirm-outcome", outcome: "partially_achieved", reason: "Synthetic manual decision" })).ok);
});
test("PostgreSQL confirmation refreshes expired date suggestion rather than trusting stored advisory", async () => {
  const id = await owner(); await measure(id, { weightKg: 85 }); const item = await goal(id, { ...numeric, targetDate: at(1000).toISOString() }); assert.equal((await storedGoal(item.id)).suggestedStatus, null);
  assert.ok((await execute(item.id, { action: "confirm-outcome", outcome: "partially_achieved", reason: null }, repositoryAt(at(1001)))).ok); assert.equal((await storedGoal(item.id)).suggestedStatus, "partially_achieved");
});
test("PostgreSQL explicit pause/resume and forbidden paused confirmation", async () => {
  const id = await owner(), item = await goal(id, numeric); await execute(item.id, { action: "pause", reason: "Synthetic pause" });
  assert.deepEqual(await execute(item.id, { action: "confirm-outcome", outcome: "achieved", reason: "Synthetic" }), fail("GOAL_TRANSITION_INVALID"));
  await measure(id, { weightKg: 79 }); await execute(item.id, { action: "resume", reason: null }); assert.equal((await storedGoal(item.id)).status, "active"); assert.equal((await storedGoal(item.id)).suggestedStatus, "achieved"); assert.equal((await detail(id)).goals[0]?.events.length, 3);
});
for (const paused of [false, true]) test(`PostgreSQL ${paused ? "paused" : "active"} cancellation needs reason and is terminal`, async () => {
  const id = await owner(), item = await goal(id); if (paused) await execute(item.id, { action: "pause", reason: null });
  assert.deepEqual(await service.execute(item.id, "cancel", { reason: " " }, actor), fail("GOAL_OUTCOME_REASON_REQUIRED")); await execute(item.id, { action: "cancel", reason: "Synthetic private cancellation" });
  for (const action of ["pause", "resume", "cancel"] as const) assert.deepEqual(await execute(item.id, { action, reason: "Synthetic" }), fail("GOAL_TRANSITION_INVALID")); assert.equal((await storedGoal(item.id)).coachConfirmedAt, null);
});
test("PostgreSQL subscription pause/completion/cancellation never changes goal state or evidence", async () => {
  const id = await owner(), item = await goal(id), before = await storedGoal(item.id);
  for (const state of ["paused", "active", "completion_due", "completed", "cancelled"]) { await db.update(subscriptions).set({ status: state }).where(eq(subscriptions.id, id)); assert.equal((await detail(id)).goals[0]?.status, "active"); assert.deepEqual(await storedGoal(item.id), before); }
  assert.ok((await execute(item.id, { action: "pause", reason: null })).ok);
});
test("PostgreSQL goal events remain append-only and chronological", async () => {
  const id = await owner(), item = await goal(id), original = item.events[0]!;
  await execute(item.id, { action: "pause", reason: null }, repositoryAt(at(1))); await execute(item.id, { action: "resume", reason: null }, repositoryAt(at(2)));
  const events = (await detail(id, repositoryAt(at(2)))).goals[0]!.events; assert.equal(events.length, 3); assert.deepEqual(events[0], original); assert.deepEqual(events.map(e => e.eventType), ["goal.created", "goal.paused", "goal.resumed"]);
});
test("PostgreSQL concurrent terminal command appends exactly one outcome event", async () => {
  const id = await owner(), item = await goal(id); const command: ProgressCommand = { action: "confirm-outcome", outcome: "achieved", reason: "Synthetic" };
  const results = await Promise.all([execute(item.id, command), execute(item.id, command)]); assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await detail(id)).goals[0]?.events.length, 2);
});
test("PostgreSQL terminal suggestion and outcome stay historical after later measurement", async () => {
  const id = await owner(); await measure(id, { weightKg: 79 }); const item = await goal(id, numeric); await execute(item.id, { action: "confirm-outcome", outcome: "achieved", reason: null }); const before = await storedGoal(item.id);
  await measure(id, { measuredAt: now.toISOString(), weightKg: 95 }); assert.deepEqual(await storedGoal(item.id), before); assert.equal((await detail(id)).goals[0]?.suggestedStatus, "achieved");
});
test("PostgreSQL audits exclude metric values, labels, category, feeling and decision reasons", async () => {
  const id = await owner(); await measure(id, { weightKg: 82.47, feelingNote: "Synthetic private feeling" }); const item = await goal(id, numeric); await execute(item.id, { action: "cancel", reason: "Synthetic private cancellation" });
  const ids = [(await progress(id)).measurements[0]!.id, item.id], rows = await db.select().from(auditEvents).where(inArray(auditEvents.entityId, ids)); assert.equal(rows.length, 3);
  const allowed = new Set(["subscriptionId", "measurementId", "metricKeys", "measuredAt", "goalId", "metricKey", "fromStatus", "toStatus", "suggestedStatus", "chosenOutcome"]);
  for (const row of rows) { const json = JSON.stringify(row.metadataJson); assert.ok(!json.includes("Synthetic") && !json.includes("82.47") && !json.includes("reason") && !json.includes("baseline")); assert.ok(Object.keys(row.metadataJson ?? {}).every(key => allowed.has(key))); }
});
function auditFailureRepository() {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, { get(target, key, receiver) {
    if (key === "transaction") return <T>(work: (tx: Tx) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, { get(transaction, member, txReceiver) {
      if (member === "insert") return (table: Parameters<Tx["insert"]>[0]) => {
        const insert = transaction.insert(table); if (table !== auditEvents) return insert;
        return new Proxy(insert, { get(builder, method, builderReceiver) { if (method === "values") return (value: Record<string, unknown>) => Reflect.apply(builder.values, builder, [{ ...value, actorUserId: randomUUID() }]); return Reflect.get(builder, method, builderReceiver); } });
      }; return Reflect.get(transaction, member, txReceiver);
    } })), config); return Reflect.get(target, key, receiver);
  } }); return new DrizzleProgressRepository(database, options, () => new Date(now));
}
function isForeignKeyFailure(error: unknown): boolean { return !!error && typeof error === "object" && ("code" in error && error.code === "23503" || "cause" in error && error.cause !== error && isForeignKeyFailure(error.cause)); }
for (const action of ["measurement", "create-goal", "pause", "resume", "cancel", "confirm-outcome"] as const) test(`PostgreSQL audit FK failure rolls back ${action} and related evidence`, async () => {
  const id = await owner(), item = await goal(id, numeric); if (action === "resume") await execute(item.id, { action: "pause", reason: null });
  const before = await detail(id), measurements = await progress(id), broken = auditFailureRepository();
  const command: ProgressCommand = action === "measurement" ? { action, measuredAt: at(-1), values: { weightKg: 79, waistCm: null, hipsCm: null, chestCm: null, bodyFatEstimate: null }, feelingNote: "Synthetic rollback" }
    : action === "create-goal" ? { action, category: "Synthetic", label: "Synthetic", metricKey: null, baselineValue: null, targetValue: null, unit: null, targetDate: null }
    : action === "confirm-outcome" ? { action, outcome: "achieved", reason: "Synthetic" } : { action, reason: "Synthetic" };
  await assert.rejects(execute(action === "measurement" || action === "create-goal" ? id : item.id, command, broken), isForeignKeyFailure);
  assert.deepEqual(await detail(id), before); assert.deepEqual(await progress(id), measurements);
});

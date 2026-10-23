import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { users, auditEvents } from "../../../db/schema/auth.js";
import { appointments, followUps, followUpEvents, subscriptionFollowUpCadenceHistory } from "../../../db/schema/coaching.js";
import { customers, subscriptions, subscriptionPauses } from "../../../db/schema/customers.js";
import { services, serviceVariants, servicePolicies } from "../../../db/schema/catalogue.js";
import { DrizzleFollowUpsRepository } from "../repositories/follow-ups.repository.js";
import { FollowUpsService, type FollowUpCommand } from "../services/follow-ups.service.js";
import { cadenceDayMs } from "../services/follow-up-cadence.policy.js";
import type { FollowUpDetail } from "@kfit/shared";

const userId = randomUUID(), customerId = randomUUID(), serviceIds: string[] = [], subIds: string[] = [];
const now = new Date("2026-10-21T12:00:00.000Z"), at = (days: number) => new Date(now.getTime() + days * cadenceDayMs);
const options = { auditHashPepper: "synthetic-follow-up-test-pepper-at-least-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.53", userAgent: "synthetic-follow-up-tests" };
const repositoryAt = (time = now) => new DrizzleFollowUpsRepository(db, options, () => new Date(time));
const repo = repositoryAt(), service = new FollowUpsService(repo);
let safe = false;
before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev", "requires disposable local PostgreSQL on5433/kfit_dev"); safe = true;
  await db.insert(users).values({ id: userId, email: `follow-ups-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Follow-up Customer", whatsapp: "+241000007777" });
});
after(async () => {
  try {
    if (!safe) return;
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    if (subIds.length) {
      await db.delete(subscriptionFollowUpCadenceHistory).where(inArray(subscriptionFollowUpCadenceHistory.subscriptionId, subIds));
      const rows = await db.select({ id: followUps.id }).from(followUps).where(inArray(followUps.subscriptionId, subIds));
      if (rows.length) await db.delete(followUpEvents).where(inArray(followUpEvents.followUpId, rows.map(r => r.id)));
      await db.delete(followUps).where(inArray(followUps.subscriptionId, subIds));
      await db.delete(appointments).where(inArray(appointments.subscriptionId, subIds));
      await db.delete(subscriptionPauses).where(inArray(subscriptionPauses.subscriptionId, subIds));
      await db.delete(subscriptions).where(inArray(subscriptions.id, subIds));
    }
    if (serviceIds.length) {
      await db.delete(servicePolicies).where(inArray(servicePolicies.serviceId, serviceIds)); await db.delete(serviceVariants).where(inArray(serviceVariants.serviceId, serviceIds)); await db.delete(services).where(inArray(services.id, serviceIds));
    }
    await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});
type Config = { days?: number | null; override?: number | null; variantDays?: number | null; status?: string; start?: Date | null };
async function owner(config: Config = {}) {
  const serviceId = randomUUID(), subId = randomUUID(), variantId = config.variantDays !== undefined ? randomUUID() : null; serviceIds.push(serviceId); subIds.push(subId);
  await db.insert(services).values({ id: serviceId, name: "Synthetic Follow-up Service", slug: `follow-up-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  await db.insert(servicePolicies).values({ serviceId, followUpFrequencyDays: config.days === undefined ? 7 : config.days });
  if (variantId) {
    await db.insert(serviceVariants).values({ id: variantId, serviceId, name: "Synthetic variant", slug: `follow-up-${variantId}` });
    await db.insert(servicePolicies).values({ serviceId, variantId, followUpFrequencyDays: config.variantDays });
  }
  await db.insert(subscriptions).values({ id: subId, reference: `SUB-FOLLOW-UP-${subId}`, customerId, serviceId, variantId, status: config.status ?? "active", agreedPriceXaf: 45000,
    actualStartDate: config.start === undefined ? at(-3) : config.start, followUpFrequencyDaysOverride: config.override ?? null, createdByUserId: userId });
  return { serviceId, subId, variantId };
}
const execute = (id: string, command: FollowUpCommand, repository = repo) => repository.execute(id, command, actor);
async function detail(id: string, repository = repo): Promise<FollowUpDetail> { const result = await execute(id, { action: "read" }, repository); assert.ok(result.ok && "detail" in result.body); if (!result.ok || !("detail" in result.body)) throw new Error("Missing detail"); return result.body.detail; }
async function queue(repository = repo) { const result = await execute("", { action: "queue" }, repository); assert.ok(result.ok && "items" in result.body); if (!result.ok || !("items" in result.body)) throw new Error("Missing queue"); return result.body.items; }
async function create(id: string, config: { open?: boolean; occurredAt?: Date; nextAt?: Date } = {}, repository = repo) {
  const result = await new FollowUpsService(repository).execute(id, "create", { followUpType: "check_in", occurredAt: (config.occurredAt ?? at(-1)).toISOString(), note: "Synthetic private note", ...(config.open ? { nextAction: "Synthetic private next action", nextActionAt: (config.nextAt ?? at(1)).toISOString() } : {}) }, actor);
  assert.ok(result.ok && "detail" in result.body, JSON.stringify(result)); if (!result.ok || !("detail" in result.body)) throw new Error("Missing created follow-up"); return result.body.detail.followUps[0]!;
}
async function app(id: string, status: string, completedAt: Date | null = at(-1)) {
  await db.insert(appointments).values({ subscriptionId: id, status, scheduledStart: at(-2), scheduledEnd: at(-1), completedAt });
}
async function pauses(id: string, values: Array<{ start: Date; end: Date | null }>) {
  await db.insert(subscriptionPauses).values(values.map(p => ({ subscriptionId: id, startedAt: p.start, endedAt: p.end, reason: "Synthetic pause", createdByUserId: userId })));
}
const fail = (error: string) => ({ ok: false, error });
async function row(id: string) { const [row] = await db.select().from(followUps).where(eq(followUps.id, id)); assert.ok(row); return row; }

test("PostgreSQL service cadence fallback and activation baseline", async () => {
  const o = await owner(), view = await detail(o.subId); assert.equal(view.cadence.effectiveCadenceDays, 7); assert.equal(view.cadence.cadenceSource, "service"); assert.equal(view.cadence.latestMeaningfulActivityAt, at(-3).toISOString()); assert.equal(view.cadence.latestActivityType, "activation"); assert.equal(view.cadence.nextFollowUpDueAt, at(4).toISOString());
});
test("PostgreSQL variant cadence wins, null variant field falls back", async () => {
  for (const variantDays of [3, null]) { const o = await owner({ variantDays }), view = await detail(o.subId); assert.equal(view.cadence.effectiveCadenceDays, variantDays ?? 7); assert.equal(view.cadence.cadenceSource, variantDays ? "variant" : "service"); }
});
test("PostgreSQL subscription override wins and clearing immediately restores policy", async () => {
  const o = await owner({ variantDays: 3 }); const before = (await detail(o.subId)).followUps;
  assert.ok((await service.execute(o.subId, "cadence", { frequencyDays: 2 }, actor)).ok); assert.equal((await detail(o.subId)).cadence.cadenceSource, "override"); assert.equal((await detail(o.subId)).cadence.nextFollowUpDueAt, at(-1).toISOString());
  const laterService = new FollowUpsService(repositoryAt(new Date(now.getTime() + 1)));
  assert.ok((await laterService.execute(o.subId, "cadence", { frequencyDays: null }, actor)).ok); const view = await detail(o.subId); assert.equal(view.cadence.cadenceSource, "variant"); assert.equal(view.cadence.effectiveCadenceDays, 3); assert.deepEqual(view.followUps, before);
});
test("PostgreSQL null cadence disables monitoring and omits subscription from queue", async () => { const o = await owner({ days: null }); const view = await detail(o.subId); assert.equal(view.cadence.monitoringDisabled, true); assert.equal(view.cadence.cadenceState, null); assert.ok(!(await queue()).some(i => i.subscriptionId === o.subId)); });
test("PostgreSQL missing activation is not cadence eligible despite meaningful-looking rows", async () => { const o = await owner({ start: null }); await app(o.subId, "completed"); assert.equal((await detail(o.subId)).cadence.cadenceEligible, false); assert.ok(!(await queue()).some(i => i.subscriptionId === o.subId)); });
test("PostgreSQL invalid cadence commands reject without changing override", async () => {
  const o = await owner(); for (const frequencyDays of [0, -1, 1.5, "7"]) assert.deepEqual(await service.execute(o.subId, "cadence", { frequencyDays }, actor), fail("FOLLOW_UP_CADENCE_INVALID"));
  assert.deepEqual(await service.execute(o.subId, "cadence", { frequencyDays: 2147483647 }, actor), fail("FOLLOW_UP_CADENCE_INVALID")); const [stored] = await db.select().from(subscriptions).where(eq(subscriptions.id, o.subId)); assert.equal(stored?.followUpFrequencyDaysOverride, null);
});
test("PostgreSQL current policy edit recalculates cadence without rewriting history", async () => {
  const o = await owner(), item = await create(o.subId), before = await row(item.id); await db.update(servicePolicies).set({ followUpFrequencyDays: 2 }).where(eq(servicePolicies.serviceId, o.serviceId)); const view = await detail(o.subId); assert.equal(view.cadence.effectiveCadenceDays, 2); assert.equal(view.cadence.nextFollowUpDueAt, at(1).toISOString()); assert.deepEqual(await row(item.id), before); assert.equal(view.followUps[0]?.events.length, 1);
});
test("PostgreSQL completed appointment resets meaningful activity", async () => { const o = await owner(); await app(o.subId, "completed"); const view = await detail(o.subId); assert.equal(view.cadence.latestMeaningfulActivityAt, at(-1).toISOString()); assert.equal(view.cadence.latestActivityType, "appointment_completed"); });
for (const status of ["scheduled", "confirmed", "cancelled", "missed", "reschedule_requested", "rescheduled"]) test(`PostgreSQL ${status} appointment never resets cadence even with a timestamp fixture`, async () => { const o = await owner(); await app(o.subId, status); assert.equal((await detail(o.subId)).cadence.latestMeaningfulActivityAt, at(-3).toISOString()); });
test("PostgreSQL structured follow-up without next action is done and meaningful at occurredAt", async () => {
  const o = await owner(), item = await create(o.subId); assert.equal(item.status, "done"); assert.equal(item.completedAt, at(-1).toISOString()); assert.equal(item.nextAction, null); assert.equal(item.events[0]?.eventType, "follow_up.recorded"); assert.equal((await detail(o.subId)).cadence.latestMeaningfulActivityAt, at(-1).toISOString());
});
test("PostgreSQL complete next-action pair creates open follow-up with retained private facts", async () => {
  const o = await owner(), item = await create(o.subId, { open: true }); assert.equal(item.status, "open"); assert.equal(item.completedAt, null); assert.equal(item.nextActionAt, at(1).toISOString()); assert.equal(item.note, "Synthetic private note");
});
for (const [extra, error] of [
  [{ nextAction: "Synthetic action" }, "FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED"], [{ nextActionAt: at(1).toISOString() }, "FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED"],
  [{ nextAction: " ", nextActionAt: at(1).toISOString() }, "FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED"], [{ nextAction: "Synthetic action", nextActionAt: at(-1).toISOString() }, "FOLLOW_UP_NEXT_ACTION_DATE_INVALID"],
  [{ nextAction: "Synthetic action", nextActionAt: at(-2).toISOString() }, "FOLLOW_UP_NEXT_ACTION_DATE_INVALID"],
] as const) test(`PostgreSQL rejects malformed follow-up action pair ${JSON.stringify(extra)}`, async () => {
  const o = await owner(); assert.deepEqual(await service.execute(o.subId, "create", { followUpType: "check_in", occurredAt: at(-1).toISOString(), ...extra }, actor), fail(error)); assert.equal((await detail(o.subId)).followUps.length, 0);
});
test("PostgreSQL future occurredAt rejected after authoritative subscription lock", async () => { const o = await owner(); assert.deepEqual(await service.execute(o.subId, "create", { followUpType: "check_in", occurredAt: at(1).toISOString() }, actor), fail("FOLLOW_UP_OCCURRED_AT_FUTURE")); });
test("PostgreSQL completing open follow-up resets baseline and appends exactly one event", async () => {
  const o = await owner(), item = await create(o.subId, { open: true }); const finish = repositoryAt(at(1)); assert.ok((await execute(item.id, { action: "complete" }, finish)).ok); const view = await detail(o.subId, finish), updated = view.followUps[0]!;
  assert.equal(updated.status, "done"); assert.equal(updated.completedAt, at(1).toISOString()); assert.equal(updated.nextAction, item.nextAction); assert.equal(updated.nextActionAt, item.nextActionAt); assert.equal(updated.events.length, 2); assert.equal(view.cadence.latestMeaningfulActivityAt, at(1).toISOString()); assert.equal(view.cadence.latestActivityType, "follow_up_completed");
});
test("PostgreSQL cancellation preserves original activity and next action; does not reset cadence", async () => {
  const o = await owner(), item = await create(o.subId, { open: true }), baseline = (await detail(o.subId)).cadence.latestMeaningfulActivityAt;
  assert.ok((await execute(item.id, { action: "cancel", reason: "Synthetic private cancellation" })).ok); const view = await detail(o.subId), updated = view.followUps[0]!; assert.equal(updated.status, "cancelled"); assert.equal(updated.cancelledAt, now.toISOString()); assert.equal(updated.completedAt, null); assert.equal(updated.nextAction, item.nextAction); assert.equal(updated.nextActionAt, item.nextActionAt); assert.equal(updated.events.length, 2); assert.equal(view.cadence.latestMeaningfulActivityAt, baseline);
});
for (const action of ["complete", "cancel"] as const) test(`PostgreSQL concurrent duplicate ${action} returns a stable conflict and one event`, async () => {
  const o = await owner(), item = await create(o.subId, { open: true }); const command: FollowUpCommand = action === "complete" ? { action } : { action, reason: "Synthetic cancellation" };
  const results = await Promise.all([execute(item.id, command), execute(item.id, command)]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "FOLLOW_UP_TRANSITION_INVALID")); assert.equal((await detail(o.subId)).followUps[0]?.events.length, 2);
});
test("PostgreSQL concurrent complete versus cancel finalizes one open follow-up only", async () => {
  const o = await owner(), item = await create(o.subId, { open: true }); const results = await Promise.all([execute(item.id, { action: "complete" }), execute(item.id, { action: "cancel", reason: "Synthetic cancellation" })]); assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await detail(o.subId)).followUps[0]?.events.length, 2);
});
test("PostgreSQL exactly at cadence deadline is due; one millisecond later overdue", async () => {
  const o = await owner({ start: at(-7) }); assert.equal((await detail(o.subId)).cadence.cadenceState, "due"); const later = await detail(o.subId, repositoryAt(new Date(now.getTime() + 1))); assert.equal(later.cadence.cadenceState, "overdue"); assert.equal(later.cadence.overdueByDays, 0);
});
test("PostgreSQL open next action derives overdue without persisting status/history on reads", async () => {
  const o = await owner(), item = await create(o.subId, { open: true, occurredAt: at(-2), nextAt: at(-1) }), before = await row(item.id), events = (await detail(o.subId)).followUps[0]!.events;
  const view = await detail(o.subId); assert.equal(view.followUps[0]?.effectiveStatus, "overdue"); assert.equal(view.followUps[0]?.status, "open"); assert.equal(view.cadence.cadenceState, "healthy"); await queue(); assert.deepEqual(await row(item.id), before); assert.deepEqual((await detail(o.subId)).followUps[0]?.events, events);
});
test("PostgreSQL exact next-action deadline is due and not overdue", async () => { const o = await owner(); await create(o.subId, { open: true, nextAt: now }); assert.equal((await detail(o.subId)).followUps[0]?.effectiveStatus, "due"); const item = (await queue()).find(i => i.subscriptionId === o.subId); assert.equal(item?.overdueNextActionCount, 0); });
test("PostgreSQL ongoing pause freezes active cadence elapsed time", async () => {
  const o = await owner({ start: at(-23), status: "paused" }); await pauses(o.subId, [{ start: at(-20), end: null }]); const first = await detail(o.subId), later = await detail(o.subId, repositoryAt(at(10))); assert.equal(first.cadence.activeElapsedMs, 3 * cadenceDayMs); assert.equal(later.cadence.activeElapsedMs, first.cadence.activeElapsedMs); assert.equal(first.cadence.cadenceState, null); assert.ok(!(await queue()).some(i => i.subscriptionId === o.subId));
});
test("PostgreSQL resume preserves four remaining active days after twenty paused days", async () => {
  const o = await owner({ start: at(-23) }); await pauses(o.subId, [{ start: at(-20), end: now }]); const view = await detail(o.subId); assert.equal(view.cadence.activeElapsedMs, 3 * cadenceDayMs); assert.equal(view.cadence.nextFollowUpDueAt, at(4).toISOString());
});
test("PostgreSQL multiple pauses subtract correctly", async () => {
  const o = await owner({ start: at(-10) }); await pauses(o.subId, [{ start: at(-8), end: at(-6) }, { start: at(-4), end: at(-2) }]); const view = await detail(o.subId); assert.equal(view.cadence.activeElapsedMs, 6 * cadenceDayMs); assert.equal(view.cadence.nextFollowUpDueAt, at(1).toISOString());
});
test("PostgreSQL overlapping pauses never double-freeze cadence", async () => {
  const o = await owner({ start: at(-10) }); await pauses(o.subId, [{ start: at(-8), end: at(-5) }, { start: at(-6), end: at(-4) }]); assert.equal((await detail(o.subId)).cadence.activeElapsedMs, 6 * cadenceDayMs);
});
test("PostgreSQL pause crossing latest activity baseline is clipped", async () => {
  const o = await owner({ start: at(-10) }); await create(o.subId, { occurredAt: at(-3) }); await pauses(o.subId, [{ start: at(-5), end: at(-2) }]); const view = await detail(o.subId); assert.equal(view.cadence.activeElapsedMs, 2 * cadenceDayMs); assert.equal(view.cadence.nextFollowUpDueAt, at(5).toISOString());
});
test("PostgreSQL overdue duration freezes for a pause after the original deadline", async () => {
  const o = await owner({ start: at(-20) }); await pauses(o.subId, [{ start: at(-10), end: at(-5) }]); const view = await detail(o.subId); assert.equal(view.cadence.nextFollowUpDueAt, at(-13).toISOString()); assert.equal(view.cadence.overdueByDays, 8);
});
test("PostgreSQL paused next action remains historically overdue without queue participation", async () => {
  const o = await owner(); await create(o.subId, { open: true, occurredAt: at(-2), nextAt: at(-1) }); await db.update(subscriptions).set({ status: "paused" }).where(eq(subscriptions.id, o.subId)); await pauses(o.subId, [{ start: at(-0.5), end: null }]); assert.equal((await detail(o.subId)).followUps[0]?.effectiveStatus, "overdue"); assert.ok(!(await queue()).some(i => i.subscriptionId === o.subId));
});
for (const status of ["onboarding", "awaiting_payment", "medical_clearance_required", "ready_to_start", "completion_due", "completed", "cancelled"]) test(`PostgreSQL ${status} excluded from cadence queue; history remains readable`, async () => {
  const o = await owner(); const item = await create(o.subId); await db.update(subscriptions).set({ status }).where(eq(subscriptions.id, o.subId)); assert.equal((await detail(o.subId)).followUps[0]?.id, item.id); assert.ok(!(await queue()).some(i => i.subscriptionId === o.subId)); assert.deepEqual(await service.execute(o.subId, "create", { followUpType: "check_in", occurredAt: at(-1).toISOString() }, actor), fail("FOLLOW_UP_SUBSCRIPTION_NOT_ACTIVE")); assert.deepEqual(await service.execute(o.subId, "cadence", { frequencyDays: 2 }, actor), fail("FOLLOW_UP_CADENCE_NOT_APPLICABLE"));
});
test("PostgreSQL cadence override may be configured while paused without lifecycle mutation", async () => {
  const o = await owner({ status: "paused" }); assert.ok((await service.execute(o.subId, "cadence", { frequencyDays: 5 }, actor)).ok); const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, o.subId)); assert.equal(sub?.status, "paused"); assert.equal((await detail(o.subId)).cadence.effectiveCadenceDays, 5);
});
test("PostgreSQL global queue prioritizes overdue, due, then nearest healthy deadline", async () => {
  const overdue = await owner({ start: at(-8) }), due = await owner({ start: at(-7) }), near = await owner({ start: at(-6) }), later = await owner({ start: at(-1) });
  const selected = new Set<string>([overdue.subId, due.subId, near.subId, later.subId]); assert.deepEqual((await queue()).filter(i => selected.has(i.subscriptionId)).map(i => i.subscriptionId), [overdue.subId, due.subId, near.subId, later.subId]);
});
test("PostgreSQL follow-up and cadence audits contain only structural metadata", async () => {
  const o = await owner(), item = await create(o.subId, { open: true }); await execute(item.id, { action: "cancel", reason: "Synthetic private cancellation" }); await service.execute(o.subId, "cadence", { frequencyDays: 2 }, actor);
  const audits = await db.select().from(auditEvents).where(inArray(auditEvents.entityId, [o.subId, item.id])); assert.equal(audits.length, 3); for (const event of audits) { const text = JSON.stringify(event.metadataJson); assert.ok(!text.includes("Synthetic")); assert.ok(!text.includes("note")); assert.ok(!text.includes("nextAction")); assert.ok(!text.includes("reason")); }
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
  } }); return new DrizzleFollowUpsRepository(database, options, () => new Date(now));
}
function isForeignKeyFailure(error: unknown): boolean { return !!error && typeof error === "object" && ("code" in error && error.code === "23503" || "cause" in error && error.cause !== error && isForeignKeyFailure(error.cause)); }
for (const action of ["create", "complete", "cancel", "cadence"] as const) test(`PostgreSQL real audit FK failure atomically rolls back ${action}`, async () => {
  const o = await owner(), item = action === "complete" || action === "cancel" ? await create(o.subId, { open: true }) : null, before = await detail(o.subId), broken = auditFailureRepository();
  const command: FollowUpCommand = action === "create" ? { action, followUpType: "check_in", occurredAt: at(-1), note: "Synthetic private rollback", nextAction: null, nextActionAt: null } : action === "cancel" ? { action, reason: "Synthetic rollback" } : action === "cadence" ? { action, frequencyDays: 2 } : { action };
  await assert.rejects(execute(item?.id ?? o.subId, command, broken), isForeignKeyFailure); assert.deepEqual(await detail(o.subId), before);
});

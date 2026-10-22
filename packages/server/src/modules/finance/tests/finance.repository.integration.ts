import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import type { FinanceDetail, CreateFinancePlanInput } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { users, auditEvents } from "../../../db/schema/auth.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { services } from "../../../db/schema/catalogue.js";
import { paymentPlans, installments, paymentEvents, paymentAllocations } from "../../../db/schema/finance.js";
import { DrizzleFinanceRepository } from "../repositories/finance.repository.js";
import { FinanceService, type FinanceCommand } from "../services/finance.service.js";

const userId = randomUUID(), customerId = randomUUID(), otherCustomerId = randomUUID(), serviceId = randomUUID(), subIds: string[] = [];
const now = new Date("2026-10-22T12:00:00.000Z"), at = (offset: number) => new Date(now.getTime() + offset);
const options = { auditHashPepper: "synthetic-finance-audit-pepper-at-least-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.61", userAgent: "synthetic-finance-tests" };
const repositoryAt = (time = now) => new DrizzleFinanceRepository(db, options, () => new Date(time));
const repo = repositoryAt(), service = new FinanceService(repo);
let safe = false;
before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev" && !target.search); safe = true;
  await db.insert(users).values({ id: userId, email: `finance-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values([{ id: customerId, fullName: "Synthetic Finance Customer", whatsapp: "+241000006161" }, { id: otherCustomerId, fullName: "Synthetic Other Finance Customer", whatsapp: "+241000006162" }]);
  await db.insert(services).values({ id: serviceId, name: "Synthetic Finance Service", slug: `finance-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
});
after(async () => {
  try {
    if (!safe) return;
    if (subIds.length) {
      const events = await db.selectDistinct({ id: paymentAllocations.paymentEventId }).from(paymentAllocations).where(inArray(paymentAllocations.subscriptionId, subIds));
      const plans = await db.select({ id: paymentPlans.id }).from(paymentPlans).where(inArray(paymentPlans.subscriptionId, subIds));
      await db.delete(paymentAllocations).where(inArray(paymentAllocations.subscriptionId, subIds));
      if (events.length) await db.delete(paymentEvents).where(inArray(paymentEvents.id, events.map(e => e.id)));
      if (plans.length) await db.delete(installments).where(inArray(installments.paymentPlanId, plans.map(p => p.id)));
      await db.delete(paymentPlans).where(inArray(paymentPlans.subscriptionId, subIds)); await db.delete(subscriptions).where(inArray(subscriptions.id, subIds));
    }
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId)); await db.delete(services).where(eq(services.id, serviceId));
    await db.delete(customers).where(inArray(customers.id, [customerId, otherCustomerId])); await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});
async function owner(amount = 10000, status = "active", customer = customerId) {
  const id = randomUUID(); subIds.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-FINANCE-${id}`, customerId: customer, serviceId, status, agreedPriceXaf: amount, createdByUserId: userId }); return id;
}
const execute = (id: string, command: FinanceCommand, repository = repo) => repository.execute(id, command, actor);
const call = (id: string, action: FinanceCommand["action"], input: unknown = {}, repository = repo) => new FinanceService(repository).execute(id, action, input, actor);
async function detail(id: string, repository = repo): Promise<FinanceDetail> {
  const result = await execute(id, { action: "read" }, repository); assert.ok(result.ok, JSON.stringify(result)); if (!result.ok) throw new Error("Missing finance detail"); return result.body.finance;
}
function schedule(amounts: number[], dueOffsets: number[] = amounts.map((_, index) => 1000 + index * 1000)): CreateFinancePlanInput {
  return { installments: amounts.map((amountXaf, index) => ({ amountXaf, dueDate: at(dueOffsets[index]!).toISOString() })) };
}
async function plan(id: string, amounts = [10000], dueOffsets?: number[], activate = true) {
  const created = await call(id, "create", schedule(amounts, dueOffsets)); assert.ok(created.ok, JSON.stringify(created)); if (!created.ok) throw new Error("Missing plan");
  const item = created.body.finance.plans.find(p => p.status === "draft"); assert.ok(item);
  if (activate) { const result = await call(item.id, "activate"); assert.ok(result.ok, JSON.stringify(result)); }
  return item;
}
async function pay(id: string, amountXaf: number, key = randomUUID(), repository = repo, extra: Record<string, unknown> = {}) {
  return call(id, "record", { amountXaf, paymentMethod: "cash", occurredAt: at(-1000).toISOString(), idempotencyKey: key, ...extra }, repository);
}
async function original(id: string, amount = 4000) { const result = await pay(id, amount); assert.ok(result.ok); if (!result.ok) throw new Error("Missing payment"); assert.ok(result.body.paymentEventId); return result.body.paymentEventId; }
const correction = (id: string, amountXaf: number, idempotencyKey = randomUUID(), repository = repo) => call(id, "correct", { amountXaf, occurredAt: now.toISOString(), idempotencyKey }, repository);
const fail = (error: string) => ({ ok: false, error });

test("PostgreSQL plan and explicit installments commit with authoritative total and audit", async () => {
  const id = await owner(), item = await plan(id, [4000, 6000]); const view = await detail(id); assert.equal(view.activePaymentPlan?.id, item.id); assert.equal(view.activePaymentPlan?.totalExpectedXaf, 10000); assert.deepEqual(view.activePaymentPlan?.installments.map(i => i.amountXaf), [4000, 6000]); assert.equal(view.financialStatus, "unpaid");
});
test("PostgreSQL exact installment sum mismatch writes zero financial rows", async () => {
  const id = await owner(); assert.deepEqual(await call(id, "create", schedule([9999])), fail("FINANCE_INSTALLMENTS_TOTAL_MISMATCH")); assert.equal((await detail(id)).plans.length, 0);
});
test("PostgreSQL zero-priced subscription is paid; empty schedule permitted without zero installment", async () => {
  const id = await owner(0); assert.equal((await detail(id)).financialStatus, "paid"); await plan(id, []); const view = await detail(id); assert.equal(view.plans[0]?.status, "settled"); assert.equal(view.plans[0]?.installments.length, 0); assert.deepEqual(await pay(id, 1), fail("FINANCE_PAYMENT_EXCEEDS_OUTSTANDING"));
});
for (const amountXaf of [0, -1, 1.5, 2147483648]) test(`PostgreSQL invalid installment ${amountXaf} never persists`, async () => {
  const id = await owner(); assert.deepEqual(await call(id, "create", schedule([amountXaf])), fail("FINANCE_INVALID_INPUT")); assert.equal((await detail(id)).plans.length, 0);
});
test("PostgreSQL concurrent create rejects duplicate draft rather than duplicate committed schedules", async () => {
  const id = await owner(), results = await Promise.all([call(id, "create", schedule([10000])), call(id, "create", schedule([10000]))]); assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await detail(id)).plans.length, 1);
});
test("PostgreSQL distinct plan activation contenders serialize to exactly one active plan", async () => {
  const id = await owner(), a = await plan(id, [10000], undefined, false);
  const [b] = await db.insert(paymentPlans).values({ subscriptionId: id, totalExpectedXaf: 10000, status: "draft" }).returning(); assert.ok(b);
  await db.insert(installments).values({ paymentPlanId: b.id, sequenceNumber: 1, amountXaf: 10000, dueDate: at(1000) });
  const results = await Promise.all([call(a.id, "activate"), call(b.id, "activate")]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "FINANCE_PLAN_ALREADY_ACTIVE")); assert.equal((await detail(id)).plans.filter(p => p.status === "active").length, 1);
});
test("PostgreSQL partial unique index prevents bypassing one-active-plan invariant", async () => {
  const id = await owner(); await plan(id);
  await assert.rejects(db.insert(paymentPlans).values({ subscriptionId: id, totalExpectedXaf: 10000, status: "active" }), error => code(error) === "23505");
});
test("PostgreSQL FIFO prioritizes due date before submitted sequence and permits partial payment", async () => {
  const id = await owner(); await plan(id, [6000, 4000], [2000, 1000]); await pay(id, 3000); const view = await detail(id);
  assert.equal(view.activePaymentPlan?.installments[0]?.sequenceNumber, 2); assert.equal(view.activePaymentPlan?.installments[0]?.paidXaf, 3000); assert.equal(view.activePaymentPlan?.installments[1]?.paidXaf, 0); assert.equal(view.remainingXaf, 7000);
});
test("PostgreSQL same-due FIFO uses sequence; payment spans installments", async () => {
  const id = await owner(); await plan(id, [4000, 6000], [1000, 1000]); await pay(id, 7000); const view = await detail(id);
  assert.deepEqual(view.activePaymentPlan?.installments.map(i => i.paidXaf), [4000, 3000]); assert.equal(view.paymentHistory[0]?.allocations.length, 2); assert.equal(view.financialStatus, "partially_paid");
});
test("PostgreSQL final payment settles plan and obligations", async () => {
  const id = await owner(); await plan(id, [4000, 6000]); await pay(id, 4000); await pay(id, 6000); const view = await detail(id);
  assert.equal(view.remainingXaf, 0); assert.equal(view.confirmedPaidXaf, 10000); assert.equal(view.financialStatus, "paid"); assert.equal(view.plans[0]?.status, "settled"); assert.equal(view.activePaymentPlan, null);
});
test("PostgreSQL overpayment rejects with no payment, allocation or cache changes", async () => {
  const id = await owner(); await plan(id); await pay(id, 4000); const before = await detail(id); assert.deepEqual(await pay(id, 6001), fail("FINANCE_PAYMENT_EXCEEDS_OUTSTANDING")); assert.deepEqual(await detail(id), before);
});
test("PostgreSQL replay returns original event even after plan settlement", async () => {
  const id = await owner(); await plan(id); const key = randomUUID(), first = await pay(id, 10000, key); assert.ok(first.ok);
  const retry = await pay(id, 10000, key); assert.ok(retry.ok); if (!first.ok || !retry.ok) return;
  assert.equal(retry.body.replayed, true); assert.equal(retry.body.paymentEventId, first.body.paymentEventId); assert.equal(retry.body.finance.paymentHistory.length, 1);
});
test("PostgreSQL idempotency rejects changed payload and cross-subscription/customer reuse", async () => {
  const id = await owner(), other = await owner(10000, "active", otherCustomerId); await plan(id); await plan(other); const key = randomUUID(); await pay(id, 4000, key);
  assert.deepEqual(await pay(id, 5000, key), fail("FINANCE_DUPLICATE_PAYMENT")); assert.deepEqual(await pay(other, 4000, key), fail("FINANCE_DUPLICATE_PAYMENT")); assert.equal((await detail(other)).paymentHistory.length, 0);
});
test("PostgreSQL equivalent normalized reference and timestamp replay same command", async () => {
  const id = await owner(); await plan(id); const key = randomUUID(); assert.ok((await pay(id, 4000, key, repo, { externalReference: "  ＲＥＦ-123  " })).ok);
  const replay = await pay(id, 4000, key, repo, { externalReference: "REF-123" }); assert.ok(replay.ok && replay.body.replayed); assert.equal((await detail(id)).paymentHistory[0]?.externalReference, "REF-123");
});
test("PostgreSQL concurrent same-key retry creates one payment/event allocation set", async () => {
  const id = await owner(); await plan(id); const key = randomUUID(), results = await Promise.all([pay(id, 10000, key), pay(id, 10000, key)]);
  assert.ok(results.every(r => r.ok)); assert.equal((await detail(id)).paymentHistory.length, 1);
});
test("PostgreSQL concurrent final-balance payments never allocate twice", async () => {
  const id = await owner(); await plan(id); const results = await Promise.all([pay(id, 10000), pay(id, 10000)]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "FINANCE_PAYMENT_EXCEEDS_OUTSTANDING")); assert.equal((await detail(id)).confirmedPaidXaf, 10000);
});
test("PostgreSQL DB command identity serializes different subscription locks", async () => {
  const a = await owner(), b = await owner(10000, "active", otherCustomerId); await plan(a); await plan(b); const key = randomUUID(), results = await Promise.all([pay(a, 10000, key), pay(b, 10000, key)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "FINANCE_DUPLICATE_PAYMENT")); assert.equal((await detail(a)).confirmedPaidXaf + (await detail(b)).confirmedPaidXaf, 10000);
});
test("PostgreSQL revision preserves historical installments and allocations without double-counting", async () => {
  const id = await owner(100000), old = await plan(id, [40000, 60000]); await pay(id, 40000);
  const beforeItems = await db.select().from(installments).where(eq(installments.paymentPlanId, old.id)); const beforeAllocations = await db.select().from(paymentAllocations).where(eq(paymentAllocations.subscriptionId, id));
  const revised = await call(old.id, "revise", schedule([20000, 40000])); assert.ok(revised.ok); const view = await detail(id);
  assert.equal(view.confirmedPaidXaf, 40000); assert.equal(view.remainingXaf, 60000); assert.equal(view.activePaymentPlan?.totalExpectedXaf, 60000); assert.equal(view.activePaymentPlan?.revisedFromPlanId, old.id); assert.equal(view.plans.find(p => p.id === old.id)?.status, "superseded");
  assert.deepEqual(await db.select().from(installments).where(eq(installments.paymentPlanId, old.id)), beforeItems); assert.deepEqual(await db.select().from(paymentAllocations).where(eq(paymentAllocations.subscriptionId, id)), beforeAllocations);
});
test("PostgreSQL stale revision totals reject without superseding or creating partial rows", async () => {
  const id = await owner(), old = await plan(id); await pay(id, 4000); const before = await detail(id);
  assert.deepEqual(await call(old.id, "revise", schedule([10000])), fail("FINANCE_INSTALLMENTS_TOTAL_MISMATCH")); assert.deepEqual(await detail(id), before);
});
test("PostgreSQL correction appends compensating allocations and preserves original event/allocations", async () => {
  const id = await owner(); await plan(id, [4000, 6000]); const eventId = await original(id, 7000);
  const [before] = await db.select().from(paymentEvents).where(eq(paymentEvents.id, eventId)); const originalRows = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentEventId, eventId));
  const result = await correction(eventId, 4000); assert.ok(result.ok); const view = await detail(id); assert.equal(view.confirmedPaidXaf, 3000); assert.equal(view.remainingXaf, 7000);
  assert.deepEqual(await db.select().from(paymentEvents).where(eq(paymentEvents.id, eventId)), [before]); assert.deepEqual(await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentEventId, eventId)), originalRows);
  assert.equal(view.paymentHistory.find(e => e.eventType === "payment_correction")?.correctionOfEventId, eventId); assert.ok(view.paymentHistory.flatMap(e => e.allocations).every(a => a.amountXaf > 0));
});
test("PostgreSQL partial correction reverses last original FIFO targets first", async () => {
  const id = await owner(); await plan(id, [4000, 6000]); const eventId = await original(id, 7000); await correction(eventId, 2000); const view = await detail(id);
  assert.deepEqual(view.activePaymentPlan?.installments.map(i => i.paidXaf), [4000, 1000]); assert.equal(view.paymentHistory.find(e => e.id === eventId)?.correctableXaf, 5000);
});
test("PostgreSQL correction cannot exceed uncompensated original or correct a correction", async () => {
  const id = await owner(); await plan(id); const eventId = await original(id); const result = await correction(eventId, 3000); assert.ok(result.ok); if (!result.ok) return;
  assert.deepEqual(await correction(eventId, 1001), fail("FINANCE_CORRECTION_INVALID")); assert.deepEqual(await correction(result.body.paymentEventId!, 1), fail("FINANCE_CORRECTION_INVALID"));
});
test("PostgreSQL concurrent correction cannot reverse the same amount twice", async () => {
  const id = await owner(); await plan(id); const eventId = await original(id); const results = await Promise.all([correction(eventId, 4000), correction(eventId, 4000)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await detail(id)).confirmedPaidXaf, 0); assert.equal((await detail(id)).paymentHistory.length, 2);
});
test("PostgreSQL correction retry is resolved before remaining compensation checks", async () => {
  const id = await owner(); await plan(id); const eventId = await original(id), key = randomUUID(); await correction(eventId, 4000, key); const retry = await correction(eventId, 4000, key);
  assert.ok(retry.ok && retry.body.replayed); assert.equal((await detail(id)).paymentHistory.length, 2);
});
test("PostgreSQL historical correction exposes gap, blocks new payment and explicit revision restores coverage", async () => {
  const id = await owner(100000), old = await plan(id, [40000, 60000]), eventId = await original(id, 40000); await call(old.id, "revise", schedule([60000]));
  await correction(eventId, 10000); const gap = await detail(id); assert.equal(gap.confirmedPaidXaf, 30000); assert.equal(gap.remainingXaf, 70000); assert.equal(gap.scheduleRequiresRevision, true);
  assert.equal(gap.hasOverdueInstallment, false); assert.deepEqual(await pay(id, 70000), fail("FINANCE_PLAN_TOTAL_MISMATCH"));
  const activeId = gap.activePaymentPlan!.id; assert.ok((await call(activeId, "revise", schedule([70000]))).ok); assert.equal((await detail(id)).scheduleRequiresRevision, false); assert.ok((await pay(id, 70000)).ok); assert.equal((await detail(id)).remainingXaf, 0);
});
test("PostgreSQL successful payment replay survives later revision gap", async () => {
  const id = await owner(100000), old = await plan(id, [100000]), key = randomUUID(); const originalResult = await pay(id, 40000, key); assert.ok(originalResult.ok); if (!originalResult.ok) return;
  await call(old.id, "revise", schedule([60000])); await correction(originalResult.body.paymentEventId!, 10000);
  const replay = await pay(id, 40000, key); assert.ok(replay.ok && replay.body.replayed); assert.equal((await detail(id)).confirmedPaidXaf, 30000);
});
test("PostgreSQL settled correction does not reopen plan; explicit replacement retains lineage", async () => {
  const id = await owner(), old = await plan(id), eventId = await original(id, 10000); await correction(eventId, 4000); const view = await detail(id);
  assert.equal(view.plans[0]?.status, "settled"); assert.equal(view.activePaymentPlan, null); assert.equal(view.scheduleRequiresRevision, true); assert.equal(view.canCreatePlan, true);
  const replacement = await plan(id, [4000]); assert.equal((await detail(id)).activePaymentPlan?.revisedFromPlanId, old.id); assert.notEqual(replacement.id, old.id);
});
test("PostgreSQL plan cancellation never waives debt or erases paid history", async () => {
  const id = await owner(), old = await plan(id), eventId = await original(id); await call(old.id, "cancel"); await correction(eventId, 1000); const view = await detail(id);
  assert.equal(view.plans[0]?.status, "cancelled"); assert.equal(view.confirmedPaidXaf, 3000); assert.equal(view.remainingXaf, 7000); assert.equal(view.activePaymentPlan, null); assert.deepEqual(await pay(id, 1000), fail("FINANCE_INVALID_STATE"));
  assert.deepEqual(await call(old.id, "activate"), fail("FINANCE_INVALID_STATE")); await plan(id, [7000]); assert.equal((await detail(id)).activePaymentPlan?.revisedFromPlanId, old.id);
});
for (const status of ["onboarding", "awaiting_payment", "paused", "completion_due", "completed", "cancelled"]) test(`PostgreSQL finance never modifies ${status} subscription lifecycle`, async () => {
  const id = await owner(10000, status); const [before] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)); await plan(id); const eventId = await original(id); await correction(eventId, 1000);
  assert.deepEqual(await db.select().from(subscriptions).where(eq(subscriptions.id, id)), [before]);
});
test("PostgreSQL due and overdue derive at read time without cache writes", async () => {
  const id = await owner(), item = await plan(id, [10000], [0]); const before = await db.select().from(installments).where(eq(installments.paymentPlanId, item.id));
  assert.equal((await detail(id, repositoryAt(at(-1)))).activePaymentPlan?.installments[0]?.effectiveStatus, "upcoming"); assert.equal((await detail(id)).activePaymentPlan?.installments[0]?.effectiveStatus, "due");
  const later = await detail(id, repositoryAt(at(1))); assert.equal(later.activePaymentPlan?.installments[0]?.effectiveStatus, "overdue"); assert.equal(later.hasOverdueInstallment, true); assert.equal(later.financialStatus, "unpaid"); assert.deepEqual(await db.select().from(installments).where(eq(installments.paymentPlanId, item.id)), before);
});
test("PostgreSQL superseded overdue installment does not make current future schedule overdue", async () => {
  const id = await owner(), old = await plan(id, [10000], [-1000]); assert.equal((await detail(id)).hasOverdueInstallment, true); await call(old.id, "revise", schedule([10000])); assert.equal((await detail(id)).hasOverdueInstallment, false);
});
test("PostgreSQL audit metadata excludes references, customer PII and free text", async () => {
  const id = await owner(); await plan(id); const paid = await pay(id, 4000, randomUUID(), repo, { externalReference: "Synthetic private bank reference" }); assert.ok(paid.ok); if (!paid.ok) return; await correction(paid.body.paymentEventId!, 1000);
  const safeKeys = new Set(["subscriptionId", "paymentPlanId", "revisedFromPlanId", "paymentEventId", "correctionOfEventId", "amountXaf", "currency", "paymentMethod", "allocationCount", "fromStatus", "toStatus"]);
  const rows = await db.select().from(auditEvents).where(eq(auditEvents.actorUserId, userId)); const relevant = rows.filter(row => row.metadataJson && typeof row.metadataJson === "object" && "subscriptionId" in row.metadataJson && row.metadataJson.subscriptionId === id); assert.equal(relevant.length, 4);
  for (const row of relevant) { assert.ok(Object.keys(row.metadataJson ?? {}).every(key => safeKeys.has(key))); const text = JSON.stringify(row.metadataJson); assert.ok(!text.includes("Synthetic") && !text.includes("externalReference") && !text.includes("reason")); }
});
function code(error: unknown): string | null { return error && typeof error === "object" ? "code" in error && typeof error.code === "string" ? error.code : "cause" in error && error.cause !== error ? code(error.cause) : null : null; }
function auditFailureRepository() {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, { get(target, key, receiver) {
    if (key === "transaction") return <T>(work: (tx: Tx) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, { get(transaction, member, txReceiver) {
      if (member === "insert") return (table: Parameters<Tx["insert"]>[0]) => {
        const insert = transaction.insert(table); if (table !== auditEvents) return insert;
        return new Proxy(insert, { get(builder, method, builderReceiver) { if (method === "values") return (value: Record<string, unknown>) => Reflect.apply(builder.values, builder, [{ ...value, actorUserId: randomUUID() }]); return Reflect.get(builder, method, builderReceiver); } });
      }; return Reflect.get(transaction, member, txReceiver);
    } })), config); return Reflect.get(target, key, receiver);
  } }); return new DrizzleFinanceRepository(database, options, () => new Date(now));
}
for (const action of ["create", "activate", "revise", "cancel", "record", "correct"] as const) test(`PostgreSQL real audit FK failure rolls back ${action}, allocations, keys and cached states`, async () => {
  const id = await owner(); let targetId: string = id;
  if (action !== "create") { const item = await plan(id, [10000], undefined, action !== "activate"); targetId = action === "record" ? id : item.id; if (action === "correct") targetId = await original(id); }
  const before = await detail(id), broken = auditFailureRepository();
  const input = action === "create" || action === "revise" ? schedule([10000]) : action === "record" ? { amountXaf: 1000, paymentMethod: "cash", occurredAt: now.toISOString(), idempotencyKey: randomUUID() } : action === "correct" ? { amountXaf: 1000, occurredAt: now.toISOString(), idempotencyKey: randomUUID() } : {};
  await assert.rejects(call(targetId, action, input, broken), error => code(error) === "23503"); assert.deepEqual(await detail(id), before);
});

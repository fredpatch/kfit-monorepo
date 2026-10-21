import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { servicePolicies, services, serviceVariants } from "../../../db/schema/catalogue.js";
import { customers, subscriptions, subscriptionStatusHistory } from "../../../db/schema/customers.js";
import { onboardingItems, consentDefinitions, consentRecords } from "../../../db/schema/onboarding.js";
import { DrizzleConsentRepository } from "../../consents/repositories/consent.repository.js";
import { DrizzleOnboardingRepository } from "../repositories/onboarding.repository.js";
import type { OnboardingCommand } from "../services/onboarding.service.js";

const userId = randomUUID(); const customerId = randomUUID();
const serviceIds: string[] = []; const subscriptionIds: string[] = [];
const options = { auditHashPepper: "synthetic-onboarding-integration-pepper-at-least-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.1", userAgent: "synthetic-onboarding" };
const repository = new DrizzleOnboardingRepository(db, options);
const consents = new DrizzleConsentRepository(db, options);
const definitionIds: string[] = [];
const future = () => new Date(Date.now() + 86400000);
let safeTarget = false;
before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433", "onboarding integration requires disposable local PostgreSQL on port 5433");
  safeTarget = true;
  await db.insert(users).values({ id: userId, email: `onboarding-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Onboarding Customer", whatsapp: "+241" + String(BigInt("0x" + customerId.replaceAll("-", "").slice(0,12)) % 1000000000000n).padStart(12,"0") });
  const existing = await db.select().from(consentDefinitions);
  for (const consentType of ["service_terms", "privacy_notice"] as const) {
    const version = (existing.filter(d => d.consentType === consentType).reduce((max, row) => BigInt(row.version) > max ? BigInt(row.version) : max, 0n) + 1n).toString();
    const result = await consents.saveDefinition({ consentType, version, title: "Synthetic onboarding test definition", content: "SYNTHETIC TEST ONLY. No legal validity.", publish: true });
    assert.ok(result.ok); if (result.ok) definitionIds.push(result.definition.id);
  }
});
after(async () => {
  try {
    if (!safeTarget) return;
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    if (subscriptionIds.length) {
      await db.delete(consentRecords).where(inArray(consentRecords.subscriptionId, subscriptionIds));
      await db.delete(onboardingItems).where(inArray(onboardingItems.subscriptionId, subscriptionIds));
      await db.delete(subscriptionStatusHistory).where(inArray(subscriptionStatusHistory.subscriptionId, subscriptionIds));
      await db.delete(subscriptions).where(inArray(subscriptions.id, subscriptionIds));
    }
    if (serviceIds.length) {
      await db.delete(servicePolicies).where(inArray(servicePolicies.serviceId, serviceIds));
      await db.delete(serviceVariants).where(inArray(serviceVariants.serviceId, serviceIds));
      await db.delete(services).where(inArray(services.id, serviceIds));
    }
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(eq(users.id, userId));
    if (definitionIds.length) await db.delete(consentDefinitions).where(inArray(consentDefinitions.id, definitionIds));
  } finally { await pool.end(); }
});

async function makePool(config: { limited?: boolean; limit?: number; variantLimit?: number; serviceQuestionnaire?: boolean; variantQuestionnaire?: boolean; medical?: string } = {}) {
  const serviceId = randomUUID(); const variantId = randomUUID(); const otherVariantId = randomUUID(); serviceIds.push(serviceId);
  await db.insert(services).values({ id: serviceId, name: "Synthetic Onboarding Service", slug: `onboarding-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: config.limited ? "limited" : "unlimited", capacityLimit: config.limited ? config.limit ?? 1 : null });
  await db.insert(serviceVariants).values([
    { id: variantId, serviceId, name: "Selected", slug: `selected-${variantId}`, capacityLimit: config.variantLimit ?? null },
    { id: otherVariantId, serviceId, name: "Other", slug: `other-${otherVariantId}` },
  ]);
  await db.insert(servicePolicies).values({ serviceId, variantId: null, questionnaireTemplateId: config.serviceQuestionnaire ? randomUUID() : null, medicalClearancePolicy: config.medical ?? "required_if_risk_flag" });
  if (config.variantQuestionnaire !== undefined) await db.insert(servicePolicies).values({ serviceId, variantId, questionnaireTemplateId: config.variantQuestionnaire ? randomUUID() : null, medicalClearancePolicy: "not_required" });
  return { serviceId, variantId, otherVariantId };
}
async function makeSubscription(owner: Awaited<ReturnType<typeof makePool>>, config: { until?: Date; status?: string; variantId?: string; noStart?: boolean } = {}) {
  const id = randomUUID(); subscriptionIds.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-ONBOARDING-${id}`, customerId, serviceId: owner.serviceId, variantId: config.variantId ?? owner.variantId,
    status: config.status ?? "onboarding", agreedPriceXaf: 45000, currency: "XAF", plannedStartDate: config.noStart ? null : future(), capacityReservedUntil: config.until ?? null, createdByUserId: userId });
  return id;
}
async function execute(id: string, command: OnboardingCommand = { action: "read" }, repo = repository) {
  return repo.execute(id, command, actor);
}
async function detail(id: string) {
  const result = await execute(id); assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected onboarding detail");
  return result.onboarding;
}
async function initialize(id: string) { assert.equal((await execute(id, { action: "initialize" })).status, "ok"); return detail(id); }
async function itemId(id: string, type: string) {
  const item = (await detail(id)).items.find(item => item.itemType === type); assert.ok(item); return item.id;
}
// Questionnaire completion remains a future-workflow fixture; terms use real S4.4 evidence.
async function futureWorkflowComplete(id: string) {
  assert.equal((await consents.execute(id, { action: "capture", decisions: { service_terms: "granted", privacy_notice: "granted" }, expectedDefinitionIds: definitionIds }, actor)).ok, true);
  await db.update(onboardingItems).set({ status: "completed", completedAt: new Date() }).where(and(eq(onboardingItems.subscriptionId, id), eq(onboardingItems.itemType, "questionnaire")));
}
async function satisfy(id: string) {
  await initialize(id); await futureWorkflowComplete(id);
  assert.equal((await execute(id, { action: "complete", itemId: await itemId(id, "payment_condition") })).status, "ok");
}
async function events(id: string) { return db.select().from(auditEvents).where(eq(auditEvents.entityId, id)); }

test("PostgreSQL checklist initializes correct blocking rows and system-owned completed start, without speculative medical item", async () => {
  const id = await makeSubscription(await makePool()); const view = await initialize(id);
  assert.equal(view.initialized, true); assert.equal(view.onboardingState, "blocked");
  assert.deepEqual(view.items.map(item => item.itemType), ["payment_condition", "service_terms", "start_date_confirmed"]);
  assert.ok(view.items.every(item => item.isBlocking));
  const start = view.items.find(item => item.itemType === "start_date_confirmed");
  assert.equal(start?.status, "completed"); assert.ok(start?.completedAt); assert.equal(start?.owner, "system"); assert.equal(start?.canComplete, false);
});
test("PostgreSQL retry/concurrent checklist initialization is idempotent and relational uniqueness guards all statuses", async () => {
  const id = await makeSubscription(await makePool());
  const results = await Promise.all([execute(id, { action: "initialize" }), execute(id, { action: "initialize" })]);
  assert.ok(results.every(result => result.status === "ok"));
  await execute(id, { action: "complete", itemId: await itemId(id, "payment_condition") }); await initialize(id);
  assert.equal((await detail(id)).items.length, 3);
  assert.equal((await detail(id)).items.find(item => item.itemType === "payment_condition")?.status, "completed");
  assert.equal((await events(id)).filter(event => event.eventType === "subscription.onboarding_initialized").length, 1);
  await assert.rejects(db.insert(onboardingItems).values({ subscriptionId: id, itemType: "payment_condition", label: "Duplicate synthetic item" }), error => {
    const cause = error instanceof Error ? error.cause : null; return !!cause && typeof cause === "object" && "code" in cause && cause.code === "23505";
  });
});
test("PostgreSQL variant policy overrides service policy as a whole", async () => {
  const id = await makeSubscription(await makePool({ serviceQuestionnaire: true, variantQuestionnaire: false }));
  const view = await initialize(id); assert.equal(view.policy.source, "variant"); assert.equal(view.policy.questionnaireRequired, false); assert.equal(view.items.length, 3);
});
test("PostgreSQL service policy fallback creates questionnaire only when referenced", async () => {
  const id = await makeSubscription(await makePool({ serviceQuestionnaire: true, medical: "not_required" }));
  const view = await initialize(id); assert.equal(view.policy.source, "service"); assert.equal(view.policy.questionnaireRequired, true);
  assert.equal(view.items.length, 4); assert.equal(view.items.find(item => item.itemType === "questionnaire")?.owner, "questionnaire");
  assert.ok(!view.items.some(item => item.itemType === "medical_clearance"));
});
test("PostgreSQL unlimited readiness needs no reservation and does not activate", async () => {
  const id = await makeSubscription(await makePool()); await satisfy(id);
  const view = await detail(id); assert.equal(view.capacity.valid, true); assert.equal(view.capacity.limit, null); assert.equal(view.canReady, true);
  const result = await execute(id, { action: "ready" }); assert.equal(result.status, "ok");
  assert.equal((await detail(id)).subscription.status, "ready_to_start"); assert.equal((await detail(id)).subscription.capacityReservedUntil, null);
});
test("PostgreSQL limited subscription cannot become ready without a valid explicit reservation", async () => {
  const id = await makeSubscription(await makePool({ limited: true })); await satisfy(id);
  assert.equal((await detail(id)).onboardingState, "blocked");
  assert.deepEqual(await execute(id, { action: "ready" }), { status: "capacity_required" });
  assert.deepEqual(await execute(id, { action: "reserve", until: new Date(0) }), { status: "capacity_invalid" });
  assert.equal((await detail(id)).subscription.status, "onboarding");
});
test("PostgreSQL reservation set/extend is audited and retains lifecycle", async () => {
  const id = await makeSubscription(await makePool({ limited: true })); const until = future(); const extended = new Date(until.getTime() + 86400000);
  assert.equal((await execute(id, { action: "reserve", until })).status, "ok");
  assert.equal((await execute(id, { action: "reserve", until: extended })).status, "ok");
  const view = await detail(id); assert.equal(view.subscription.capacityReservedUntil, extended.toISOString()); assert.equal(view.subscription.status, "onboarding");
  const audits = await events(id); assert.equal(audits.length, 2); assert.ok(audits.every(event => event.eventType === "subscription.capacity_reserved"));
  assert.deepEqual(audits[0]?.metadataJson, { capacityScope: "service", capacityLimit: 1 });
});
test("PostgreSQL expired reservation derives stalled without any read-time lifecycle/history/audit mutation", async () => {
  const id = await makeSubscription(await makePool({ limited: true }), { until: new Date(Date.now() - 1000) }); await satisfy(id);
  const before = await events(id); const view = await detail(id); assert.equal(view.onboardingState, "stalled"); assert.equal(view.capacity.expired, true); assert.equal(view.canReady, false);
  assert.deepEqual(await execute(id, { action: "ready" }), { status: "capacity_required" });
  assert.equal((await detail(id)).subscription.status, "onboarding"); assert.equal((await events(id)).length, before.length);
  assert.equal((await db.select().from(subscriptionStatusHistory).where(eq(subscriptionStatusHistory.subscriptionId, id))).length, 0);
  assert.equal((await execute(id, { action: "reserve", until: future() })).status, "ok"); assert.equal((await detail(id)).onboardingState, "ready");
});
test("PostgreSQL payment condition is manually completable once with safe audit", async () => {
  const id = await makeSubscription(await makePool()); await initialize(id); const payment = await itemId(id, "payment_condition");
  assert.equal((await execute(id, { action: "complete", itemId: payment })).status, "ok");
  assert.deepEqual(await execute(id, { action: "complete", itemId: payment }), { status: "item_resolved" });
  const item = (await detail(id)).items.find(item => item.id === payment); assert.equal(item?.status, "completed"); assert.ok(item?.completedAt);
  const audit = (await events(id)).find(event => event.eventType === "subscription.onboarding_item_completed");
  assert.deepEqual(audit?.metadataJson, { itemType: "payment_condition", fromStatus: "pending", toStatus: "completed" });
});
test("PostgreSQL forbids manual completion of system, terms, questionnaire and medical items", async () => {
  const id = await makeSubscription(await makePool({ serviceQuestionnaire: true })); await initialize(id);
  await db.insert(onboardingItems).values({ subscriptionId: id, itemType: "medical_clearance", label: "Synthetic future medical blocker" });
  const before = (await events(id)).length;
  for (const type of ["start_date_confirmed", "service_terms", "questionnaire", "medical_clearance"]) assert.deepEqual(await execute(id, { action: "complete", itemId: await itemId(id, type) }), { status: "item_forbidden" });
  assert.equal((await events(id)).length, before);
});
for (const type of ["questionnaire", "payment_condition"]) {
  test(`PostgreSQL ${type} waiver requires a reason, persists it only on item, and audits structural metadata`, async () => {
    const id = await makeSubscription(await makePool({ serviceQuestionnaire: true })); await initialize(id); const item = await itemId(id, type);
    assert.deepEqual(await execute(id, { action: "waive", itemId: item, reason: " " }), { status: "reason_required" });
    const reason = "Synthetic private waiver explanation";
    assert.equal((await execute(id, { action: "waive", itemId: item, reason })).status, "ok");
    const row = (await detail(id)).items.find(value => value.id === item); assert.equal(row?.waiverReason, reason); assert.ok(row?.waivedAt);
    const audit = (await events(id)).find(event => event.eventType === "subscription.onboarding_item_waived");
    assert.deepEqual(audit?.metadataJson, { itemType: type, fromStatus: "pending", toStatus: "waived" });
    assert.ok(!JSON.stringify(audit?.metadataJson).includes(reason));
  });
}
for (const type of ["service_terms", "medical_clearance", "start_date_confirmed"]) {
  test(`PostgreSQL ${type} cannot be waived`, async () => {
    const id = await makeSubscription(await makePool()); await initialize(id);
    if (type === "medical_clearance") await db.insert(onboardingItems).values({ subscriptionId: id, itemType: type, label: "Synthetic future medical item" });
    assert.deepEqual(await execute(id, { action: "waive", itemId: await itemId(id, type), reason: "Synthetic reason" }), { status: "item_forbidden" });
  });
}
test("PostgreSQL ready rejects remaining blockers and missing initialization/start without lifecycle writes", async () => {
  const owner = await makePool(); const id = await makeSubscription(owner); await initialize(id);
  assert.deepEqual(await execute(id, { action: "ready" }), { status: "blocked" });
  const empty = await makeSubscription(owner); assert.deepEqual(await execute(empty, { action: "ready" }), { status: "blocked" });
  const noStart = await makeSubscription(owner, { noStart: true }); assert.deepEqual(await execute(noStart, { action: "initialize" }), { status: "start_date_required" });
  assert.deepEqual(await execute(noStart, { action: "ready" }), { status: "start_date_required" });
  assert.equal((await detail(id)).subscription.status, "onboarding");
});
test("PostgreSQL ready hard commit writes status, one append-only history and one safe audit", async () => {
  const id = await makeSubscription(await makePool({ limited: true })); await satisfy(id); await execute(id, { action: "reserve", until: future() });
  assert.equal((await execute(id, { action: "ready" })).status, "ok");
  assert.deepEqual(await execute(id, { action: "ready" }), { status: "invalid_state" });
  const history = await db.select().from(subscriptionStatusHistory).where(eq(subscriptionStatusHistory.subscriptionId, id));
  assert.equal(history.length, 1); assert.equal(history[0]?.fromStatus, "onboarding"); assert.equal(history[0]?.toStatus, "ready_to_start"); assert.equal(history[0]?.changedByUserId, userId);
  const audits = (await events(id)).filter(event => event.eventType === "subscription.ready_to_start");
  assert.equal(audits.length, 1); assert.deepEqual(audits[0]?.metadataJson, { fromStatus: "onboarding", toStatus: "ready_to_start" });
});

function auditFailureRepository() {
  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, { get(target, key, receiver) {
    if (key === "transaction") return <T>(work: (tx: Transaction) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, { get(transaction, member, txReceiver) {
      if (member === "insert") return (table: Parameters<Transaction["insert"]>[0]) => {
        const insert = transaction.insert(table); if (table !== auditEvents) return insert;
        return new Proxy(insert, { get(builder, method, builderReceiver) {
          if (method === "values") return (value: Record<string, unknown>) => Reflect.apply(builder.values, builder, [{ ...value, actorUserId: randomUUID() }]);
          return Reflect.get(builder, method, builderReceiver);
        } });
      };
      return Reflect.get(transaction, member, txReceiver);
    } })), config);
    return Reflect.get(target, key, receiver);
  } });
  return new DrizzleOnboardingRepository(database, options);
}
for (const action of ["initialize", "complete", "waive", "reserve", "ready"] as const) {
  test(`PostgreSQL real audit FK failure rolls back ${action}`, async () => {
    const id = await makeSubscription(await makePool({ limited: true }));
    if (action !== "initialize") await initialize(id);
    if (action === "ready") { await satisfy(id); await execute(id, { action: "reserve", until: future() }); }
    const before = await detail(id); const beforeEvents = await events(id);
    let command: OnboardingCommand;
    if (action === "complete") command = { action, itemId: await itemId(id, "payment_condition") };
    else if (action === "waive") command = { action, itemId: await itemId(id, "payment_condition"), reason: "Synthetic reason" };
    else command = action === "reserve" ? { action, until: future() } : { action };
    await assert.rejects(execute(id, command, auditFailureRepository()), error => { const cause = error instanceof Error ? error.cause : null; return !!cause && typeof cause === "object" && "code" in cause && cause.code === "23503"; });
    assert.deepEqual(await detail(id), before); assert.equal((await events(id)).length, beforeEvents.length);
    assert.equal((await db.select().from(subscriptionStatusHistory).where(eq(subscriptionStatusHistory.subscriptionId, id))).length, 0);
  });
}
test("PostgreSQL two concurrent final-slot reservations cannot both claim capacity", async () => {
  const owner = await makePool({ limited: true }); const first = await makeSubscription(owner); const second = await makeSubscription(owner);
  const results = await Promise.all([execute(first, { action: "reserve", until: future() }), execute(second, { action: "reserve", until: future() })]);
  assert.deepEqual(results.map(result => result.status).sort(), ["capacity_exhausted", "ok"]);
  const rows = await db.select().from(subscriptions).where(inArray(subscriptions.id, [first, second])); assert.equal(rows.filter(row => row.capacityReservedUntil !== null).length, 1);
});
test("PostgreSQL concurrent ready attempts cannot advance two subscriptions already competing for the final slot", async () => {
  const owner = await makePool({ limited: true });
  // Simulate imported oversubscribed holds. Neither may steal the other's still-valid claim.
  const first = await makeSubscription(owner, { until: future() }); const second = await makeSubscription(owner, { until: future() }); await satisfy(first); await satisfy(second);
  const results = await Promise.all([execute(first, { action: "ready" }), execute(second, { action: "ready" })]);
  assert.ok(results.every(result => result.status === "capacity_exhausted"));
  assert.equal((await detail(first)).subscription.status, "onboarding"); assert.equal((await detail(second)).subscription.status, "onboarding");
});
test("PostgreSQL concurrent ready and reservation commands share the capacity-owner lock", async () => {
  const owner = await makePool({ limited: true }); const first = await makeSubscription(owner); const second = await makeSubscription(owner); await satisfy(first); await execute(first, { action: "reserve", until: future() });
  const [ready, claim] = await Promise.all([execute(first, { action: "ready" }), execute(second, { action: "reserve", until: future() })]);
  assert.equal(ready.status, "ok"); assert.equal(claim.status, "capacity_exhausted");
});
test("PostgreSQL selected variant limit overrides service capacity and service fallback shares across variants", async () => {
  const owner = await makePool({ limited: true, limit: 1, variantLimit: 2 });
  const first = await makeSubscription(owner); const second = await makeSubscription(owner); const third = await makeSubscription(owner);
  assert.equal((await execute(first, { action: "reserve", until: future() })).status, "ok"); assert.equal((await execute(second, { action: "reserve", until: future() })).status, "ok");
  assert.equal((await detail(first)).capacity.scope, "variant"); assert.equal((await detail(first)).capacity.limit, 2);
  assert.equal((await execute(third, { action: "reserve", until: future() })).status, "capacity_exhausted");
  const fallback = await makePool({ limited: true, limit: 1 }); const left = await makeSubscription(fallback); const right = await makeSubscription(fallback, { variantId: fallback.otherVariantId });
  const results = await Promise.all([execute(left, { action: "reserve", until: future() }), execute(right, { action: "reserve", until: future() })]);
  assert.deepEqual(results.map(result => result.status).sort(), ["capacity_exhausted", "ok"]);
});
test("PostgreSQL capacity counts ready/active and live onboarding holds, excluding expired or cancelled claims", async () => {
  const owner = await makePool({ limited: true, limit: 3 });
  await makeSubscription(owner, { status: "ready_to_start" }); await makeSubscription(owner, { status: "active" }); await makeSubscription(owner, { status: "onboarding", until: future() });
  await makeSubscription(owner, { status: "onboarding", until: new Date(0) }); await makeSubscription(owner, { status: "cancelled", until: future() });
  const id = await makeSubscription(owner); assert.equal((await detail(id)).capacity.occupied, 3); assert.equal((await execute(id, { action: "reserve", until: future() })).status, "capacity_exhausted");
});
test("PostgreSQL item belongs to its subscription and terminal lifecycle cannot be mutated", async () => {
  const owner = await makePool(); const first = await makeSubscription(owner); const second = await makeSubscription(owner); await initialize(first); await initialize(second);
  assert.deepEqual(await execute(first, { action: "complete", itemId: await itemId(second, "payment_condition") }), { status: "item_not_found" });
  const active = await makeSubscription(owner, { status: "active" });
  for (const action of ["initialize", "ready"] as const) assert.deepEqual(await execute(active, { action }), { status: "invalid_state" });
});

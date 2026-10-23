import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { services, serviceVariants } from "../../../db/schema/catalogue.js";
import { customers, subscriptions, subscriptionComponents, subscriptionPauses, subscriptionStatusHistory } from "../../../db/schema/customers.js";
import { consentDefinitions, consentRecords, medicalClearanceRecords, onboardingItems } from "../../../db/schema/onboarding.js";
import { questionnaireSubmissions, questionnaireTemplates } from "../../../db/schema/questionnaires.js";
import { DrizzleConsentRepository } from "../../consents/repositories/consent.repository.js";
import { DrizzleOnboardingRepository } from "../../onboarding/repositories/onboarding.repository.js";
import { DrizzleSubscriptionsRepository } from "../repositories/subscriptions.repository.js";
import { subscriptionFollowUpCadenceHistory } from "../../../db/schema/coaching.js";
import type { LifecycleCommand } from "../services/subscriptions.service.js";

const userId = randomUUID(), customerId = randomUUID(), serviceId = randomUUID(), variantId = randomUUID(), templateId = randomUUID();
const ids: string[] = [], definitions: string[] = [];
const options = { auditHashPepper: "synthetic-lifecycle-pepper-at-least-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.1", userAgent: "synthetic-lifecycle" };
const repo = new DrizzleSubscriptionsRepository(db, options), consents = new DrizzleConsentRepository(db, options);
const future = (days = 100) => new Date(Date.now() + days * 86400000);
const past = () => new Date(Date.now() - 86400000);
let safe = false;
before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev", "requires disposable localhost:5433/kfit_dev"); safe = true;
  await db.insert(users).values({ id: userId, email: `lifecycle-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Lifecycle Customer", whatsapp: "+241000009999" });
  await db.insert(services).values({ id: serviceId, name: "Synthetic Lifecycle", slug: `lifecycle-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "limited", capacityLimit: 1, defaultDurationValue: 999, defaultDurationUnit: "day" });
  await db.insert(serviceVariants).values({ id: variantId, serviceId, name: "Synthetic variant", slug: `lifecycle-${variantId}`, durationValue: 999, durationUnit: "day" });
  await db.insert(questionnaireTemplates).values({ id: templateId, templateKey: `lifecycle-${templateId}`, name: "Synthetic historical questionnaire", category: "assessment", version: 1, status: "published", publishedAt: new Date() });
  const existing = await db.select().from(consentDefinitions);
  for (const consentType of ["service_terms", "privacy_notice"] as const) {
    const version = (existing.filter(d => d.consentType === consentType).reduce((max, d) => BigInt(d.version) > max ? BigInt(d.version) : max, 0n) + 1n).toString();
    const result = await consents.saveDefinition({ consentType, version, title: "Synthetic lifecycle terms", content: "SYNTHETIC TEST ONLY. No legal validity.", publish: true });
    assert.ok(result.ok); if (result.ok) definitions.push(result.definition.id);
  }
});
after(async () => {
  try {
    if (!safe) return;
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    const all = await db.select({ id: subscriptions.id, parent: subscriptions.renewedFromSubscriptionId }).from(subscriptions).where(eq(subscriptions.customerId, customerId));
    const allIds = all.map(s => s.id);
    if (allIds.length) {
      await db.delete(subscriptionFollowUpCadenceHistory).where(inArray(subscriptionFollowUpCadenceHistory.subscriptionId, allIds));
      await db.delete(consentRecords).where(inArray(consentRecords.subscriptionId, allIds));
      await db.delete(medicalClearanceRecords).where(inArray(medicalClearanceRecords.subscriptionId, allIds));
      await db.delete(questionnaireSubmissions).where(inArray(questionnaireSubmissions.subscriptionId, allIds));
      await db.delete(onboardingItems).where(inArray(onboardingItems.subscriptionId, allIds));
      await db.delete(subscriptionPauses).where(inArray(subscriptionPauses.subscriptionId, allIds));
      await db.delete(subscriptionStatusHistory).where(inArray(subscriptionStatusHistory.subscriptionId, allIds));
      await db.delete(subscriptionComponents).where(inArray(subscriptionComponents.subscriptionId, allIds));
      // Children first: the self-FK intentionally restricts parent deletion.
      await db.delete(subscriptions).where(inArray(subscriptions.id, all.filter(s => s.parent !== null).map(s => s.id)));
      await db.delete(subscriptions).where(inArray(subscriptions.id, allIds));
    }
    if (definitions.length) await db.delete(consentDefinitions).where(inArray(consentDefinitions.id, definitions));
    await db.delete(questionnaireTemplates).where(eq(questionnaireTemplates.id, templateId));
    await db.delete(serviceVariants).where(eq(serviceVariants.id, variantId));
    await db.delete(services).where(eq(services.id, serviceId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});
async function make(status = "active", config: { punctual?: boolean; end?: Date | null; owed?: number } = {}) {
  const id = randomUUID(); ids.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-LIFECYCLE-${id}`, customerId, serviceId, variantId, status, agreedPriceXaf: 45000, currency: "XAF",
    durationValueSnapshot: config.punctual ? null : 2, durationUnitSnapshot: config.punctual ? null : "week", plannedStartDate: past(), actualStartDate: status === "ready_to_start" || status === "onboarding" ? null : past(),
    plannedEndDate: config.end !== undefined ? config.end : config.punctual ? null : future(), capacityReservedUntil: future(), createdByUserId: userId });
  await db.insert(subscriptionComponents).values({ subscriptionId: id, componentType: "appointment", labelSnapshot: "Historical synthetic entitlement", quantityEntitled: 4, quantityConsumed: 2, quantityOwedByCoach: config.owed ?? 0 });
  await db.insert(subscriptionStatusHistory).values({ subscriptionId: id, fromStatus: null, toStatus: status, changedAt: past() });
  return id;
}
const run = (id: string, command: LifecycleCommand, repository = repo) => repository.execute(id, command, actor);
async function row(id: string) { const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)); assert.ok(s); return s; }
async function view(id: string) { const result = await run(id, { action: "read" }); assert.equal(result.status, "ok"); if (result.status !== "ok") throw new Error("Missing detail"); return result.subscription; }
async function events(id: string) { return db.select().from(auditEvents).where(eq(auditEvents.entityId, id)).orderBy(auditEvents.id); }
async function ready() {
  const id = await make("onboarding");
  await db.insert(onboardingItems).values(["start_date_confirmed", "payment_condition"].map(itemType => ({ subscriptionId: id, itemType, label: itemType, status: "completed", completedAt: new Date() })));
  assert.ok((await consents.execute(id, { action: "capture", decisions: { service_terms: "granted", privacy_notice: "granted" }, expectedDefinitionIds: definitions }, actor)).ok);
  await db.update(subscriptions).set({ status: "ready_to_start" }).where(eq(subscriptions.id, id));
  return id;
}
async function paused(config: Parameters<typeof make>[1] = {}) { const id = await make("active", config); assert.equal((await run(id, { action: "pause", reason: "Synthetic private pause" })).status, "ok"); return id; }
const fail = (error: string) => ({ status: "error", error });

test("PostgreSQL ready activation uses immutable duration and clears prestart hold", async () => {
  const id = await ready(); assert.equal((await run(id, { action: "activate" })).status, "ok");
  const s = await row(id); assert.equal(s.status, "active"); assert.ok(s.actualStartDate); assert.equal(s.plannedEndDate!.getTime() - s.actualStartDate.getTime(), 14 * 86400000); assert.equal(s.capacityReservedUntil, null);
});
test("PostgreSQL activation double submit writes start, history and audit exactly once", async () => {
  const id = await ready(); const results = await Promise.all([run(id, { action: "activate" }), run(id, { action: "activate" })]);
  assert.equal(results.filter(r => r.status === "ok").length, 1); const before = await row(id); await run(id, { action: "activate" }); assert.deepEqual(await row(id), before);
  assert.equal((await view(id)).history.filter(h => h.toStatus === "active").length, 1); assert.equal((await events(id)).filter(e => e.eventType === "subscription.activated").length, 1);
});
test("PostgreSQL ready row already started is rejected", async () => {
  const id = await ready(); await db.update(subscriptions).set({ actualStartDate: past() }).where(eq(subscriptions.id, id)); assert.deepEqual(await run(id, { action: "activate" }), fail("SUBSCRIPTION_ALREADY_STARTED"));
});
test("PostgreSQL activation reloads a reappeared checklist blocker", async () => {
  const id = await ready(); await db.update(onboardingItems).set({ status: "pending" }).where(and(eq(onboardingItems.subscriptionId, id), eq(onboardingItems.itemType, "payment_condition")));
  assert.deepEqual(await run(id, { action: "activate" }), fail("SUBSCRIPTION_BLOCKED")); assert.equal((await row(id)).actualStartDate, null);
});
test("PostgreSQL activation cannot bypass active medical record without checklist row", async () => {
  const id = await ready(); await db.insert(medicalClearanceRecords).values({ subscriptionId: id, status: "required", triggerSource: "synthetic" });
  assert.deepEqual(await run(id, { action: "activate" }), fail("SUBSCRIPTION_BLOCKED"));
});
test("PostgreSQL activation rechecks refused privacy evidence even with a completed checklist", async () => {
  const id = await ready();
  const [prior] = await db.select().from(consentRecords).where(and(eq(consentRecords.subscriptionId, id), eq(consentRecords.consentDefinitionId, definitions[1]!))); assert.ok(prior);
  // Synthetic evidence fixture; required acceptances cannot be revoked through the API.
  await db.insert(consentRecords).values({ customerId, subscriptionId: id, consentDefinitionId: prior.consentDefinitionId, decision: "refused", capturedVia: "coach_assisted", capturedByUserId: userId, supersedesConsentRecordId: prior.id });
  assert.deepEqual(await run(id, { action: "activate" }), fail("SUBSCRIPTION_BLOCKED"));
});
test("PostgreSQL activation requires initialized checklist", async () => { const id = await make("ready_to_start"); assert.deepEqual(await run(id, { action: "activate" }), fail("SUBSCRIPTION_BLOCKED")); });
test("PostgreSQL pause stores original end without date arithmetic", async () => {
  const id = await make(), before = await row(id); assert.equal((await run(id, { action: "pause", reason: "Synthetic reason" })).status, "ok");
  const detail = await view(id); assert.equal(detail.status, "paused"); assert.equal(detail.pauses.length, 1); assert.equal(detail.pauses[0]?.originalEndDate, before.plannedEndDate?.toISOString()); assert.equal(detail.pauses[0]?.revisedEndDate, null); assert.equal(detail.plannedEndDate, before.plannedEndDate?.toISOString());
});
test("PostgreSQL concurrent pauses produce one open pause and one history entry", async () => {
  const id = await make(); const results = await Promise.all([run(id, { action: "pause", reason: "First" }), run(id, { action: "pause", reason: "Second" })]);
  assert.equal(results.filter(r => r.status === "ok").length, 1); const detail = await view(id); assert.equal(detail.pauses.filter(p => p.endedAt === null).length, 1); assert.equal(detail.history.filter(h => h.toStatus === "paused").length, 1);
});
test("PostgreSQL inconsistent active row with open pause safely rejects a second pause", async () => {
  const id = await paused(); await db.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.id, id)); assert.deepEqual(await run(id, { action: "pause", reason: "Other" }), fail("SUBSCRIPTION_PAUSE_ALREADY_OPEN"));
});
test("PostgreSQL duration resume requires manual end", async () => { const id = await paused(); assert.deepEqual(await run(id, { action: "resume" }), fail("SUBSCRIPTION_RESUME_DATE_INVALID")); assert.equal((await view(id)).pauses[0]?.endedAt, null); });
test("PostgreSQL resume rejects revised end before original", async () => { const id = await paused(); assert.deepEqual(await run(id, { action: "resume", revisedEndDate: future(50) }), fail("SUBSCRIPTION_RESUME_DATE_INVALID")); });
test("PostgreSQL resume rejects end before authoritative time", async () => { const id = await paused({ end: past() }); assert.deepEqual(await run(id, { action: "resume", revisedEndDate: past() }), fail("SUBSCRIPTION_RESUME_DATE_INVALID")); });
test("PostgreSQL resume closes one pause using exactly the coach-selected end", async () => {
  const id = await paused(), end = future(150); assert.equal((await run(id, { action: "resume", revisedEndDate: end })).status, "ok");
  const detail = await view(id); assert.equal(detail.status, "active"); assert.equal(detail.plannedEndDate, end.toISOString()); assert.equal(detail.pauses[0]?.revisedEndDate, end.toISOString()); assert.ok(detail.pauses[0]?.endedAt);
});
test("PostgreSQL punctual resume preserves null planned end", async () => { const id = await paused({ punctual: true }); assert.equal((await run(id, { action: "resume" })).status, "ok"); assert.equal((await row(id)).plannedEndDate, null); });
test("PostgreSQL paused state without an open row cannot resume", async () => { const id = await make("paused"); assert.deepEqual(await run(id, { action: "resume", revisedEndDate: future(150) }), fail("SUBSCRIPTION_PAUSE_NOT_FOUND")); });
test("PostgreSQL planned end passing alone leaves active status and histories unchanged", async () => {
  const id = await make("active", { end: past() }), before = await row(id); assert.equal((await view(id)).status, "active"); assert.deepEqual(await row(id), before); assert.equal((await view(id)).history.length, 1);
});
test("PostgreSQL reached end permits explicit completion review without reason", async () => { const id = await make("active", { end: past() }); assert.equal((await run(id, { action: "completion-due" })).status, "ok"); assert.equal((await row(id)).status, "completion_due"); });
test("PostgreSQL early review and punctual review require a reason", async () => {
  for (const punctual of [false, true]) { const id = await make("active", { punctual }); assert.deepEqual(await run(id, { action: "completion-due" }), fail("SUBSCRIPTION_COMPLETION_REASON_REQUIRED")); assert.equal((await run(id, { action: "completion-due", reason: "Synthetic early review" })).status, "ok"); }
});
test("PostgreSQL owed snapshot blocks ordinary completion", async () => { const id = await make("completion_due", { owed: 2 }); assert.deepEqual(await run(id, { action: "complete", overrideOutstandingComponents: false }), fail("SUBSCRIPTION_COMPONENTS_OUTSTANDING")); });
test("PostgreSQL completion override without reason rejects safely", async () => { const id = await make("completion_due", { owed: 2 }); assert.deepEqual(await run(id, { action: "complete", overrideOutstandingComponents: true }), fail("SUBSCRIPTION_COMPLETION_REASON_REQUIRED")); });
test("PostgreSQL completion override preserves all balances and sets both end timestamps", async () => {
  const id = await make("completion_due", { owed: 2 }), before = (await view(id)).components;
  assert.equal((await run(id, { action: "complete", overrideOutstandingComponents: true, reason: "Synthetic private override" })).status, "ok");
  const detail = await view(id); assert.deepEqual(detail.components, before); assert.equal(detail.status, "completed"); assert.ok(detail.completedAt); assert.equal(detail.completedAt, detail.actualEndDate);
});
test("PostgreSQL settled completion succeeds without overriding", async () => { const id = await make("completion_due"); assert.equal((await run(id, { action: "complete", overrideOutstandingComponents: false })).status, "ok"); });
test("PostgreSQL explicit reopen stores manual extension and reason", async () => {
  const id = await make("completion_due", { end: past() }), end = future(); assert.equal((await run(id, { action: "resume-active", reason: "Synthetic extension", revisedEndDate: end })).status, "ok"); assert.equal((await row(id)).plannedEndDate?.toISOString(), end.toISOString()); assert.equal((await view(id)).history.at(-1)?.reason, "Synthetic extension");
});
test("PostgreSQL reopen requires reason and rejects shortened end", async () => {
  const id = await make("completion_due"); assert.deepEqual(await run(id, { action: "resume-active" }), fail("SUBSCRIPTION_INVALID_INPUT")); assert.deepEqual(await run(id, { action: "resume-active", reason: "Synthetic", revisedEndDate: future(50) }), fail("SUBSCRIPTION_RESUME_DATE_INVALID"));
});
for (const status of ["ready_to_start", "active", "paused", "completion_due"]) test(`PostgreSQL cancel from ${status} preserves snapshots and closes paused interval only`, async () => {
  const id = status === "paused" ? await paused() : await make(status), before = (await view(id)).components;
  assert.equal((await run(id, { action: "cancel", reason: "Synthetic cancellation" })).status, "ok"); const detail = await view(id); assert.equal(detail.status, "cancelled"); assert.ok(detail.cancelledAt); assert.deepEqual(detail.components, before);
  if (status === "paused") { assert.ok(detail.pauses[0]?.endedAt); assert.equal(detail.pauses[0]?.revisedEndDate, null); }
});
for (const status of ["completed", "cancelled"]) test(`PostgreSQL terminal ${status} rejects all transitions (completed may renew separately)`, async () => {
  const id = await make(status), before = await row(id);
  for (const action of ["activate", "pause", "resume", "completion-due", "complete", "resume-active", "cancel"] as const) assert.deepEqual(await run(id, { action, reason: "Synthetic", revisedEndDate: future(150) }), fail("SUBSCRIPTION_TRANSITION_INVALID"));
  if (status === "cancelled") assert.deepEqual(await run(id, { action: "renew", plannedStartDate: future() }), fail("SUBSCRIPTION_TRANSITION_INVALID")); assert.deepEqual(await row(id), before);
});
test("PostgreSQL renewal clones immutable commercial/component snapshots with reset counters and no operational state", async () => {
  const id = await make("completed", { owed: 3 }); const before = await row(id); const sourceComponents = (await view(id)).components;
  await db.insert(onboardingItems).values({ subscriptionId: id, itemType: "payment_condition", label: "Synthetic", status: "completed" });
  await db.insert(consentRecords).values({ customerId, subscriptionId: id, consentDefinitionId: definitions[0]!, decision: "granted", capturedVia: "coach_assisted", capturedByUserId: userId });
  await db.insert(questionnaireSubmissions).values({ subscriptionId: id, templateId, templateVersion: 1, revisionNumber: 1, status: "submitted", submittedAt: past(), source: "coach_assisted", enteredByUserId: userId });
  await db.insert(medicalClearanceRecords).values({ subscriptionId: id, status: "cleared", triggerSource: "synthetic", clearedAt: past() });
  const start = future(200); assert.equal((await run(id, { action: "renew", plannedStartDate: start })).status, "ok");
  const childId = (await view(id)).renewalChild!.id, child = await row(childId); assert.equal(child.status, "onboarding"); assert.equal(child.sourceRequestId, null); assert.equal(child.renewedFromSubscriptionId, id);
  for (const field of ["customerId", "serviceId", "variantId", "agreedPriceXaf", "currency", "durationValueSnapshot", "durationUnitSnapshot"] as const) assert.equal(child[field], before[field]);
  for (const field of ["actualStartDate", "plannedEndDate", "actualEndDate", "capacityReservedUntil", "completedAt", "cancelledAt"] as const) assert.equal(child[field], null);
  assert.equal(child.plannedStartDate?.toISOString(), start.toISOString()); const components = (await view(childId)).components; assert.equal(components.length, sourceComponents.length); assert.equal(components[0]?.quantityEntitled, 4); assert.equal(components[0]?.labelSnapshot, sourceComponents[0]?.labelSnapshot); assert.equal(components[0]?.quantityConsumed, 0); assert.equal(components[0]?.quantityOwedByCoach, 0);
  assert.equal((await db.select().from(onboardingItems).where(eq(onboardingItems.subscriptionId, childId))).length, 0);
  assert.equal((await db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, childId))).length, 0);
  assert.equal((await db.select().from(questionnaireSubmissions).where(eq(questionnaireSubmissions.subscriptionId, childId))).length, 0);
  assert.equal((await db.select().from(medicalClearanceRecords).where(eq(medicalClearanceRecords.subscriptionId, childId))).length, 0);
  assert.deepEqual(await row(id), before); assert.equal((await view(childId)).history[0]?.fromStatus, null); assert.equal((await view(childId)).history[0]?.toStatus, "onboarding");
});
test("PostgreSQL concurrent renewal from review creates exactly one child and audit", async () => {
  const id = await make("completion_due"), before = await row(id); const results = await Promise.all([run(id, { action: "renew", plannedStartDate: future() }), run(id, { action: "renew", plannedStartDate: future() })]);
  assert.equal(results.filter(r => r.status === "ok").length, 1); assert.ok(results.some(r => r.status === "error" && r.error === "SUBSCRIPTION_RENEWAL_ALREADY_EXISTS")); assert.equal((await db.select().from(subscriptions).where(eq(subscriptions.renewedFromSubscriptionId, id))).length, 1); assert.deepEqual(await row(id), before); assert.equal((await events(id)).filter(e => e.eventType === "subscription.renewed").length, 1);
});
test("PostgreSQL history remains append-only and ordered through pause/resume/review/reopen/cancel", async () => {
  const id = await make(), initial = (await view(id)).history;
  await run(id, { action: "pause", reason: "Synthetic pause" }); await run(id, { action: "resume", revisedEndDate: future(150) }); await run(id, { action: "completion-due", reason: "Synthetic early" }); await run(id, { action: "resume-active", reason: "Synthetic reopen" }); await run(id, { action: "cancel", reason: "Synthetic cancel" });
  const detail = await view(id); assert.deepEqual(detail.history.slice(0, initial.length), initial); assert.deepEqual(detail.history.map(h => h.toStatus), ["active", "paused", "active", "completion_due", "active", "cancelled"]);
  for (let i = 1; i < detail.history.length; i++) assert.ok(detail.history[i]!.changedAt >= detail.history[i - 1]!.changedAt);
  for (const event of await events(id)) { const text = JSON.stringify(event.metadataJson); assert.ok(!text.includes("Synthetic")); assert.ok(!text.includes("reason")); }
});
for (const status of ["paused", "completion_due"]) test(`PostgreSQL ${status} retains a limited capacity place until resolved`, async () => {
  // Separate pool ensures other lifecycle fixtures cannot influence the count.
  const poolId = randomUUID(); await db.insert(services).values({ id: poolId, name: "Synthetic capacity retention", slug: `retention-${poolId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "limited", capacityLimit: 1 });
  const claim = await make(status), candidate = await make("onboarding");
  try {
    await db.update(subscriptions).set({ serviceId: poolId, variantId: null, capacityReservedUntil: null }).where(inArray(subscriptions.id, [claim, candidate]));
    const onboarding = new DrizzleOnboardingRepository(db, options); assert.deepEqual(await onboarding.execute(candidate, { action: "reserve", until: future() }, actor), { status: "capacity_exhausted" });
    if (status === "paused") { await db.insert(subscriptionPauses).values({ subscriptionId: claim, startedAt: past(), reason: "Synthetic", originalEndDate: future() }); }
    assert.equal((await run(claim, { action: "cancel", reason: "Release synthetic claim" })).status, "ok"); assert.equal((await onboarding.execute(candidate, { action: "reserve", until: future() }, actor)).status, "ok");
  } finally { await db.update(subscriptions).set({ serviceId, variantId }).where(inArray(subscriptions.id, [claim, candidate])); await db.delete(services).where(eq(services.id, poolId)); }
});
function auditFailureRepository() {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, { get(target, key, receiver) {
    if (key === "transaction") return <T>(work: (tx: Tx) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, { get(transaction, member, txReceiver) {
      if (member === "insert") return (table: Parameters<Tx["insert"]>[0]) => {
        const insert = transaction.insert(table); if (table !== auditEvents) return insert;
        return new Proxy(insert, { get(builder, method, builderReceiver) {
          if (method === "values") return (value: Record<string, unknown>) => Reflect.apply(builder.values, builder, [{ ...value, actorUserId: randomUUID() }]);
          return Reflect.get(builder, method, builderReceiver);
        } });
      }; return Reflect.get(transaction, member, txReceiver);
    } })), config); return Reflect.get(target, key, receiver);
  } }); return new DrizzleSubscriptionsRepository(database, options);
}
for (const action of ["activate", "pause", "resume", "completion-due", "complete", "resume-active", "cancel", "renew"] as const) test(`PostgreSQL real audit insert failure rolls back ${action} with history and side effects`, async () => {
  const id = action === "activate" ? await ready() : action === "resume" || action === "cancel" ? await paused() : await make(["complete", "resume-active", "renew"].includes(action) ? "completion_due" : "active");
  const before = await view(id), beforeRow = await row(id), audits = await events(id);
  await assert.rejects(run(id, { action, reason: "Synthetic rollback", revisedEndDate: future(150), plannedStartDate: future(), overrideOutstandingComponents: false }, auditFailureRepository()), error => { const cause = error instanceof Error ? error.cause : null; return !!cause && typeof cause === "object" && "code" in cause && cause.code === "23503"; });
  assert.deepEqual(await view(id), before); assert.deepEqual(await row(id), beforeRow); assert.deepEqual(await events(id), audits);
});

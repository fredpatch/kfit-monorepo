import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { serviceComponents, services, serviceVariants } from "../../../db/schema/catalogue.js";
import { customers, subscriptionComponents, subscriptions, subscriptionStatusHistory } from "../../../db/schema/customers.js";
import { prospects, qualificationReviews, serviceRequests } from "../../../db/schema/prospects.js";
import { DrizzleCustomersRepository } from "../../customers/repositories/customers.repository.js";
import { DrizzleRequestConversionRepository } from "../repositories/request-conversion.repository.js";
import { RequestConversionService } from "../services/request-conversion.service.js";

const userId = randomUUID();
const serviceId = randomUUID();
const variantId = randomUUID();
const otherVariantId = randomUUID();
const commonComponentId = randomUUID();
const variantComponentId = randomUUID();
const requestIds: string[] = [];
const prospectIds: string[] = [];
const manualCustomerIds: string[] = [];
const targetStartDate = new Date("2026-11-01T00:00:00Z");
const fallback = new Date("2026-12-01T00:00:00Z");
const options = { auditHashPepper: "synthetic-conversion-audit-pepper-at-least-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.1", userAgent: "synthetic-conversion-test" };
const repository = new DrizzleRequestConversionRepository(db, options);
const service = new RequestConversionService(repository);
let safeLocalTarget = false;

before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433", "conversion integration requires disposable local PostgreSQL on port 5433");
  safeLocalTarget = true;
  await db.insert(users).values({ id: userId, email: `conversion-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(services).values({ id: serviceId, name: "Synthetic Conversion", slug: `conversion-${serviceId}`, pricingMode: "quote", deliveryType: "subscription", availabilityStatus: "open", capacityMode: "unlimited" });
  await db.insert(serviceVariants).values([
    { id: variantId, serviceId, name: "Selected", slug: `selected-${variantId}`, priceXaf: 99000 },
    { id: otherVariantId, serviceId, name: "Unselected", slug: `unselected-${otherVariantId}`, priceXaf: 88000 },
  ]);
  await db.insert(serviceComponents).values([
    { id: commonComponentId, serviceId, variantId: null, componentType: "follow_up", label: "Service snapshot", quantity: 2, isMandatory: false },
    { id: variantComponentId, serviceId, variantId, componentType: "appointment", label: "Variant snapshot", quantity: 4 },
    { serviceId, variantId: otherVariantId, componentType: "appointment", label: "Excluded variant", quantity: 9 },
  ]);
});

after(async () => {
  try {
    if (!safeLocalTarget) return;
    if (requestIds.length) {
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, requestIds));
      const rows = await db.select({ id: subscriptions.id }).from(subscriptions).where(inArray(subscriptions.sourceRequestId, requestIds));
      if (rows.length) {
        const ids = rows.map(row => row.id);
        await db.delete(subscriptionComponents).where(inArray(subscriptionComponents.subscriptionId, ids));
        await db.delete(subscriptionStatusHistory).where(inArray(subscriptionStatusHistory.subscriptionId, ids));
        await db.update(serviceRequests).set({ convertedSubscriptionId: null }).where(inArray(serviceRequests.id, requestIds));
        await db.delete(subscriptions).where(inArray(subscriptions.id, ids));
      }
      await db.delete(qualificationReviews).where(inArray(qualificationReviews.requestId, requestIds));
      await db.delete(serviceRequests).where(inArray(serviceRequests.id, requestIds));
    }
    if (manualCustomerIds.length) await db.delete(customers).where(inArray(customers.id, manualCustomerIds));
    if (prospectIds.length) {
      await db.delete(customers).where(inArray(customers.prospectId, prospectIds));
      await db.delete(prospects).where(inArray(prospects.id, prospectIds));
    }
    await db.delete(serviceComponents).where(eq(serviceComponents.serviceId, serviceId));
    await db.delete(serviceVariants).where(eq(serviceVariants.serviceId, serviceId));
    await db.delete(services).where(eq(services.id, serviceId));
    await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});

async function seedScenario(config: { status?: string; outcome?: string; start?: Date | null; whatsapp?: string } = {}) {
  const prospectId = randomUUID();
  const requestId = randomUUID();
  const phone = config.whatsapp ?? `+241${(BigInt('0x' + prospectId.replaceAll('-', '').slice(0, 12)) % 1000000000000n).toString().padStart(12, '0')}`;
  prospectIds.push(prospectId); requestIds.push(requestId);
  await db.insert(prospects).values({ id: prospectId, fullName: "Synthetic Prospect", whatsapp: phone, email: "prospect@example.invalid", city: "Synthetic City", country: "Synthetic Country", preferredContactChannel: "email", source: "integration-test" });
  await db.insert(serviceRequests).values({ id: requestId, reference: `REQ-${requestId}`, submissionToken: `conversion-${requestId}`, prospectId, serviceId, requestedVariantId: otherVariantId, status: config.status ?? "qualified" });
  await db.insert(qualificationReviews).values([
    { requestId, version: 1, outcome: "rejected", supersededAt: new Date(), suitabilityNote: "Synthetic private note" },
    { requestId, version: 2, outcome: config.outcome ?? config.status ?? "qualified", finalVariantId: variantId, agreedPriceXaf: 45000, targetStartDate: config.start === undefined ? targetStartDate : config.start, conditionsJson: ["Synthetic private condition"], blockersJson: ["Synthetic private blocker"] },
  ]);
  return { requestId, prospectId, phone, status: config.status ?? "qualified" };
}

async function noWrites(scenario: Awaited<ReturnType<typeof seedScenario>>) {
  const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, scenario.requestId));
  assert.equal(request?.status, scenario.status);
  assert.equal(request?.convertedSubscriptionId, null);
  assert.equal((await db.select().from(subscriptions).where(eq(subscriptions.sourceRequestId, scenario.requestId))).length, 0);
  assert.equal((await db.select().from(customers).where(eq(customers.prospectId, scenario.prospectId))).length, 0);
  assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.entityId, scenario.requestId))).length, 0);
}

test("PostgreSQL qualified conversion commits exact prospect customer, authoritative subscription, snapshots, history, reciprocal links and safe audit", async () => {
  const scenario = await seedScenario();
  const result = await repository.convert(scenario.requestId, fallback, actor);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected conversion");
  const { subscription, customerResolution, request } = result.response;
  assert.equal(customerResolution, "created");
  const [customer] = await db.select().from(customers).where(eq(customers.id, subscription.customerId));
  assert.equal(customer?.prospectId, scenario.prospectId);
  assert.equal(customer?.whatsapp, scenario.phone);
  assert.equal(customer?.fullName, "Synthetic Prospect");
  assert.equal(customer?.email, "prospect@example.invalid");
  assert.equal(customer?.city, "Synthetic City");
  assert.equal(customer?.country, "Synthetic Country");
  assert.equal(customer?.preferredContactChannel, "email");
  const [stored] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscription.id));
  assert.equal(stored?.serviceId, serviceId);
  assert.equal(stored?.variantId, variantId);
  assert.equal(stored?.agreedPriceXaf, 45000);
  assert.equal(stored?.currency, "XAF");
  assert.equal(stored?.status, "onboarding");
  assert.equal(stored?.plannedStartDate?.toISOString(), targetStartDate.toISOString());
  assert.equal(stored?.createdByUserId, userId);
  assert.equal(stored?.capacityReservedUntil, null);
  assert.equal(stored?.sourceRequestId, scenario.requestId);
  assert.equal(request.convertedSubscriptionId, subscription.id);
  const [linkedRequest] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, stored!.sourceRequestId!));
  assert.equal(linkedRequest?.status, "converted");
  assert.equal(linkedRequest?.convertedSubscriptionId, stored?.id);
  assert.equal(linkedRequest?.id, request.id);
  const snapshots = await db.select().from(subscriptionComponents).where(eq(subscriptionComponents.subscriptionId, subscription.id));
  assert.deepEqual(snapshots.map(row => ({ source: row.sourceServiceComponentId, type: row.componentType, label: row.labelSnapshot, entitled: row.quantityEntitled, consumed: row.quantityConsumed, owed: row.quantityOwedByCoach })).sort((a,b) => a.label.localeCompare(b.label)), [
    { source: commonComponentId, type: "follow_up", label: "Service snapshot", entitled: 2, consumed: 0, owed: 0 },
    { source: variantComponentId, type: "appointment", label: "Variant snapshot", entitled: 4, consumed: 0, owed: 0 },
  ]);
  const history = await db.select().from(subscriptionStatusHistory).where(eq(subscriptionStatusHistory.subscriptionId, subscription.id));
  assert.equal(history.length, 1);
  assert.equal(history[0]?.fromStatus, null);
  assert.equal(history[0]?.toStatus, "onboarding");
  assert.equal(history[0]?.changedByUserId, userId);
  const events = await db.select().from(auditEvents).where(eq(auditEvents.entityId, scenario.requestId));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "request.converted");
  assert.equal(events[0]?.actorUserId, userId);
  assert.equal(events[0]?.requestId, actor.requestId);
  assert.deepEqual(events[0]?.metadataJson, { fromStatus: "qualified", toStatus: "converted", customerId: subscription.customerId, subscriptionId: subscription.id, customerResolution: "created" });
  assert.notEqual(events[0]?.ipHash, actor.ipAddress);
  assert.notEqual(events[0]?.userAgentHash, actor.userAgent);
});

test("PostgreSQL qualified_with_conditions conversion uses supplied start only without a qualification target", async () => {
  const scenario = await seedScenario({ status: "qualified_with_conditions", start: null });
  const result = await service.convert(scenario.requestId, { plannedStartDate: fallback.toISOString() }, actor);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected conversion");
  assert.equal(result.response.subscription.plannedStartDate, fallback.toISOString());
  assert.equal(result.response.subscription.status, "onboarding");
  assert.equal(result.response.subscription.capacityReservedUntil, null);
});

test("PostgreSQL conversion reuses a formatted active customer without changing profile or prospect linkage", async () => {
  const scenario = await seedScenario();
  const id = randomUUID(); manualCustomerIds.push(id);
  await db.insert(customers).values({ id, fullName: "Existing Synthetic Profile", whatsapp: scenario.phone.slice(0, 4) + " " + scenario.phone.slice(4), email: "existing@example.invalid", city: "Existing City", preferredContactChannel: "whatsapp" });
  const [before] = await db.select().from(customers).where(eq(customers.id, id));
  const result = await repository.convert(scenario.requestId, null, actor);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected conversion");
  assert.equal(result.response.customerResolution, "existing");
  assert.equal(result.response.subscription.customerId, id);
  assert.deepEqual((await db.select().from(customers).where(eq(customers.id, id)))[0], before);
  assert.equal((await db.select().from(customers).where(eq(customers.prospectId, scenario.prospectId))).length, 0);
});

test("PostgreSQL conversion excludes archived/anonymized customers when resolving identity", async () => {
  const scenario = await seedScenario();
  for (const flags of [{ archivedAt: new Date() }, { anonymizedAt: new Date() }]) {
    const id = randomUUID(); manualCustomerIds.push(id);
    await db.insert(customers).values({ id, fullName: "Inactive Synthetic Profile", whatsapp: scenario.phone, ...flags });
  }
  const result = await repository.convert(scenario.requestId, null, actor);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected conversion");
  assert.equal(result.response.customerResolution, "created");
});

test("PostgreSQL missing both start dates rejects conversion with zero writes", async () => {
  const scenario = await seedScenario({ start: null });
  assert.deepEqual(await repository.convert(scenario.requestId, null, actor), { status: "start_date_required" });
  await noWrites(scenario);
});

test("PostgreSQL repeated conversion is a conflict with one subscription, snapshot/history/audit set", async () => {
  const scenario = await seedScenario();
  assert.equal((await repository.convert(scenario.requestId, null, actor)).status, "ok");
  assert.deepEqual(await repository.convert(scenario.requestId, null, actor), { status: "already_converted" });
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.sourceRequestId, scenario.requestId));
  assert.equal(rows.length, 1);
  assert.equal((await db.select().from(subscriptionComponents).where(eq(subscriptionComponents.subscriptionId, rows[0]!.id))).length, 2);
  assert.equal((await db.select().from(subscriptionStatusHistory).where(eq(subscriptionStatusHistory.subscriptionId, rows[0]!.id))).length, 1);
  assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.entityId, scenario.requestId))).length, 1);
});

test("PostgreSQL concurrent conversion serializes to one success, one conflict and one subscription", async () => {
  const scenario = await seedScenario();
  const results = await Promise.all([repository.convert(scenario.requestId, null, actor), repository.convert(scenario.requestId, null, actor)]);
  assert.deepEqual(results.map(result => result.status).sort(), ["already_converted", "ok"]);
  assert.equal((await db.select().from(subscriptions).where(eq(subscriptions.sourceRequestId, scenario.requestId))).length, 1);
  assert.equal((await db.select().from(customers).where(eq(customers.prospectId, scenario.prospectId))).length, 1);
  assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.entityId, scenario.requestId))).length, 1);
});

// Corrupt one insert only in the test adapter to trigger a real PostgreSQL constraint failure.
// No production hooks, schema changes or fake transactions are used.
function repositoryWithInsertFailure(tableToFail: typeof customers | typeof subscriptionComponents | typeof auditEvents) {
  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "transaction") return <T>(work: (tx: Transaction) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, {
        get(transaction, member, transactionReceiver) {
          if (member === "insert") return (table: Parameters<Transaction["insert"]>[0]) => {
            const insert = transaction.insert(table);
            if (table !== tableToFail) return insert;
            return new Proxy(insert, {
              get(builder, key, builderReceiver) {
                if (key === "values") return (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
                  const corrupt = (value: Record<string, unknown>) => table === customers ? { ...value, fullName: null }
                    : table === subscriptionComponents ? { ...value, quantityEntitled: 0 } : { ...value, actorUserId: randomUUID() };
                  return Reflect.apply(builder.values, builder, [Array.isArray(values) ? values.map(corrupt) : corrupt(values)]);
                };
                return Reflect.get(builder, key, builderReceiver);
              },
            });
          };
          return Reflect.get(transaction, member, transactionReceiver);
        },
      })), config);
      return Reflect.get(target, property, receiver);
    },
  });
  return new DrizzleRequestConversionRepository(database, options);
}

for (const [label, table, pgCode] of [["customer creation", customers, "23502"], ["component snapshot", subscriptionComponents, "23514"], ["audit insertion", auditEvents, "23503"]] as const) {
  test(`PostgreSQL ${label} failure rolls back the entire conversion and permits retry`, async () => {
    const scenario = await seedScenario();
    await assert.rejects(repositoryWithInsertFailure(table).convert(scenario.requestId, null, actor), error => {
      const cause = error instanceof Error ? error.cause : null;
      return !!cause && typeof cause === "object" && "code" in cause && cause.code === pgCode;
    });
    await noWrites(scenario);
    assert.equal((await repository.convert(scenario.requestId, null, actor)).status, "ok");
  });
}

test("PostgreSQL inconsistent or ambiguous current qualification rejects with zero writes", async () => {
  const mismatch = await seedScenario({ outcome: "qualified_with_conditions" });
  assert.deepEqual(await repository.convert(mismatch.requestId, null, actor), { status: "qualification_invalid" });
  await noWrites(mismatch);
  const ambiguous = await seedScenario();
  await db.insert(qualificationReviews).values({ requestId: ambiguous.requestId, version: 3, outcome: "qualified", finalVariantId: variantId, agreedPriceXaf: 45000, targetStartDate });
  assert.deepEqual(await repository.convert(ambiguous.requestId, null, actor), { status: "qualification_invalid" });
  await noWrites(ambiguous);
});

test("PostgreSQL non-eligible request statuses and unknown requests perform zero conversion writes", async () => {
  for (const status of ["submitted", "contacting", "qualification_in_progress", "waitlisted", "rejected", "abandoned", "closed_duplicate"]) {
    const scenario = await seedScenario({ status });
    assert.deepEqual(await repository.convert(scenario.requestId, null, actor), { status: "not_eligible" });
    await noWrites(scenario);
  }
  assert.deepEqual(await repository.convert(randomUUID(), null, actor), { status: "not_found" });
});

test("PostgreSQL source-subscription guard rejects an inconsistent cleared request link without replacement", async () => {
  const scenario = await seedScenario();
  assert.equal((await repository.convert(scenario.requestId, null, actor)).status, "ok");
  await db.update(serviceRequests).set({ status: "qualified", convertedSubscriptionId: null }).where(eq(serviceRequests.id, scenario.requestId));
  assert.deepEqual(await repository.convert(scenario.requestId, null, actor), { status: "already_converted" });
  assert.equal((await db.select().from(subscriptions).where(eq(subscriptions.sourceRequestId, scenario.requestId))).length, 1);
});

test("PostgreSQL two request conversions for the same normalized prospect phone share one customer", async () => {
  const first = await seedScenario();
  const second = await seedScenario({ whatsapp: first.phone.slice(0, 4) + " " + first.phone.slice(4) });
  const results = await Promise.all([repository.convert(first.requestId, null, actor), repository.convert(second.requestId, null, actor)]);
  assert.ok(results.every(result => result.status === "ok"));
  const rows = await db.select().from(subscriptions).where(inArray(subscriptions.sourceRequestId, [first.requestId, second.requestId]));
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.customerId, rows[1]?.customerId);
});

test("PostgreSQL manual creation and conversion use the same customer lock protocol", async () => {
  const scenario = await seedScenario();
  const manual = new DrizzleCustomersRepository(db, options);
  const [conversion, created] = await Promise.all([
    repository.convert(scenario.requestId, null, actor),
    manual.createManual({ fullName: "Manual Synthetic Customer", whatsapp: scenario.phone, email: null, city: null, country: null, preferredContactChannel: "whatsapp" }, actor),
  ]);
  assert.equal(conversion.status, "ok");
  const rows = await db.select().from(customers).where(sql`regexp_replace(${customers.whatsapp}, '[^0-9+]', '', 'g') = ${scenario.phone}`);
  assert.equal(rows.length, 1);
  if (created.status === "ok") {
    manualCustomerIds.push(created.customer.id);
    await db.delete(auditEvents).where(and(eq(auditEvents.entityId, created.customer.id), eq(auditEvents.actorUserId, userId)));
  }
});

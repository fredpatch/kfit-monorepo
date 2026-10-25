import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { services, serviceVariants, servicePolicies } from "../../../db/schema/catalogue.js";
import { subscriptionFollowUpCadenceHistory as history } from "../../../db/schema/coaching.js";
import { initializeCurrentCadenceHistory, lockCadenceWrites, lockPolicyCadenceScope, recordEffectiveCadence, recordPolicyCadenceChanges, resolvedCadence } from "../repositories/cadence-history.repository.js";
import { historicalCadence } from "../services/cadence-history.policy.js";

const customerId = randomUUID(), serviceIds: string[] = [], subscriptionIds: string[] = [];
const at = (day: number) => new Date(Date.UTC(2026, 0, day));
let safe = false;
before(async () => {
  assertLocalTestDatabase();
  safe = true;
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Cadence History", whatsapp: "+241000001771" });
});
after(async () => {
  try {
    if (!safe) return;
    if (subscriptionIds.length) {
      await db.delete(history).where(inArray(history.subscriptionId, subscriptionIds));
      await db.delete(subscriptions).where(inArray(subscriptions.id, subscriptionIds));
    }
    if (serviceIds.length) {
      await db.delete(servicePolicies).where(inArray(servicePolicies.serviceId, serviceIds));
      await db.delete(serviceVariants).where(inArray(serviceVariants.serviceId, serviceIds));
      await db.delete(services).where(inArray(services.id, serviceIds));
    }
    await db.delete(customers).where(eq(customers.id, customerId));
  } finally { await pool.end(); }
});

async function owner(config: { days?: number | null; variantDays?: number; override?: number } = {}) {
  const serviceId = randomUUID(), id = randomUUID(), variantId = config.variantDays === undefined ? null : randomUUID();
  serviceIds.push(serviceId); subscriptionIds.push(id);
  await db.insert(services).values({ id: serviceId, name: "Synthetic Cadence", slug: `cadence-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  await db.insert(servicePolicies).values({ serviceId, followUpFrequencyDays: config.days === undefined ? 7 : config.days });
  if (variantId) {
    await db.insert(serviceVariants).values({ id: variantId, serviceId, name: "Synthetic Cadence Variant", slug: `cadence-${variantId}` });
    await db.insert(servicePolicies).values({ serviceId, variantId, followUpFrequencyDays: config.variantDays });
  }
  const [sub] = await db.insert(subscriptions).values({ id, reference: `SUB-CADENCE-${id}`, customerId, serviceId, variantId, status: "active", actualStartDate: at(-10), agreedPriceXaf: 1000, followUpFrequencyDaysOverride: config.override ?? null }).returning();
  assert.ok(sub);
  return sub;
}
const rowsFor = (id: string) => db.select().from(history).where(eq(history.subscriptionId, id)).orderBy(history.effectiveFrom);
async function initialize(sub: Awaited<ReturnType<typeof owner>>) {
  await db.transaction(async tx => {
    await lockCadenceWrites(tx);
    await recordEffectiveCadence(tx, sub, await resolvedCadence(tx, sub), at(1));
  });
}
async function policyChange(serviceId: string, variantId: string | null, days: number, when = at(10)) {
  await db.transaction(async tx => {
    await lockCadenceWrites(tx);
    const before = await lockPolicyCadenceScope(tx, [serviceId]);
    const policies = await tx.select().from(servicePolicies).where(eq(servicePolicies.serviceId, serviceId));
    const policy = policies.find(p => p.variantId === variantId);
    assert.ok(policy);
    await tx.update(servicePolicies).set({ followUpFrequencyDays: days }).where(eq(servicePolicies.id, policy.id));
    await recordPolicyCadenceChanges(tx, before, when);
  });
}

for (const [config, days, source] of [
  [{}, 7, "service"], [{ variantDays: 3 }, 3, "variant"], [{ variantDays: 3, override: 5 }, 5, "override"], [{ days: null }, null, "none"],
] as const) test(`PostgreSQL cadence initialization records exact resolved ${source} value`, async () => {
  const sub = await owner(config); await initialize(sub);
  const rows = await rowsFor(sub.id);
  assert.equal(rows.length, 1); assert.equal(rows[0]!.effectiveFrequencyDays, days); assert.equal(rows[0]!.source, source);
  assert.equal(rows[0]!.effectiveFrom.toISOString(), at(1).toISOString());
});
test("PostgreSQL cadence override transition closes old evidence without rewriting its value", async () => {
  const sub = await owner(); await initialize(sub);
  await db.transaction(async tx => {
    await lockCadenceWrites(tx);
    const [updated] = await tx.update(subscriptions).set({ followUpFrequencyDaysOverride: 5 }).where(eq(subscriptions.id, sub.id)).returning(); assert.ok(updated);
    await recordEffectiveCadence(tx, updated, await resolvedCadence(tx, updated), at(10));
  });
  const rows = await rowsFor(sub.id);
  assert.deepEqual(rows.map(r => [r.effectiveFrequencyDays, r.source, r.effectiveTo?.toISOString() ?? null]), [[7, "service", at(10).toISOString()], [5, "override", null]]);
});
test("PostgreSQL clearing override records current variant fallback", async () => {
  const sub = await owner({ variantDays: 3, override: 5 }); await initialize(sub);
  await db.transaction(async tx => {
    await lockCadenceWrites(tx);
    const [updated] = await tx.update(subscriptions).set({ followUpFrequencyDaysOverride: null }).where(eq(subscriptions.id, sub.id)).returning(); assert.ok(updated);
    await recordEffectiveCadence(tx, updated, await resolvedCadence(tx, updated), at(10));
  });
  assert.deepEqual((await rowsFor(sub.id)).map(r => [r.effectiveFrequencyDays, r.source]), [[5, "override"], [3, "variant"]]);
});
test("PostgreSQL catalogue policy transaction transitions service fallback history", async () => {
  const sub = await owner(); await initialize(sub); await policyChange(sub.serviceId, null, 14);
  const rows = await rowsFor(sub.id); assert.equal(rows.length, 2);
  assert.deepEqual(historicalCadence(rows, at(9)), { days: 7, source: "service" });
  assert.deepEqual(historicalCadence(rows, at(10)), { days: 14, source: "service" });
});
test("PostgreSQL catalogue policy transaction transitions variant fallback history", async () => {
  const sub = await owner({ variantDays: 3 }); await initialize(sub); await policyChange(sub.serviceId, sub.variantId, 9);
  assert.deepEqual((await rowsFor(sub.id)).map(r => [r.effectiveFrequencyDays, r.source]), [[3, "variant"], [9, "variant"]]);
});
test("PostgreSQL stronger override prevents irrelevant policy history transitions", async () => {
  const sub = await owner({ override: 5 }); await initialize(sub); await policyChange(sub.serviceId, null, 14);
  assert.equal((await rowsFor(sub.id)).length, 1);
});
test("PostgreSQL unchanged effective cadence appends no duplicate segment", async () => {
  const sub = await owner(); await initialize(sub); await policyChange(sub.serviceId, null, 7);
  await db.transaction(async tx => { await lockCadenceWrites(tx); assert.equal(await recordEffectiveCadence(tx, sub, await resolvedCadence(tx, sub), at(10)), false); });
  assert.equal((await rowsFor(sub.id)).length, 1);
});
test("PostgreSQL direct writes cannot overlap closed cadence intervals", async () => {
  const sub = await owner();
  await db.insert(history).values({ subscriptionId: sub.id, source: "service", effectiveFrequencyDays: 7, effectiveFrom: at(1), effectiveTo: at(10) });
  await assert.rejects(db.insert(history).values({ subscriptionId: sub.id, source: "service", effectiveFrequencyDays: 14, effectiveFrom: at(5), effectiveTo: at(15) }));
  assert.equal((await rowsFor(sub.id)).length, 1);
});
test("PostgreSQL allows only one open cadence interval", async () => {
  const sub = await owner(); await initialize(sub);
  await assert.rejects(db.insert(history).values({ subscriptionId: sub.id, source: "service", effectiveFrequencyDays: 7, effectiveFrom: at(10) }));
  assert.equal((await rowsFor(sub.id)).length, 1);
});
test("PostgreSQL concurrent direct overlapping writers cannot both commit", async () => {
  const sub = await owner();
  const results = await Promise.allSettled([7, 14].map(days => db.insert(history).values({ subscriptionId: sub.id, source: "service", effectiveFrequencyDays: days, effectiveFrom: at(1), effectiveTo: at(10) })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal((await rowsFor(sub.id)).length, 1);
});
test("PostgreSQL invalid end and source/value combinations are rejected", async () => {
  const sub = await owner();
  for (const invalid of [{ source: "none", effectiveFrequencyDays: 7, effectiveTo: null }, { source: "other", effectiveFrequencyDays: 7, effectiveTo: null }, { source: "service", effectiveFrequencyDays: 0, effectiveTo: null }, { source: "service", effectiveFrequencyDays: null, effectiveTo: null }, { source: "service", effectiveFrequencyDays: 7, effectiveTo: at(1) }]) {
    await assert.rejects(db.insert(history).values({ subscriptionId: sub.id, effectiveFrom: at(1), ...invalid }));
  }
  assert.equal((await rowsFor(sub.id)).length, 0);
});
test("PostgreSQL history failure rolls back its catalogue policy source mutation", async () => {
  const sub = await owner(); await initialize(sub);
  await assert.rejects(policyChange(sub.serviceId, null, 14, at(1)));
  const [policy] = await db.select().from(servicePolicies).where(eq(servicePolicies.serviceId, sub.serviceId));
  assert.equal(policy?.followUpFrequencyDays, 7); assert.equal((await rowsFor(sub.id)).length, 1);
});
test("PostgreSQL history failure rolls back its override source mutation", async () => {
  const sub = await owner(); await initialize(sub);
  await assert.rejects(db.transaction(async tx => {
    await lockCadenceWrites(tx);
    await tx.update(subscriptions).set({ followUpFrequencyDaysOverride: 5 }).where(eq(subscriptions.id, sub.id));
    await recordEffectiveCadence(tx, sub, { days: 5, source: "override" }, at(1));
  }));
  const [stored] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
  assert.equal(stored?.followUpFrequencyDaysOverride, null); assert.equal((await rowsFor(sub.id)).length, 1);
});
test("PostgreSQL explicit legacy initialization starts only at execution and does not invent earlier authority", async () => {
  const sub = await owner(); const execution = new Date();
  await initializeCurrentCadenceHistory(db, () => execution);
  const rows = await rowsFor(sub.id); assert.equal(rows.length, 1);
  assert.equal(rows[0]!.effectiveFrom.toISOString(), execution.toISOString());
  assert.equal(historicalCadence(rows, new Date(execution.getTime() - 1)), null);
  assert.deepEqual(historicalCadence(rows, execution), { days: 7, source: "service" });
});

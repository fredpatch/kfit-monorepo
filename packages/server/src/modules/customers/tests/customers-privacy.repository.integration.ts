import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { services } from "../../../db/schema/catalogue.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { anonymizationEvents, retentionHolds } from "../../../db/schema/operations.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { assertLocalTestDatabase, cleanupInOrder, testFixtureName, uniqueTestWhatsapp } from "../../../testing/integration-fixtures.js";
import { DrizzlePrivacyRepository, type PrivacyActor } from "../../privacy/repositories/privacy.repository.js";
import { pseudonymFor } from "../../privacy/services/privacy.policy.js";
import { DrizzleAdminRequestsRepository } from "../../requests/repositories/admin-requests.repositories.js";
import { DrizzleCustomersRepository } from "../repositories/customers.repository.js";
import { CustomersService } from "../services/customers.service.js";

const options = { auditHashPepper: "synthetic-customers-privacy-pepper" };
const userId = randomUUID(), serviceId = randomUUID();
const actor: PrivacyActor = { userId, requestId: randomUUID(), ipAddress: null, userAgent: "customers-privacy-test" };
const repository = new DrizzleCustomersRepository(db, options);
const service = new CustomersService(repository);
const privacy = new DrizzlePrivacyRepository(db, options);
const requests = new DrizzleAdminRequestsRepository(db, options);
const created = { customers: [] as string[], prospects: [] as string[] };
let safe = false;

before(async () => {
  assertLocalTestDatabase(); safe = true;
  await db.insert(users).values({ id: userId, email: `customers-privacy-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(services).values({ id: serviceId, name: testFixtureName("Privacy fiche service"), slug: `privacy-fiche-${serviceId}`, pricingMode: "quote", deliveryType: "one_time", capacityMode: "unlimited" });
});

after(async () => {
  try {
    if (safe) await cleanupInOrder([
      ["holds", () => db.delete(retentionHolds).where(eq(retentionHolds.createdByUserId, userId))],
      ["anonymization events", () => created.customers.length ? db.delete(anonymizationEvents).where(inArray(anonymizationEvents.subjectId, created.customers)) : Promise.resolve()],
      ["audit", () => db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId))],
      ["subscriptions", () => created.customers.length ? db.delete(subscriptions).where(inArray(subscriptions.customerId, created.customers)) : Promise.resolve()],
      ["customers", () => created.customers.length ? db.delete(customers).where(inArray(customers.id, created.customers)) : Promise.resolve()],
      ["requests", () => created.prospects.length ? db.delete(serviceRequests).where(inArray(serviceRequests.prospectId, created.prospects)) : Promise.resolve()],
      ["prospects", () => created.prospects.length ? db.delete(prospects).where(inArray(prospects.id, created.prospects)) : Promise.resolve()],
      ["service", () => db.delete(services).where(eq(services.id, serviceId))],
      ["user", () => db.delete(users).where(eq(users.id, userId))],
    ]);
  } finally {
    await pool.end();
  }
});

async function seedCustomer(statuses: string[]) {
  const id = randomUUID(), whatsapp = uniqueTestWhatsapp(), name = testFixtureName(`Privacy fiche ${id.slice(0, 8)}`);
  created.customers.push(id);
  await db.insert(customers).values({ id, fullName: name, whatsapp, email: `fiche-${id}@example.invalid` });
  for (const status of statuses) await db.insert(subscriptions).values({ reference: `SUB-FICHE-${randomUUID()}`, customerId: id, serviceId, status, agreedPriceXaf: 0 });
  return { id, name, whatsapp };
}
async function archive(id: string) {
  const result = await privacy.archive("customer", id, actor, new Date());
  assert.ok(result.ok, JSON.stringify(result));
}
const visible = async (id: string) => ({
  list: (await repository.listActive()).some((c) => c.id === id),
  search: (await repository.searchActive((await db.select({ w: customers.whatsapp }).from(customers).where(eq(customers.id, id)))[0]!.w)).some((c) => c.id === id),
  overview: (await repository.getOverviewSource(new Date())).customers.some((c) => c.id === id),
  analytics: (await service.getAnalytics(id, {})).status,
});

test("S7.3b D1: an active customer's fiche is unchanged and gains a privacy block (archivable per subscriptions)", async () => {
  const open = await seedCustomer(["active", "completed"]);
  const result = await service.getDetail(open.id);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const listed = (await repository.listActive()).find((c) => c.id === open.id);
  assert.deepEqual(result.detail.customer, listed);
  assert.deepEqual(Object.keys(result.detail), ["customer", "subscriptions", "privacy"]);
  assert.equal(result.detail.subscriptions.length, 2);
  assert.deepEqual(result.detail.privacy, { archivedAt: null, anonymizedAt: null, archivable: false, activeHolds: 0 });

  const finished = await seedCustomer(["completed", "cancelled"]);
  const done = await service.getDetail(finished.id);
  assert.ok(done.status === "ok" && done.detail.privacy.archivable);
  const none = await seedCustomer([]);
  const empty = await service.getDetail(none.id);
  assert.ok(empty.status === "ok" && empty.detail.privacy.archivable);
});

test("S7.3b D1/D2: an archived customer opens on the fiche and the archived list, stays out of every other reader", async () => {
  const subject = await seedCustomer(["completed"]);
  await archive(subject.id);
  const hold = await privacy.createHold({ scopeType: "customer", scopeId: subject.id, holdType: "legal", reason: "synthetic" }, actor, new Date());
  assert.ok(hold.ok);
  const released = await privacy.createHold({ scopeType: "customer", scopeId: subject.id, holdType: "dispute", reason: "synthetic" }, actor, new Date());
  assert.ok(released.ok && (await privacy.releaseHold(released.hold.id, actor, new Date())).ok);

  const result = await service.getDetail(subject.id);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.detail.customer.fullName, subject.name);
  assert.equal(result.detail.customer.whatsapp, subject.whatsapp);
  assert.ok(result.detail.privacy.archivedAt);
  assert.deepEqual({ ...result.detail.privacy, archivedAt: "set" }, { archivedAt: "set", anonymizedAt: null, archivable: false, activeHolds: 1 });
  assert.deepEqual(await visible(subject.id), { list: false, search: false, overview: false, analytics: "not_found" });

  const line = (await repository.listArchived()).find((c) => c.id === subject.id);
  assert.deepEqual(line, { id: subject.id, displayName: subject.name, archivedAt: result.detail.privacy.archivedAt, anonymizedAt: null, activeHolds: 1 });
  assert.equal(await repository.getDetail(subject.id, "active"), null);
});

test("S7.3b D1/D2: an anonymized customer shows only the pseudonym, without contact fields", async () => {
  const subject = await seedCustomer(["cancelled"]);
  await archive(subject.id);
  const anonymized = await privacy.anonymize("customer", subject.id, subject.name, actor, new Date());
  assert.ok(anonymized.ok, JSON.stringify(anonymized));

  const result = await service.getDetail(subject.id);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.detail.customer.fullName, pseudonymFor(subject.id));
  assert.equal(result.detail.customer.whatsapp, null);
  assert.equal(result.detail.customer.email, null);
  assert.ok(result.detail.privacy.anonymizedAt);
  assert.equal((await service.getAnalytics(subject.id, {})).status, "not_found");

  const line = (await repository.listArchived()).find((c) => c.id === subject.id);
  assert.deepEqual(Object.keys(line ?? {}).sort(), ["activeHolds", "anonymizedAt", "archivedAt", "displayName", "id"]);
  assert.equal(line?.displayName, pseudonymFor(subject.id));
  assert.equal(line?.anonymizedAt, result.detail.privacy.anonymizedAt);
  assert.ok(!JSON.stringify(line).includes(subject.whatsapp));
});

test("S7.3b D2: the archived list excludes active customers and is ordered by archivedAt desc", async () => {
  const first = await seedCustomer([]), second = await seedCustomer([]), active = await seedCustomer([]);
  await archive(first.id);
  await new Promise((resolve) => setTimeout(resolve, 15));
  await archive(second.id);
  const list = await repository.listArchived();
  const ids = list.map((c) => c.id);
  assert.ok(!ids.includes(active.id));
  assert.ok(ids.indexOf(second.id) < ids.indexOf(first.id) && ids.indexOf(second.id) >= 0);
  const times = list.map((c) => Date.parse(c.archivedAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

test("S7.3b D5: the request detail carries the prospect's privacy flags; archivable only once every request is terminal", async () => {
  const prospectId = randomUUID(), openId = randomUUID(), doneId = randomUUID();
  created.prospects.push(prospectId);
  await db.insert(prospects).values({ id: prospectId, fullName: testFixtureName("Privacy prospect"), whatsapp: uniqueTestWhatsapp() });
  await db.insert(serviceRequests).values([
    { id: openId, reference: `REQ-${openId}`, submissionToken: `fiche-${openId}`, prospectId, serviceId, status: "contacting" },
    { id: doneId, reference: `REQ-${doneId}`, submissionToken: `fiche-${doneId}`, prospectId, serviceId, status: "rejected" },
  ]);
  const before = await requests.getDetail(doneId);
  assert.deepEqual(before?.prospect.privacy, { archivedAt: null, anonymizedAt: null, archivable: false });
  await db.update(serviceRequests).set({ status: "abandoned" }).where(eq(serviceRequests.id, openId));
  assert.deepEqual((await requests.getDetail(doneId))?.prospect.privacy, { archivedAt: null, anonymizedAt: null, archivable: true });
  assert.ok((await privacy.archive("prospect", prospectId, actor, new Date())).ok);
  const archived = (await requests.getDetail(openId))?.prospect.privacy;
  assert.ok(archived?.archivedAt);
  assert.equal(archived?.archivable, false);
});

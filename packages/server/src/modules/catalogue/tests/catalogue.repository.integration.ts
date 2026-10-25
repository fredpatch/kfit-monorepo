import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { services, serviceVariants } from "../../../db/schema/catalogue.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { prospects, serviceRequests, waitlistEntries } from "../../../db/schema/prospects.js";
import { DrizzleCatalogueRepository } from "../repositories/catalogue.repositories.js";
import { CatalogueService } from "../services/catalogue.service.js";

const serviceId = randomUUID();
const variantId = randomUUID();
const customerId = randomUUID();
const prospectId = randomUUID();
const requestIds = [randomUUID(), randomUUID(), randomUUID()];
const service = new CatalogueService(new DrizzleCatalogueRepository(db));

before(async () => {
  assertLocalTestDatabase();
});
after(async () => {
  await db.delete(waitlistEntries).where(eq(waitlistEntries.serviceId, serviceId));
  await db.delete(serviceRequests).where(inArray(serviceRequests.id, requestIds));
  await db.delete(prospects).where(eq(prospects.id, prospectId));
  await db.delete(subscriptions).where(eq(subscriptions.serviceId, serviceId));
  await db.delete(customers).where(eq(customers.id, customerId));
  await db.delete(serviceVariants).where(eq(serviceVariants.serviceId, serviceId));
  await db.delete(services).where(eq(services.id, serviceId));
  await pool.end();
});

test("PostgreSQL catalogue overview counts S4 capacity claims, active waitlist and variants for each service", async () => {
  const now = Date.now();
  const day = 86_400_000;
  await db.insert(services).values({ id: serviceId, name: "Synthetic offer", slug: `synthetic-${serviceId.slice(0, 8)}`, pricingMode: "fixed", basePriceXaf: 50000, deliveryType: "time_based", capacityMode: "limited", capacityLimit: 4, waitlistEnabled: true });
  await db.insert(serviceVariants).values({ id: variantId, serviceId, name: "Duo", slug: "duo", priceXaf: 40000 });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Customer", whatsapp: `+2419${String(now).slice(-8)}` });
  const sub = (status: string, extra: Partial<typeof subscriptions.$inferInsert> = {}) => ({
    reference: `SUB-IT-${randomUUID()}`, customerId, serviceId, status, agreedPriceXaf: 1000, ...extra,
  });
  await db.insert(subscriptions).values([
    sub("active"),
    sub("paused", { variantId }),
    sub("ready_to_start", { variantId }),
    sub("completion_due"),
    sub("onboarding", { capacityReservedUntil: new Date(now + day) }), // valid hold → counts
    sub("onboarding", { capacityReservedUntil: new Date(now - day) }), // expired hold → ignored
    sub("onboarding"), // no hold → ignored
    sub("completed"),
    sub("cancelled"),
  ]);
  await db.insert(prospects).values({ id: prospectId, fullName: "Synthetic Prospect", whatsapp: `+2418${String(now).slice(-8)}` });
  await db.insert(serviceRequests).values(requestIds.map((id, i) => ({ id, reference: `REQ-IT-${id.slice(0, 8)}`, prospectId, serviceId, status: "waitlisted", submissionToken: randomUUID(), submittedAt: new Date(now - (i + 1) * day) })));
  await db.insert(waitlistEntries).values([
    { requestId: requestIds[0]!, serviceId, status: "active", enteredAt: new Date(now - 9 * day) },
    { requestId: requestIds[1]!, serviceId, status: "active", enteredAt: new Date(now - 2 * day) },
    { requestId: requestIds[2]!, serviceId, status: "withdrawn", enteredAt: new Date(now - 20 * day), leftAt: new Date(now - 10 * day) },
  ]);

  const overview = await service.listAdminOverview(new Date(now));
  const row = overview.services.find((s) => s.id === serviceId);
  assert.ok(row);
  assert.deepEqual({ occupied: row.occupancy.occupied, reservedOnboarding: row.occupancy.reservedOnboarding }, { occupied: 5, reservedOnboarding: 1 });
  assert.deepEqual(row.occupancy.byVariant, [{ variantId, occupied: 2, reservedOnboarding: 0 }]);
  assert.equal(row.waitlist.active, 2);
  assert.equal(row.waitlist.oldestEnteredAt, new Date(now - 9 * day).toISOString());
  assert.equal(row.minPriceXaf, 40000);
  assert.deepEqual(row.variants.map((v) => v.name), ["Duo"]);
});

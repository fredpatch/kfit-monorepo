import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { services } from "../../../db/schema/catalogue.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { appointments } from "../../../db/schema/coaching.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { DrizzleTodayRepository } from "../repositories/today.repository.js";

// Far-future window so pre-existing local rows never fall inside it.
const day = new Date("2031-03-10T23:00:00.000Z"); // 2031-03-11 00:00 Libreville
const next = new Date("2031-03-11T23:00:00.000Z");
const customerId = randomUUID();
const subscriptionId = randomUUID();
const prospectId = randomUUID();
const requestId = randomUUID();
const repository = new DrizzleTodayRepository(db);

before(async () => {
  assertLocalTestDatabase();
});
after(async () => {
  await db
    .delete(appointments)
    .where(eq(appointments.subscriptionId, subscriptionId));
  await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));
  await db.delete(customers).where(eq(customers.id, customerId));
  await db.delete(serviceRequests).where(eq(serviceRequests.id, requestId));
  await db.delete(prospects).where(eq(prospects.id, prospectId));
  await pool.end();
});

test("PostgreSQL agenda lists cross-subscription appointments of a business day with client and offer; counts use their windows", async () => {
  const [service] = await db
    .select({ id: services.id, name: services.name })
    .from(services)
    .limit(1);
  assert.ok(
    service,
    "integration requires at least one seeded catalogue service",
  );
  await db.insert(customers).values({
    id: customerId,
    fullName: "Synthetic Agenda",
    whatsapp: `+2417${String(Date.now()).slice(-8)}`,
  });
  await db.insert(subscriptions).values({
    id: subscriptionId,
    reference: `SUB-IT-${subscriptionId}`,
    customerId,
    serviceId: service.id,
    status: "active",
    agreedPriceXaf: 1000,
  });
  const at = (iso: string, hours = 1) => ({
    scheduledStart: new Date(iso),
    scheduledEnd: new Date(new Date(iso).getTime() + hours * 3_600_000),
  });
  const rows = await db
    .insert(appointments)
    .values([
      { subscriptionId, ...at("2031-03-10T22:30:00Z"), status: "confirmed" }, // previous business day (23:30 Libreville)
      { subscriptionId, ...at("2031-03-10T23:00:00Z"), status: "scheduled" }, // 00:00 Libreville → in
      {
        subscriptionId,
        ...at("2031-03-11T16:00:00Z"),
        status: "completed",
        completedAt: new Date("2031-03-11T17:00:00Z"),
      }, // in
      { subscriptionId, ...at("2031-03-11T23:00:00Z"), status: "confirmed" }, // next business day
    ])
    .returning({ id: appointments.id });
  assert.equal(rows.length, 4);

  const list = await repository.listAppointments(day, next, null);
  assert.deepEqual(
    list.map((a) => a.status),
    ["scheduled", "completed"],
  );
  assert.equal(list[0]?.customer.fullName, "Synthetic Agenda");
  assert.equal(list[0]?.serviceName, service.name);
  assert.deepEqual(
    (await repository.listAppointments(day, next, ["completed"])).map(
      (a) => a.status,
    ),
    ["completed"],
  );
  assert.equal(await repository.countCompletedAppointmentsSince(day), 1);

  await db.insert(prospects).values({
    id: prospectId,
    fullName: "Synthetic Prospect",
    whatsapp: `+2416${String(Date.now()).slice(-8)}`,
  });
  await db.insert(serviceRequests).values({
    id: requestId,
    reference: `REQ-IT-${requestId.slice(0, 8)}`,
    prospectId,
    serviceId: service.id,
    status: "submitted",
    submissionToken: randomUUID(),
    submittedAt: new Date("2031-03-11T08:00:00Z"),
  });
  assert.equal(await repository.countRequestsSubmittedSince(day), 1);

  const open = await repository.listSubscriptionsByStatus(["active"]);
  assert.ok(
    open.some(
      (s) =>
        s.id === subscriptionId &&
        s.customerName === "Synthetic Agenda" &&
        s.offer.startsWith(service.name),
    ),
  );
  await db.delete(appointments).where(
    inArray(
      appointments.id,
      rows.map((r) => r.id),
    ),
  );
});

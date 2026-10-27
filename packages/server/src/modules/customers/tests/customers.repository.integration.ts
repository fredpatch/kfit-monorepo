import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import {
  componentEvents,
  customers,
  subscriptionComponents,
  subscriptionPauses,
  subscriptions,
} from "../../../db/schema/customers.js";
import {
  appointmentEvents,
  appointments,
  followUps,
} from "../../../db/schema/coaching.js";
import { secureAccessTokens } from "../../../db/schema/documents.js";
import { services } from "../../../db/schema/catalogue.js";
import { prospects } from "../../../db/schema/prospects.js";
import { DrizzleCustomersRepository } from "../repositories/customers.repository.js";
import {
  CustomersService,
  type NormalizedCustomerInput,
} from "../services/customers.service.js";

const userId = randomUUID();
const prospectId = randomUUID();
const ids = new Set<string>();
const subscriptionIds = new Set<string>();
const phones = new Set<string>();
const options = {
  auditHashPepper: "synthetic-integration-pepper-at-least-32-characters",
};
const repository = new DrizzleCustomersRepository(db, options);
const service = new CustomersService(repository);
const actor = {
  userId,
  requestId: randomUUID(),
  ipAddress: "192.0.2.1",
  userAgent: "synthetic-test",
};
function input(): NormalizedCustomerInput {
  const phone =
    "+241" +
    String(
      BigInt("0x" + randomUUID().replaceAll("-", "").slice(0, 12)) %
        1000000000000n,
    ).padStart(12, "0");
  phones.add(phone);
  return {
    fullName: "Synthetic Customer",
    whatsapp: phone,
    email: "customer@example.invalid",
    city: "Synthetic City",
    country: "Synthetic Country",
    preferredContactChannel: "whatsapp",
  };
}
before(async () => {
  assertLocalTestDatabase();
  await db.insert(users).values({
    id: userId,
    email: `customers-${userId}@example.invalid`,
    passwordHash: "synthetic",
    role: "admin",
    status: "active",
  });
});
after(async () => {
  if (subscriptionIds.size)
    await db
      .delete(subscriptions)
      .where(inArray(subscriptions.id, [...subscriptionIds]));
  await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
  if (ids.size)
    await db.delete(customers).where(inArray(customers.id, [...ids]));
  if (phones.size)
    await db.delete(customers).where(inArray(customers.whatsapp, [...phones]));
  await db.delete(prospects).where(eq(prospects.id, prospectId));
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

test("PostgreSQL manual create returns null prospectId despite a matching prospect and writes safe transactional audit", async () => {
  const data = input();
  await db.insert(prospects).values({
    id: prospectId,
    fullName: "Synthetic Prospect",
    whatsapp: data.whatsapp,
    source: "integration-test",
  });
  const result = await service.createManual({ ...data, prospectId }, actor);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected create");
  ids.add(result.customer.id);
  assert.deepEqual(result.customer, {
    ...data,
    id: result.customer.id,
    prospectId: null,
    createdAt: result.customer.createdAt,
  });
  assert.ok(Number.isFinite(Date.parse(result.customer.createdAt)));
  const [stored] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, result.customer.id));
  assert.equal(stored?.prospectId, null);
  const events = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.entityId, result.customer.id));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "customer.created");
  assert.equal(events[0]?.entityType, "customer");
  assert.equal(events[0]?.result, "success");
  assert.equal(events[0]?.actorUserId, userId);
  assert.equal(events[0]?.requestId, actor.requestId);
  assert.deepEqual(events[0]?.metadataJson, { source: "manual" });
  assert.notEqual(events[0]?.ipHash, actor.ipAddress);
  assert.notEqual(events[0]?.userAgentHash, actor.userAgent);
});

test("PostgreSQL normalized WhatsApp search and duplicate rejection include legacy formatted active rows", async () => {
  const data = input();
  const formatted = data.whatsapp.slice(0, 4) + " " + data.whatsapp.slice(4);
  const [row] = await db
    .insert(customers)
    .values({ ...data, whatsapp: formatted })
    .returning({ id: customers.id });
  assert.ok(row);
  ids.add(row.id);
  const found = await service.search(formatted);
  assert.equal(found.status, "ok");
  if (found.status !== "ok") throw new Error("expected lookup");
  assert.deepEqual(
    found.customers.map((item) => item.id),
    [row.id],
  );
  assert.deepEqual(await service.createManual(data, actor), {
    status: "duplicate",
  });
  assert.equal(
    (
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, row.id))
    ).length,
    0,
  );
});

test("PostgreSQL excludes archived and anonymized customers from list/search and collision checks", async () => {
  const data = input();
  for (const lifecycle of [
    { archivedAt: new Date() },
    { anonymizedAt: new Date() },
  ]) {
    const [row] = await db
      .insert(customers)
      .values({ ...data, ...lifecycle })
      .returning({ id: customers.id });
    assert.ok(row);
    ids.add(row.id);
  }
  assert.deepEqual(await service.search(data.whatsapp), {
    status: "ok",
    customers: [],
  });
  const list = await repository.listActive();
  for (const id of ids) {
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    if (row?.archivedAt || row?.anonymizedAt)
      assert.ok(!list.some((customer) => customer.id === id));
  }
  const created = await service.createManual(data, actor);
  assert.equal(created.status, "ok");
  if (created.status !== "ok") throw new Error("expected create");
  ids.add(created.customer.id);
  assert.ok(
    (await repository.listActive()).some(
      (customer) => customer.id === created.customer.id,
    ),
  );
});

test("PostgreSQL concurrent normalized creates commit exactly one customer and audit", async () => {
  const data = input();
  const results = await Promise.all([
    service.createManual(data, actor),
    service.createManual(
      {
        ...data,
        whatsapp: data.whatsapp.slice(0, 4) + " " + data.whatsapp.slice(4),
      },
      actor,
    ),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [
    "duplicate",
    "ok",
  ]);
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.whatsapp, data.whatsapp));
  assert.equal(rows.length, 1);
  assert.equal(
    (
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, rows[0]!.id))
    ).length,
    1,
  );
});

test("PostgreSQL audit insert failure rolls back the inserted customer and releases the collision lock", async () => {
  const data = input();
  // The customer insert succeeds; the audit actor FK then rejects this nonexistent user.
  await assert.rejects(
    service.createManual(data, { ...actor, userId: randomUUID() }),
  );
  assert.equal(
    (
      await db
        .select()
        .from(customers)
        .where(eq(customers.whatsapp, data.whatsapp))
    ).length,
    0,
  );
  const result = await service.createManual(data, actor);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("expected retry create");
  assert.equal(
    (
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, result.customer.id))
    ).length,
    1,
  );
});

test("PostgreSQL customer detail returns the profile with its subscriptions newest first, and null for unknown ids", async () => {
  const created = await service.createManual(input(), actor);
  assert.equal(created.status, "ok");
  if (created.status !== "ok") return;
  ids.add(created.customer.id);
  const [catalogueService] = await db
    .select({ id: services.id, name: services.name, slug: services.slug })
    .from(services)
    .limit(1);
  assert.ok(
    catalogueService,
    "integration requires at least one seeded catalogue service",
  );
  const older = {
    id: randomUUID(),
    reference: `SUB-IT-${randomUUID()}`,
    customerId: created.customer.id,
    serviceId: catalogueService.id,
    status: "completed",
    agreedPriceXaf: 1000,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const newer = {
    id: randomUUID(),
    reference: `SUB-IT-${randomUUID()}`,
    customerId: created.customer.id,
    serviceId: catalogueService.id,
    status: "onboarding",
    agreedPriceXaf: 2000,
    renewedFromSubscriptionId: older.id,
  };
  subscriptionIds.add(newer.id);
  subscriptionIds.add(older.id);
  await db.insert(subscriptions).values(older);
  await db.insert(subscriptions).values(newer);

  const result = await service.getDetail(created.customer.id);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.detail.customer.id, created.customer.id);
  assert.deepEqual(
    result.detail.subscriptions.map((sub) => [
      sub.id,
      sub.status,
      sub.serviceName,
      sub.serviceSlug,
      sub.variantId,
    ]),
    [
      [
        newer.id,
        "onboarding",
        catalogueService.name,
        catalogueService.slug,
        null,
      ],
      [
        older.id,
        "completed",
        catalogueService.name,
        catalogueService.slug,
        null,
      ],
    ],
  );
  assert.equal(
    result.detail.subscriptions[0]?.renewedFromSubscriptionId,
    older.id,
  );
  assert.deepEqual(await service.getDetail(randomUUID()), {
    status: "not_found",
  });
  await db
    .delete(subscriptions)
    .where(inArray(subscriptions.id, [newer.id, older.id]));
  subscriptionIds.clear();
});

test("PostgreSQL analytics source reads only this customer's rows and feeds the validated calculations", async () => {
  const created = await service.createManual(input(), actor);
  const other = await service.createManual(input(), actor);
  assert.ok(created.status === "ok" && other.status === "ok");
  if (created.status !== "ok" || other.status !== "ok") return;
  ids.add(created.customer.id);
  ids.add(other.customer.id);
  const [catalogueService] = await db
    .select({ id: services.id })
    .from(services)
    .limit(1);
  assert.ok(
    catalogueService,
    "integration requires at least one seeded catalogue service",
  );
  const day = 86_400_000,
    now = Date.now();
  const mine = {
    id: randomUUID(),
    reference: `SUB-IT-${randomUUID()}`,
    customerId: created.customer.id,
    serviceId: catalogueService.id,
    status: "active",
    agreedPriceXaf: 1000,
    actualStartDate: new Date(now - 20 * day),
    plannedEndDate: new Date(now + 20 * day),
    followUpFrequencyDaysOverride: 7,
  };
  const theirs = {
    id: randomUUID(),
    reference: `SUB-IT-${randomUUID()}`,
    customerId: other.customer.id,
    serviceId: catalogueService.id,
    status: "active",
    agreedPriceXaf: 1000,
  };
  subscriptionIds.add(mine.id);
  subscriptionIds.add(theirs.id);
  await db.insert(subscriptions).values([mine, theirs]);
  const [component] = await db
    .insert(subscriptionComponents)
    .values({
      subscriptionId: mine.id,
      componentType: "session",
      labelSnapshot: "Séance",
      quantityEntitled: 8,
      quantityConsumed: 2,
    })
    .returning({ id: subscriptionComponents.id });
  assert.ok(component);
  const [done, missed, foreign] = await db
    .insert(appointments)
    .values([
      {
        subscriptionId: mine.id,
        scheduledStart: new Date(now - 10 * day),
        scheduledEnd: new Date(now - 10 * day + 3_600_000),
        status: "completed",
        completedAt: new Date(now - 10 * day),
      },
      {
        subscriptionId: mine.id,
        scheduledStart: new Date(now - 5 * day),
        scheduledEnd: new Date(now - 5 * day + 3_600_000),
        status: "missed",
      },
      {
        subscriptionId: theirs.id,
        scheduledStart: new Date(now - 5 * day),
        scheduledEnd: new Date(now - 5 * day + 3_600_000),
        status: "completed",
        completedAt: new Date(now - 5 * day),
      },
    ])
    .returning({ id: appointments.id });
  assert.ok(done && missed && foreign);
  await db.insert(componentEvents).values([
    {
      subscriptionComponentId: component.id,
      eventType: "appointment_completed",
      quantity: 1,
      relatedAppointmentId: done.id,
      createdAt: new Date(now - 10 * day),
    },
    {
      subscriptionComponentId: component.id,
      eventType: "missed",
      quantity: 1,
      relatedAppointmentId: missed.id,
      createdAt: new Date(now - 5 * day),
    },
  ]);
  await db.insert(appointmentEvents).values({
    appointmentId: missed.id,
    eventType: "appointment.reschedule_requested",
    fromStatus: "scheduled",
    toStatus: "reschedule_requested",
    actorType: "customer",
    createdAt: new Date(now - 6 * day),
  });
  await db.insert(followUps).values({
    subscriptionId: mine.id,
    followUpType: "check_in",
    occurredAt: new Date(now - 3 * day),
    status: "done",
    completedAt: new Date(now - 3 * day),
  });
  await db.insert(subscriptionPauses).values({
    subscriptionId: mine.id,
    startedAt: new Date(now - 15 * day),
    endedAt: new Date(now - 14 * day),
    reason: "synthetic",
  });
  await db.insert(secureAccessTokens).values([
    {
      tokenHash: randomUUID(),
      resourceType: "appointment",
      resourceId: missed.id,
      action: "appointment_response",
      expiresAt: new Date(now + day),
      createdAt: new Date(now - 7 * day),
      usedAt: new Date(now - 7 * day + 2 * 3_600_000),
    },
    {
      tokenHash: randomUUID(),
      resourceType: "appointment",
      resourceId: foreign.id,
      action: "appointment_response",
      expiresAt: new Date(now + day),
      createdAt: new Date(now - 7 * day),
    },
  ]);
  try {
    const result = await service.getAnalytics(created.customer.id, {
      periode: "30j",
    });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    const a = result.analytics;
    assert.equal(a.focusSubscriptionId, mine.id);
    assert.deepEqual(a.attendance, {
      honored: 1,
      missed: 1,
      rescheduled: 0,
      rate: 0.5,
    });
    assert.deepEqual(a.links, {
      sent: 1,
      used: 1,
      medianHoursToUse: 2,
      rescheduleRequests: 1,
    });
    assert.equal(a.cadence?.cadenceDays, 7);
    assert.equal(a.cadence?.series.at(-1)?.daysSinceContact, 3);
    assert.equal(a.pace?.realized, 2);
    assert.deepEqual(
      a.pace?.series.map((p) => p.realized),
      [0, 1, 2, 2],
    );
    assert.deepEqual(
      a.journey.map((j) => j.subscriptionId),
      [mine.id],
    );
    assert.deepEqual(
      await service.getAnalytics(created.customer.id, {
        abonnement: theirs.id,
      }),
      { status: "invalid", reason: "subscription_not_owned" },
    );
  } finally {
    await db
      .delete(secureAccessTokens)
      .where(
        inArray(secureAccessTokens.resourceId, [
          done.id,
          missed.id,
          foreign.id,
        ]),
      );
    await db
      .delete(appointmentEvents)
      .where(eq(appointmentEvents.appointmentId, missed.id));
    await db
      .delete(componentEvents)
      .where(eq(componentEvents.subscriptionComponentId, component.id));
    await db
      .delete(appointments)
      .where(inArray(appointments.id, [done.id, missed.id, foreign.id]));
    await db
      .delete(subscriptionComponents)
      .where(eq(subscriptionComponents.id, component.id));
    await db.delete(followUps).where(eq(followUps.subscriptionId, mine.id));
    await db
      .delete(subscriptionPauses)
      .where(eq(subscriptionPauses.subscriptionId, mine.id));
    await db
      .delete(subscriptions)
      .where(inArray(subscriptions.id, [mine.id, theirs.id]));
    subscriptionIds.clear();
  }
});

test("PostgreSQL overview returns enriched rows for active customers only, with batched cadence, next appointment and counts", async () => {
  const created = await service.createManual(input(), actor);
  const archived = await service.createManual(input(), actor);
  assert.ok(created.status === "ok" && archived.status === "ok");
  if (created.status !== "ok" || archived.status !== "ok") return;
  ids.add(created.customer.id);
  ids.add(archived.customer.id);
  await db
    .update(customers)
    .set({ archivedAt: new Date() })
    .where(eq(customers.id, archived.customer.id));
  const [catalogueService] = await db
    .select({ id: services.id })
    .from(services)
    .limit(1);
  assert.ok(
    catalogueService,
    "integration requires at least one seeded catalogue service",
  );
  const day = 86_400_000,
    now = Date.now();
  const active = {
    id: randomUUID(),
    reference: `SUB-IT-${randomUUID()}`,
    customerId: created.customer.id,
    serviceId: catalogueService.id,
    status: "active",
    agreedPriceXaf: 1000,
    actualStartDate: new Date(now - 12 * day),
    followUpFrequencyDaysOverride: 7,
    createdAt: new Date(now - 13 * day),
  };
  const preparing = {
    id: randomUUID(),
    reference: `SUB-IT-${randomUUID()}`,
    customerId: created.customer.id,
    serviceId: catalogueService.id,
    status: "onboarding",
    agreedPriceXaf: 1000,
  };
  const hidden = {
    id: randomUUID(),
    reference: `SUB-IT-${randomUUID()}`,
    customerId: archived.customer.id,
    serviceId: catalogueService.id,
    status: "active",
    agreedPriceXaf: 1000,
  };
  subscriptionIds.add(active.id);
  subscriptionIds.add(preparing.id);
  subscriptionIds.add(hidden.id);
  await db.insert(subscriptions).values([active, preparing, hidden]);
  const [next] = await db
    .insert(appointments)
    .values({
      subscriptionId: active.id,
      scheduledStart: new Date(now + 2 * day),
      scheduledEnd: new Date(now + 2 * day + 3_600_000),
      status: "confirmed",
    })
    .returning({ id: appointments.id });
  assert.ok(next);
  try {
    const overview = await service.getOverview();
    assert.equal(
      overview.customers.some(
        (row) => row.customer.id === archived.customer.id,
      ),
      false,
    );
    const row = overview.customers.find(
      (r) => r.customer.id === created.customer.id,
    );
    assert.ok(row);
    assert.equal(row.clientStatus, "active");
    assert.equal(row.currentSubscription?.id, active.id);
    assert.equal(row.otherOpenSubscriptions, 1);
    assert.equal(row.cadence?.state, "overdue");
    assert.equal(row.cadence?.overdueByDays, 5);
    assert.equal(row.nextAppointment?.id, next.id);
    assert.equal(row.lastContactAt, active.actualStartDate.toISOString());
    assert.deepEqual(row.views, ["all", "active", "overdue"]);
    assert.equal(overview.counts.all, overview.customers.length);
  } finally {
    await db.delete(appointments).where(eq(appointments.id, next.id));
    await db
      .delete(subscriptions)
      .where(inArray(subscriptions.id, [active.id, preparing.id, hidden.id]));
    subscriptionIds.clear();
  }
});

import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { services } from "../../../db/schema/catalogue.js";
import { contactAttempts, prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { DrizzleAdminRequestsRepository } from "../repositories/admin-requests.repositories.js";

const pepper = "a-secure-integration-pepper-that-is-longer-than-32-characters";
const serviceId = randomUUID();
const userId = randomUUID();
const prospectWhatsapp = `+241${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

after(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
  await db.delete(contactAttempts).where(eq(contactAttempts.createdByUserId, userId));
  const [prospect] = await db.select({ id: prospects.id }).from(prospects).where(eq(prospects.whatsapp, prospectWhatsapp)).limit(1);
  if (prospect) {
    await db.delete(serviceRequests).where(eq(serviceRequests.prospectId, prospect.id));
    await db.delete(prospects).where(eq(prospects.id, prospect.id));
  }
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(services).where(eq(services.id, serviceId));
  await pool.end();
});

async function seedRequest(): Promise<string> {
  const [prospect] = await db
    .insert(prospects)
    .values({ fullName: "Admin Requests Integration", whatsapp: prospectWhatsapp, source: "integration-test" })
    .returning({ id: prospects.id });
  if (!prospect) throw new Error("prospect insert returned no row");

  const [request] = await db
    .insert(serviceRequests)
    .values({
      reference: `REQ-ADMIN-${randomUUID().slice(0, 8).toUpperCase()}`,
      submissionToken: `admin-integration-${randomUUID()}`,
      prospectId: prospect.id,
      serviceId,
      status: "submitted",
    })
    .returning({ id: serviceRequests.id });
  if (!request) throw new Error("service request insert returned no row");
  return request.id;
}

test("Drizzle admin requests repository transitions status and writes an audit event in the same transaction", async () => {
  await db.insert(services).values({
    id: serviceId,
    name: "Admin Requests Integration Service",
    slug: `admin-requests-integration-${serviceId}`,
    pricingMode: "quote",
    deliveryType: "one_time",
    availabilityStatus: "open",
    capacityMode: "unlimited",
    isPublic: true,
  });
  await db.insert(users).values({ id: userId, email: `admin-requests-${userId}@kfit.local`, passwordHash: "test-hash", status: "active", role: "coach" });

  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest();

  const result = await repository.transitionStatus(
    requestId,
    "contacting",
    { userId },
    { ipAddress: "203.0.113.9", userAgent: "KFIT integration" },
    new Date(),
  );
  assert.notEqual(result, "not_found");
  assert.notEqual(result, "invalid_transition");
  if (result === "not_found" || result === "invalid_transition") return;
  assert.equal(result.request.status, "contacting");

  const [row] = await db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  assert.equal(row?.status, "contacting");

  const [audit] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.entityId, requestId));
  assert.equal(audit?.eventType, "request.status_changed");
  assert.equal(audit?.entityType, "service_request");
  assert.equal(audit?.result, "success");
  assert.deepEqual(audit?.metadataJson, { fromStatus: "submitted", toStatus: "contacting" });
  assert.notEqual(audit?.ipHash, null);

  const metadataString = JSON.stringify(audit?.metadataJson ?? {});
  assert.ok(!metadataString.includes("Admin Requests Integration"), "audit metadata must not contain the prospect's name");
  assert.ok(!metadataString.includes(prospectWhatsapp), "audit metadata must not contain the prospect's WhatsApp number");
});

test("Drizzle admin requests repository rejects a disallowed transition and writes no audit event", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest();

  const result = await repository.transitionStatus(requestId, "abandoned", { userId }, { ipAddress: null, userAgent: null }, new Date());
  assert.equal(result, "invalid_transition");

  const [row] = await db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  assert.equal(row?.status, "submitted");

  const auditRows = await db.select().from(auditEvents).where(eq(auditEvents.entityId, requestId));
  assert.equal(auditRows.length, 0);
});

test("Drizzle admin requests repository rolls back the status update when the audit insert fails inside the same transaction", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest();
  const nonExistentActorId = randomUUID();

  await assert.rejects(() =>
    repository.transitionStatus(requestId, "contacting", { userId: nonExistentActorId }, { ipAddress: null, userAgent: null }, new Date()),
  );

  const [row] = await db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  assert.equal(row?.status, "submitted", "status must remain unchanged when the audit insert in the same transaction fails");

  const auditRows = await db.select().from(auditEvents).where(eq(auditEvents.entityId, requestId));
  assert.equal(auditRows.length, 0, "no audit row must survive a rolled-back transaction");
});

test("Drizzle admin requests repository logs a contact attempt and writes its audit event atomically", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest();
  const occurredAt = new Date();

  const result = await repository.createContactAttempt(
    requestId,
    { channel: "phone_call", direction: "outbound", outcome: "callback_requested", note: "Rappeler demain", occurredAt, nextActionAt: null },
    { userId },
    { ipAddress: "203.0.113.10", userAgent: "KFIT integration" },
    occurredAt,
  );

  assert.notEqual(result, "not_found");
  if (result === "not_found") return;
  assert.equal(result.contactAttempt.channel, "phone_call");
  assert.equal(result.contactAttempt.outcome, "callback_requested");

  const attemptRows = await db.select().from(contactAttempts).where(eq(contactAttempts.requestId, requestId));
  assert.equal(attemptRows.length, 1);
  assert.equal(attemptRows[0]?.createdByUserId, userId);

  const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.entityId, requestId));
  assert.equal(audit?.eventType, "request.contact_attempt_logged");
  assert.deepEqual(audit?.metadataJson, { channel: "phone_call", direction: "outbound", outcome: "callback_requested" });
});

test("Drizzle admin requests repository rolls back the contact attempt insert when the audit insert fails", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest();
  const nonExistentActorId = randomUUID();
  const occurredAt = new Date();

  await assert.rejects(() =>
    repository.createContactAttempt(
      requestId,
      { channel: "email", direction: "inbound", outcome: "reached", note: null, occurredAt, nextActionAt: null },
      { userId: nonExistentActorId },
      { ipAddress: null, userAgent: null },
      occurredAt,
    ),
  );

  const attemptRows = await db.select().from(contactAttempts).where(eq(contactAttempts.requestId, requestId));
  assert.equal(attemptRows.length, 0, "no contact attempt row must survive a rolled-back transaction");
});

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { services, serviceVariants } from "../../../db/schema/catalogue.js";
import { contactAttempts, prospects, qualificationReviews, serviceRequests, waitlistEntries } from "../../../db/schema/prospects.js";
import { DrizzleAdminRequestsRepository } from "../repositories/admin-requests.repositories.js";

const pepper = "a-secure-integration-pepper-that-is-longer-than-32-characters";
const serviceId = randomUUID();
const variantId = randomUUID();
const userId = randomUUID();
const prospectWhatsapp = `+241${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

before(async () => {
  await db.insert(services).values({
    id: serviceId,
    name: "Admin Requests Integration Service",
    slug: `admin-requests-integration-${serviceId}`,
    pricingMode: "quote",
    deliveryType: "one_time",
    availabilityStatus: "open",
    capacityMode: "unlimited",
    waitlistEnabled: true,
    isPublic: true,
  });
  await db.insert(serviceVariants).values({
    id: variantId,
    serviceId,
    name: "Qualification Integration Variant",
    slug: `qualification-integration-${variantId}`,
    priceXaf: 50000,
    availabilityStatus: "open",
    sortOrder: 1,
  });
  await db.insert(users).values({ id: userId, email: `admin-requests-${userId}@kfit.local`, passwordHash: "test-hash", status: "active", role: "coach" });
});

after(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
  await db.delete(contactAttempts).where(eq(contactAttempts.createdByUserId, userId));
  const prospectRows = await db.select({ id: prospects.id }).from(prospects).where(eq(prospects.whatsapp, prospectWhatsapp));
  for (const prospect of prospectRows) {
    const requestRows = await db.select({ id: serviceRequests.id }).from(serviceRequests).where(eq(serviceRequests.prospectId, prospect.id));
    for (const request of requestRows) {
      await db.delete(qualificationReviews).where(eq(qualificationReviews.requestId, request.id));
      await db.delete(waitlistEntries).where(eq(waitlistEntries.requestId, request.id));
    }
    await db.delete(serviceRequests).where(eq(serviceRequests.prospectId, prospect.id));
    await db.delete(prospects).where(eq(prospects.id, prospect.id));
  }
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(serviceVariants).where(eq(serviceVariants.id, variantId));
  await db.delete(services).where(eq(services.id, serviceId));
  await pool.end();
});

async function seedRequest(status = "submitted"): Promise<string> {
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
      status,
    })
    .returning({ id: serviceRequests.id });
  if (!request) throw new Error("service request insert returned no row");
  return request.id;
}

test("Drizzle admin requests repository transitions status and writes an audit event in the same transaction", async () => {
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

test("Drizzle admin requests repository records one qualification review, transitions status and writes safe audit metadata", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest("qualification_in_progress");
  const now = new Date();

  const result = await repository.recordQualificationReview(
    requestId,
    {
      outcome: "qualified",
      finalVariantId: variantId,
      agreedPriceXaf: 50000,
      targetStartDate: null,
      suitabilityNote: "OK to start",
      conditions: null,
      blockers: null,
    },
    { userId },
    { ipAddress: "203.0.113.11", userAgent: "KFIT integration" },
    now,
  );

  assert.notEqual(result, "not_found");
  assert.notEqual(result, "invalid_transition");
  assert.notEqual(result, "variant_invalid");
  if (result === "not_found" || result === "invalid_transition" || result === "variant_invalid") return;
  assert.equal(result.request.status, "qualified");
  assert.equal(result.qualificationReview.version, 1);

  const [row] = await db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  assert.equal(row?.status, "qualified");

  const reviewRows = await db.select().from(qualificationReviews).where(eq(qualificationReviews.requestId, requestId));
  assert.equal(reviewRows.length, 1);
  assert.equal(reviewRows[0]?.version, 1);
  assert.equal(reviewRows[0]?.supersededAt, null);

  const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.entityId, requestId));
  assert.equal(audit?.eventType, "request.qualification_review_recorded");
  assert.deepEqual(audit?.metadataJson, {
    version: 1,
    outcome: "qualified",
    fromStatus: "qualification_in_progress",
    toStatus: "qualified",
  });

  const metadataString = JSON.stringify(audit?.metadataJson ?? {});
  assert.ok(!metadataString.includes("OK to start"), "audit metadata must not contain suitability notes");
  assert.ok(!metadataString.includes(prospectWhatsapp), "audit metadata must not contain the prospect's WhatsApp number");
});

test("Drizzle admin requests repository rejects a second qualification review after the request transitions", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest("qualification_in_progress");
  const now = new Date();

  const first = await repository.recordQualificationReview(
    requestId,
    { outcome: "rejected", finalVariantId: null, agreedPriceXaf: null, targetStartDate: null, suitabilityNote: null, conditions: null, blockers: ["Hors périmètre"] },
    { userId },
    { ipAddress: null, userAgent: null },
    now,
  );
  assert.notEqual(first, "not_found");
  assert.notEqual(first, "invalid_transition");
  assert.notEqual(first, "variant_invalid");

  const second = await repository.recordQualificationReview(
    requestId,
    { outcome: "rejected", finalVariantId: null, agreedPriceXaf: null, targetStartDate: null, suitabilityNote: null, conditions: null, blockers: null },
    { userId },
    { ipAddress: null, userAgent: null },
    now,
  );
  assert.equal(second, "invalid_transition");

  const reviewRows = await db.select().from(qualificationReviews).where(eq(qualificationReviews.requestId, requestId));
  assert.equal(reviewRows.length, 1);
});

test("Drizzle admin requests repository rolls back the qualification review when the audit insert fails", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest("qualification_in_progress");
  const nonExistentActorId = randomUUID();

  await assert.rejects(() =>
    repository.recordQualificationReview(
      requestId,
      {
        outcome: "qualified",
        finalVariantId: variantId,
        agreedPriceXaf: 50000,
        targetStartDate: null,
        suitabilityNote: null,
        conditions: null,
        blockers: null,
      },
      { userId: nonExistentActorId },
      { ipAddress: null, userAgent: null },
      new Date(),
    ),
  );

  const [row] = await db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  assert.equal(row?.status, "qualification_in_progress");
  const reviewRows = await db.select().from(qualificationReviews).where(eq(qualificationReviews.requestId, requestId));
  assert.equal(reviewRows.length, 0);
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

test("Drizzle admin requests repository creates a waitlist entry, transitions status and writes safe audit metadata atomically", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest("contacting");
  const now = new Date();

  const result = await repository.createWaitlistEntry(
    requestId,
    { variantId, priorityNote: "High priority because of a free-text prospect context" },
    { userId },
    { ipAddress: "203.0.113.12", userAgent: "KFIT integration" },
    now,
  );

  assert.notEqual(result, "not_found");
  assert.notEqual(result, "invalid_transition");
  assert.notEqual(result, "not_eligible");
  assert.notEqual(result, "already_active");
  assert.notEqual(result, "variant_invalid");
  if (typeof result === "string") return;
  assert.equal(result.request.status, "waitlisted");
  assert.equal(result.waitlistEntry.status, "active");
  assert.equal(result.waitlistEntry.variantId, variantId);

  const [row] = await db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  assert.equal(row?.status, "waitlisted");

  const entryRows = await db.select().from(waitlistEntries).where(eq(waitlistEntries.requestId, requestId));
  assert.equal(entryRows.length, 1);
  assert.equal(entryRows[0]?.status, "active");
  assert.equal(entryRows[0]?.leftAt, null);

  const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.entityId, requestId));
  assert.equal(audit?.eventType, "request.waitlist_entered");
  assert.deepEqual(audit?.metadataJson, {
    waitlistEntryId: result.waitlistEntry.id,
    fromStatus: "contacting",
    toStatus: "waitlisted",
    serviceId,
    variantId,
  });

  const metadataString = JSON.stringify(audit?.metadataJson ?? {});
  assert.ok(!metadataString.includes("High priority"), "audit metadata must not contain priority notes");
  assert.ok(!metadataString.includes(prospectWhatsapp), "audit metadata must not contain the prospect's WhatsApp number");
});

test("Drizzle admin requests repository rejects duplicate active waitlist creation after the row-locked status check", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest("submitted");

  const first = await repository.createWaitlistEntry(requestId, { variantId: null, priorityNote: null }, { userId }, { ipAddress: null, userAgent: null }, new Date());
  assert.notEqual(first, "not_found");
  assert.notEqual(first, "invalid_transition");
  assert.notEqual(first, "not_eligible");
  assert.notEqual(first, "already_active");
  assert.notEqual(first, "variant_invalid");

  const second = await repository.createWaitlistEntry(requestId, { variantId: null, priorityNote: null }, { userId }, { ipAddress: null, userAgent: null }, new Date());
  assert.equal(second, "invalid_transition");

  const entryRows = await db.select().from(waitlistEntries).where(eq(waitlistEntries.requestId, requestId));
  assert.equal(entryRows.length, 1);
});

test("Drizzle admin requests repository withdraws an active waitlist entry and abandons the request atomically", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest("submitted");
  const created = await repository.createWaitlistEntry(requestId, { variantId: null, priorityNote: null }, { userId }, { ipAddress: null, userAgent: null }, new Date());
  assert.notEqual(created, "not_found");
  assert.notEqual(created, "invalid_transition");
  assert.notEqual(created, "not_eligible");
  assert.notEqual(created, "already_active");
  assert.notEqual(created, "variant_invalid");

  const result = await repository.withdrawWaitlistEntry(
    requestId,
    { userId },
    { ipAddress: "203.0.113.13", userAgent: "KFIT integration" },
    new Date(),
  );

  assert.notEqual(result, "not_found");
  assert.notEqual(result, "invalid_transition");
  assert.notEqual(result, "entry_not_found");
  if (typeof result === "string") return;
  assert.equal(result.request.status, "abandoned");
  assert.equal(result.waitlistEntry.status, "withdrawn");
  assert.notEqual(result.waitlistEntry.leftAt, null);

  const [row] = await db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  assert.equal(row?.status, "abandoned");

  const audits = await db.select().from(auditEvents).where(eq(auditEvents.entityId, requestId));
  assert.equal(audits.some((audit) => audit.eventType === "request.waitlist_withdrawn"), true);
});

test("Drizzle admin requests repository rolls back waitlist creation when the audit insert fails", async () => {
  const repository = new DrizzleAdminRequestsRepository(db, { auditHashPepper: pepper });
  const requestId = await seedRequest("submitted");
  const nonExistentActorId = randomUUID();

  await assert.rejects(() =>
    repository.createWaitlistEntry(requestId, { variantId: null, priorityNote: "Do not audit this" }, { userId: nonExistentActorId }, { ipAddress: null, userAgent: null }, new Date()),
  );

  const [row] = await db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  assert.equal(row?.status, "submitted");
  const entryRows = await db.select().from(waitlistEntries).where(eq(waitlistEntries.requestId, requestId));
  assert.equal(entryRows.length, 0);
});

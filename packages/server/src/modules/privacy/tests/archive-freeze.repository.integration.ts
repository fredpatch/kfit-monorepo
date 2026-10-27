import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import {
  appointments,
  auditEvents,
  customers,
  documents,
  documentVersions,
  externalAccessEvents,
  prospects,
  quotes,
  quoteVersions,
  secureAccessTokens,
  serviceRequests,
  services,
  subscriptions,
  users,
} from "../../../db/schema/index.js";
import {
  assertLocalTestDatabase,
  testFixtureName,
  uniqueTestWhatsapp,
} from "../../../testing/integration-fixtures.js";
import { DrizzleAppointmentsRepository } from "../../appointments/repositories/appointments.repository.js";
import { DrizzleConsentRepository } from "../../consents/repositories/consent.repository.js";
import { hashConsentToken } from "../../consents/services/consent-token.crypto.js";
import { DrizzleTestDataRepository } from "../../dev-tools/repositories/test-data.repository.js";
import { testDataFingerprint } from "../../dev-tools/services/test-data.policy.js";
import { DrizzleDocumentsRepository } from "../../documents/repositories/documents.repository.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";
import { DrizzleFollowUpsRepository } from "../../follow-ups/repositories/follow-ups.repository.js";
import { DrizzlePaymentProofsRepository } from "../../payment-proofs/repositories/payment-proofs.repository.js";
import { DrizzleQuestionnaireRepository } from "../../questionnaires/repositories/questionnaire.repository.js";
import { DrizzleProgressRepository } from "../../progress/repositories/progress.repository.js";
import { DrizzleQuotesRepository } from "../../quotes/repositories/quotes.repository.js";
import { DrizzleAdminRequestsRepository } from "../../requests/repositories/admin-requests.repositories.js";
import { DrizzleRequestConversionRepository } from "../../requests/repositories/request-conversion.repository.js";
import { DrizzleRequestsRepository } from "../../requests/repositories/requests.repositories.js";
import { DrizzleSubscriptionsRepository } from "../../subscriptions/repositories/subscriptions.repository.js";
import {
  DrizzlePrivacyRepository,
  type PrivacyActor,
} from "../repositories/privacy.repository.js";
import {
  SubjectArchivedError,
  assertCustomerWritable,
} from "../repositories/subject-freeze.js";

const options = {
  auditHashPepper: "synthetic-archive-freeze-pepper",
  tokenPepper: "synthetic-archive-freeze-token-pepper-123456",
  verificationPepper: "synthetic-archive-freeze-code-pepper-1234567",
};
const userId = randomUUID(),
  serviceId = randomUUID();
const actor: PrivacyActor = {
  userId,
  requestId: randomUUID(),
  ipAddress: null,
  userAgent: "archive-freeze-test",
};
const unused = async (): Promise<never> => {
  throw new Error("unused in this test");
};
const privacy = new DrizzlePrivacyRepository(db, options);
const repos = {
  subscriptions: new DrizzleSubscriptionsRepository(db, options),
  appointments: new DrizzleAppointmentsRepository(db, options),
  followUps: new DrizzleFollowUpsRepository(db, options),
  progress: new DrizzleProgressRepository(db, options),
  documents: new DrizzleDocumentsRepository(db, options),
  finance: new DrizzleFinanceRepository(db, options),
  proofs: new DrizzlePaymentProofsRepository(db, options, { read: unused }),
  quotes: new DrizzleQuotesRepository(db, options, {
    render: unused,
    persist: unused,
    read: unused,
    remove: unused,
  }),
  consents: new DrizzleConsentRepository(db, options),
  requests: new DrizzleAdminRequestsRepository(db, options),
  conversion: new DrizzleRequestConversionRepository(db, options),
  publicRequests: new DrizzleRequestsRepository(db),
};
const created = { anonymizedCustomers: [] as string[] };
let safe = false;

before(async () => {
  assertLocalTestDatabase();
  safe = true;
  await db.insert(users).values({
    id: userId,
    email: `archive-freeze-${userId}@example.invalid`,
    passwordHash: "synthetic",
    role: "admin",
    status: "active",
  });
  await db.insert(services).values({
    id: serviceId,
    name: testFixtureName("Freeze service"),
    slug: `freeze-${serviceId}`,
    pricingMode: "quote",
    deliveryType: "one_time",
    capacityMode: "unlimited",
  });
});

after(async () => {
  try {
    if (!safe) return;
    // Anonymized customers lose their [TEST] name, so they are removed explicitly before the TEST-01 purge takes the rest.
    for (const customerId of created.anonymizedCustomers) {
      const subIds = (
        await db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.customerId, customerId))
      ).map((row) => row.id);
      if (subIds.length)
        await db
          .delete(secureAccessTokens)
          .where(inArray(secureAccessTokens.resourceId, subIds));
      await db.execute(
        sql`delete from anonymization_events where subject_id = ${customerId}`,
      );
      await db.execute(
        sql`delete from subscription_status_history where subscription_id in (select id from subscriptions where customer_id = ${customerId})`,
      );
      await db
        .delete(subscriptions)
        .where(eq(subscriptions.customerId, customerId));
      await db.delete(customers).where(eq(customers.id, customerId));
    }
    const purge = new DrizzleTestDataRepository(db, options);
    const result = await purge.purge(
      testDataFingerprint(await purge.classify()),
      testDataFingerprint,
      actor,
    );
    assert.equal(result.status, "purged");
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    await db.delete(users).where(eq(users.id, userId));
  } finally {
    await pool.end();
  }
});

async function seedCustomer(status = "completed") {
  const customerId = randomUUID(),
    subscriptionId = randomUUID(),
    name = testFixtureName(`Freeze ${customerId.slice(0, 8)}`);
  await db
    .insert(customers)
    .values({ id: customerId, fullName: name, whatsapp: uniqueTestWhatsapp() });
  await db.insert(subscriptions).values({
    id: subscriptionId,
    reference: `SUB-FREEZE-${subscriptionId}`,
    customerId,
    serviceId,
    status,
    agreedPriceXaf: 0,
    durationValueSnapshot: 12,
    durationUnitSnapshot: "week",
    createdByUserId: userId,
  });
  return { customerId, subscriptionId, name };
}
async function archive(customerId: string) {
  const result = await privacy.archive(
    "customer",
    customerId,
    actor,
    new Date(),
  );
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}
const archivedError =
  (code: "CUSTOMER_ARCHIVED" | "PROSPECT_ARCHIVED") => (error: unknown) =>
    error instanceof SubjectArchivedError && error.code === code;
const later = (days: number) => new Date(Date.now() + days * 86_400_000);
const file = () => ({
  storageKey: `${randomUUID()}.pdf`,
  originalFilename: "plan.pdf",
  mimeType: "application/pdf" as const,
  sizeBytes: 10,
  sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
});

test("ARCH-01 D1/D4: every module refuses writes on an archived customer, renew included; consent revoke and reads still work", async () => {
  const { customerId, subscriptionId } = await seedCustomer();
  await archive(customerId);
  const writers: Array<[string, () => Promise<unknown>]> = [
    [
      "subscriptions renew",
      () =>
        repos.subscriptions.execute(
          subscriptionId,
          { action: "renew", plannedStartDate: later(7) },
          actor,
        ),
    ],
    [
      "appointments schedule",
      () =>
        repos.appointments.execute(
          subscriptionId,
          {
            action: "schedule",
            start: later(1),
            end: later(1.05),
            componentId: null,
            location: null,
          },
          actor,
        ),
    ],
    [
      "follow-ups create",
      () =>
        repos.followUps.execute(
          subscriptionId,
          {
            action: "create",
            followUpType: "check_in",
            occurredAt: new Date(),
            note: null,
            nextAction: null,
            nextActionAt: null,
          },
          actor,
        ),
    ],
    [
      "progress create-goal",
      () =>
        repos.progress.execute(
          subscriptionId,
          {
            action: "create-goal",
            category: "other",
            label: "Synthetic",
            metricKey: null,
            baselineValue: null,
            targetValue: null,
            unit: null,
            targetDate: null,
          },
          actor,
        ),
    ],
    [
      "documents create-upload",
      () =>
        repos.documents.execute(
          subscriptionId,
          { action: "create-upload", documentType: "meal_plan", file: file() },
          actor,
        ),
    ],
    [
      "finance record",
      () =>
        repos.finance.execute(
          subscriptionId,
          {
            action: "record",
            amountXaf: 1000,
            paymentMethod: "cash",
            occurredAt: new Date(),
            externalReference: null,
            idempotencyKey: randomUUID(),
          },
          actor,
        ),
    ],
    [
      "payment-proofs issue-link",
      () =>
        repos.proofs.execute(
          subscriptionId,
          {
            action: "issue-link",
            expiresAt: later(3),
            supersedesProofId: null,
          },
          actor,
        ),
    ],
    [
      "quotes create",
      () =>
        repos.quotes.execute(
          subscriptionId,
          {
            action: "create",
            draft: {
              amountXaf: 1000,
              validUntil: later(10),
              terms: "Synthetic",
            },
          },
          actor,
        ),
    ],
  ];
  for (const [label, run] of writers)
    await assert.rejects(run(), archivedError("CUSTOMER_ARCHIVED"), label);

  const revoke = await repos.consents.execute(
    subscriptionId,
    { action: "revoke", consentType: "health_data" },
    actor,
  );
  assert.ok(!(revoke instanceof SubjectArchivedError));
  assert.ok(
    (await repos.finance.execute(subscriptionId, { action: "read" }, actor)).ok,
  );
  assert.ok(
    (await repos.followUps.execute(subscriptionId, { action: "read" }, actor))
      .ok,
  );
});

test("ARCH-01 D1: the same writers keep working on a completed subscription of a non-archived customer", async () => {
  const { subscriptionId } = await seedCustomer();
  const renewed = await repos.subscriptions.execute(
    subscriptionId,
    { action: "renew", plannedStartDate: later(7) },
    actor,
  );
  assert.equal(renewed.status, "ok", JSON.stringify(renewed));
  const link = await repos.proofs.execute(
    subscriptionId,
    { action: "issue-link", expiresAt: later(3), supersedesProofId: null },
    actor,
  );
  assert.ok(link.ok, JSON.stringify(link));
});

test("ARCH-01 D1: an archived prospect refuses contact attempts, qualification, waitlist and conversion", async () => {
  const prospectId = randomUUID(),
    requestId = randomUUID();
  await db.insert(prospects).values({
    id: prospectId,
    fullName: testFixtureName("Freeze prospect"),
    whatsapp: uniqueTestWhatsapp(),
  });
  await db.insert(serviceRequests).values({
    id: requestId,
    reference: `REQ-${requestId}`,
    submissionToken: `freeze-${requestId}`,
    prospectId,
    serviceId,
    status: "rejected",
  });
  assert.ok(
    (await privacy.archive("prospect", prospectId, actor, new Date())).ok,
  );
  const audit = { ipAddress: null, userAgent: null },
    now = new Date();
  const writers: Array<[string, () => Promise<unknown>]> = [
    [
      "contact attempt",
      () =>
        repos.requests.createContactAttempt(
          requestId,
          {
            channel: "whatsapp",
            direction: "outbound",
            outcome: "reached",
            note: null,
            occurredAt: now,
            nextActionAt: null,
          },
          { userId },
          audit,
          now,
        ),
    ],
    [
      "qualification",
      () =>
        repos.requests.recordQualificationReview(
          requestId,
          {
            outcome: "qualified",
            finalVariantId: null,
            agreedPriceXaf: null,
            targetStartDate: null,
            suitabilityNote: null,
            conditions: null,
            blockers: null,
          },
          { userId },
          audit,
          now,
        ),
    ],
    [
      "waitlist",
      () =>
        repos.requests.createWaitlistEntry(
          requestId,
          { variantId: null, priorityNote: null },
          { userId },
          audit,
          now,
        ),
    ],
    ["conversion", () => repos.conversion.convert(requestId, null, actor)],
  ];
  for (const [label, run] of writers)
    await assert.rejects(run(), archivedError("PROSPECT_ARCHIVED"), label);
});

test("ARCH-01 D7: a public request from an archived prospect's WhatsApp creates a new prospect with the same public answer", async () => {
  const prospectId = randomUUID(),
    whatsapp = uniqueTestWhatsapp(),
    oldRequest = randomUUID();
  await db.insert(prospects).values({
    id: prospectId,
    fullName: testFixtureName("Returning prospect"),
    whatsapp,
  });
  await db.insert(serviceRequests).values({
    id: oldRequest,
    reference: `REQ-${oldRequest}`,
    submissionToken: `freeze-${oldRequest}`,
    prospectId,
    serviceId,
    status: "abandoned",
  });
  assert.ok(
    (await privacy.archive("prospect", prospectId, actor, new Date())).ok,
  );
  const input = (phone: string) => ({
    submissionToken: `freeze-public-${randomUUID()}`,
    fullName: testFixtureName("Returning prospect"),
    whatsapp: phone,
    email: null,
    serviceId,
    requestedVariantId: null,
    objective: null,
    preferredStartDate: null,
    message: null,
  });
  const returning = await repos.publicRequests.createServiceRequest(
    input(whatsapp),
  );
  const fresh = await repos.publicRequests.createServiceRequest(
    input(uniqueTestWhatsapp()),
  );
  assert.equal(returning.outcome, fresh.outcome);
  assert.deepEqual(
    Object.keys(returning.request).sort(),
    Object.keys(fresh.request).sort(),
  );
  const [row] = await db
    .select({ prospectId: serviceRequests.prospectId })
    .from(serviceRequests)
    .where(eq(serviceRequests.id, returning.request.id));
  assert.notEqual(row?.prospectId, prospectId);
  assert.equal(
    (
      await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.prospectId, prospectId))
    ).length,
    1,
  );
  const [archived] = await db
    .select({ archivedAt: prospects.archivedAt })
    .from(prospects)
    .where(eq(prospects.id, prospectId));
  assert.ok(archived?.archivedAt);
});

async function seedLinks(subscriptionId: string, customerId: string) {
  const appointmentId = randomUUID(),
    quoteId = randomUUID(),
    versionId = randomUUID(),
    documentId = randomUUID(),
    documentVersionId = randomUUID(),
    consentRaw = randomUUID().replaceAll("-", "").padEnd(43, "A");
  await db.insert(appointments).values({
    id: appointmentId,
    subscriptionId,
    scheduledStart: later(2),
    scheduledEnd: later(2.05),
  });
  await db
    .insert(quotes)
    .values({ id: quoteId, customerId, subscriptionId, status: "draft" });
  await db.insert(quoteVersions).values({
    id: versionId,
    quoteId,
    versionNumber: 1,
    serviceSnapshotJson: {},
    amountXaf: 0,
  });
  await db.insert(documents).values({
    id: documentId,
    ownerType: "subscription",
    ownerId: subscriptionId,
    documentType: "meal_plan",
    status: "available",
  });
  await db.insert(documentVersions).values({
    id: documentVersionId,
    documentId,
    versionNumber: 1,
    storageKey: `${randomUUID()}.pdf`,
    originalFilename: "plan.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    sha256: "0".repeat(64),
    uploadedByType: "admin",
    malwareScanStatus: "clean",
  });
  const token = (
    resourceType: string,
    resourceId: string,
    action: string,
    tokenHash: string = randomUUID(),
  ) => ({
    tokenHash,
    resourceType,
    resourceId,
    action,
    expiresAt: later(5),
    maxUses: 1,
  });
  const rows = await db
    .insert(secureAccessTokens)
    .values([
      token("subscription", subscriptionId, "payment_proof_upload"),
      token("quote_version", versionId, "quote_response"),
      token("appointment", appointmentId, "appointment_response"),
      token("document_version", documentVersionId, "document_download"),
      token(
        "subscription",
        subscriptionId,
        "consent_submit",
        hashConsentToken(consentRaw),
      ),
    ])
    .returning({ id: secureAccessTokens.id });
  return { tokenIds: rows.map((row) => row.id), consentRaw };
}
const liveTokens = async (ids: string[]) =>
  (
    await db
      .select({ revokedAt: secureAccessTokens.revokedAt })
      .from(secureAccessTokens)
      .where(inArray(secureAccessTokens.id, ids))
  ).filter((row) => !row.revokedAt).length;
const auditOf = async (eventType: string, entityId: string) =>
  (
    await db
      .select({ metadata: auditEvents.metadataJson })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, eventType),
          eq(auditEvents.entityId, entityId),
        ),
      )
  ).map((row) => row.metadata);

test("ARCH-01 D5: archive revokes every public link of the customer in the same transaction; audit carries the count only", async () => {
  const { customerId, subscriptionId } = await seedCustomer();
  const { tokenIds, consentRaw } = await seedLinks(subscriptionId, customerId);
  assert.equal(await liveTokens(tokenIds), 5);
  const result = await archive(customerId);
  assert.equal(result.ok && result.tokensRevoked, 5);
  assert.equal(await liveTokens(tokenIds), 0);
  assert.deepEqual(await auditOf("privacy.subject_archived", customerId), [
    { subjectType: "customer", tokensRevoked: 5 },
  ]);
  const view = await repos.consents.publicAccess(consentRaw, null, {
    userId: null,
    requestId: randomUUID(),
    ipAddress: null,
    userAgent: null,
  });
  assert.equal(view.ok, false);
});

test("ARCH-01 D5: re-archiving a subject archived before ARCH-01 revokes its remaining links and keeps the same archivedAt", async () => {
  const { customerId, subscriptionId } = await seedCustomer();
  const archivedAt = new Date(Date.now() - 86_400_000);
  await db
    .update(customers)
    .set({ archivedAt })
    .where(eq(customers.id, customerId));
  const { tokenIds } = await seedLinks(subscriptionId, customerId);
  const result = await archive(customerId);
  assert.ok(result.ok);
  assert.equal(result.archivedAt.getTime(), archivedAt.getTime());
  assert.equal(result.tokensRevoked, 5);
  assert.equal(await liveTokens(tokenIds), 0);
  assert.deepEqual(await auditOf("privacy.subject_links_revoked", customerId), [
    { subjectType: "customer", tokensRevoked: 5 },
  ]);
  assert.equal((await archive(customerId)).tokensRevoked, 0);
});

test("ARCH-01 D2: a writer holding the customer row finishes before archive; after archive the writer is refused", async () => {
  const { customerId, subscriptionId } = await seedCustomer();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let inside!: () => void;
  const entered = new Promise<void>((resolve) => {
    inside = resolve;
  });
  const order: string[] = [];
  const writer = db.transaction(async (tx) => {
    await assertCustomerWritable(tx, { customerId });
    inside();
    await held;
    await tx
      .update(subscriptions)
      .set({ updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId));
    order.push("writer");
  });
  await entered;
  const archiving = privacy
    .archive("customer", customerId, actor, new Date())
    .then((result) => {
      order.push("archive");
      return result;
    });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(order, []);
  } finally {
    release();
  }
  await writer;
  assert.ok((await archiving).ok);
  assert.deepEqual(order, ["writer", "archive"]);
  await assert.rejects(
    repos.proofs.execute(
      subscriptionId,
      { action: "issue-link", expiresAt: later(3), supersedesProofId: null },
      actor,
    ),
    archivedError("CUSTOMER_ARCHIVED"),
  );
});

test("ARCH-01 D2: writers racing archive or anonymize never deadlock; each ends committed or with the business error", async () => {
  const deadlock = (error: unknown) =>
    JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})).includes(
      "40P01",
    );
  for (let round = 0; round < 4; round += 1) {
    const { customerId, subscriptionId } = await seedCustomer();
    const results = await Promise.allSettled([
      privacy.archive("customer", customerId, actor, new Date()),
      repos.proofs.execute(
        subscriptionId,
        { action: "issue-link", expiresAt: later(3), supersedesProofId: null },
        actor,
      ),
      repos.followUps.execute(
        subscriptionId,
        { action: "cadence", frequencyDays: 7 },
        actor,
      ),
    ]);
    for (const result of results)
      if (result.status === "rejected")
        assert.ok(
          result.reason instanceof SubjectArchivedError &&
            !deadlock(result.reason),
          String(result.reason),
        );
    assert.equal(results[0].status, "fulfilled");
  }
  for (let round = 0; round < 3; round += 1) {
    const subject = await seedCustomer();
    await archive(subject.customerId);
    created.anonymizedCustomers.push(subject.customerId);
    const results = await Promise.allSettled([
      privacy.anonymize(
        "customer",
        subject.customerId,
        subject.name,
        actor,
        new Date(),
      ),
      repos.proofs.execute(
        subject.subscriptionId,
        { action: "issue-link", expiresAt: later(3), supersedesProofId: null },
        actor,
      ),
      repos.subscriptions.execute(
        subject.subscriptionId,
        { action: "renew", plannedStartDate: later(7) },
        actor,
      ),
    ]);
    assert.equal(results[0].status, "fulfilled");
    assert.ok(results[0].status === "fulfilled" && results[0].value.ok);
    for (const result of results.slice(1))
      assert.ok(
        result.status === "rejected" &&
          result.reason instanceof SubjectArchivedError &&
          !deadlock(result.reason),
      );
  }
});

test("ARCH-01 D6: unarchive reopens writers, keeps revoked links revoked, refuses anonymized and not-archived subjects, audits the reason only", async () => {
  const { customerId, subscriptionId } = await seedCustomer();
  const { tokenIds } = await seedLinks(subscriptionId, customerId);
  await archive(customerId);
  assert.deepEqual(
    await privacy.unarchive(
      "customer",
      customerId,
      "returning_customer",
      actor,
    ),
    { ok: true },
  );
  const [row] = await db
    .select({ archivedAt: customers.archivedAt })
    .from(customers)
    .where(eq(customers.id, customerId));
  assert.equal(row?.archivedAt, null);
  assert.equal(await liveTokens(tokenIds), 0);
  const link = await repos.proofs.execute(
    subscriptionId,
    { action: "issue-link", expiresAt: later(3), supersedesProofId: null },
    actor,
  );
  assert.ok(link.ok, JSON.stringify(link));
  assert.deepEqual(await auditOf("privacy.subject_unarchived", customerId), [
    { subjectType: "customer", reason: "returning_customer" },
  ]);
  assert.deepEqual(
    await privacy.unarchive(
      "customer",
      customerId,
      "archived_by_mistake",
      actor,
    ),
    { ok: false, error: "PRIVACY_SUBJECT_NOT_ARCHIVED" },
  );

  const subject = await seedCustomer();
  await archive(subject.customerId);
  created.anonymizedCustomers.push(subject.customerId);
  assert.ok(
    (
      await privacy.anonymize(
        "customer",
        subject.customerId,
        subject.name,
        actor,
        new Date(),
      )
    ).ok,
  );
  assert.deepEqual(
    await privacy.unarchive(
      "customer",
      subject.customerId,
      "accounting_correction",
      actor,
    ),
    { ok: false, error: "PRIVACY_SUBJECT_ANONYMIZED" },
  );
  assert.deepEqual(
    await privacy.unarchive(
      "customer",
      randomUUID(),
      "accounting_correction",
      actor,
    ),
    { ok: false, error: "PRIVACY_SUBJECT_NOT_FOUND" },
  );
});

test("FIX-02 D3: a public appointment response, consent submit or questionnaire submit refused by the freeze records CUSTOMER_ARCHIVED in its access event", async () => {
  const { customerId, subscriptionId } = await seedCustomer();
  const appointmentId = randomUUID();
  await db.insert(appointments).values({
    id: appointmentId,
    subscriptionId,
    scheduledStart: later(2),
    scheduledEnd: later(2.05),
  });
  await archive(customerId);
  // A link issued around the archive (archive revokes every live link): inserted after it to reach the freeze guard.
  const raw = () => randomUUID().replaceAll("-", "").padEnd(43, "A");
  const [appointmentRaw, consentRaw, questionnaireRaw] = [raw(), raw(), raw()];
  const sha = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const rows = await db
    .insert(secureAccessTokens)
    .values([
      {
        tokenHash: sha(appointmentRaw),
        resourceType: "appointment",
        resourceId: appointmentId,
        action: "appointment_response",
        expiresAt: later(5),
        maxUses: 1,
      },
      {
        tokenHash: hashConsentToken(consentRaw),
        resourceType: "subscription",
        resourceId: subscriptionId,
        action: "onboarding_consent",
        expiresAt: later(5),
        maxUses: 1,
      },
      {
        tokenHash: sha(questionnaireRaw),
        resourceType: "subscription",
        resourceId: subscriptionId,
        action: "questionnaire_submit",
        expiresAt: later(5),
        maxUses: 1,
      },
    ])
    .returning({ id: secureAccessTokens.id });
  const publicActor = {
    userId: null,
    requestId: randomUUID(),
    ipAddress: null,
    userAgent: null,
  };
  const questionnaires = new DrizzleQuestionnaireRepository(db, options);

  await assert.rejects(
    repos.appointments.publicAccess(
      appointmentRaw,
      { action: "confirm" },
      publicActor,
    ),
    archivedError("CUSTOMER_ARCHIVED"),
    "appointment response",
  );
  await assert.rejects(
    repos.consents.publicAccess(
      consentRaw,
      { service_terms: "granted" },
      publicActor,
    ),
    archivedError("CUSTOMER_ARCHIVED"),
    "consent submit",
  );
  await assert.rejects(
    questionnaires.publicAccess(questionnaireRaw, { answers: [] }, publicActor),
    archivedError("CUSTOMER_ARCHIVED"),
    "questionnaire submit",
  );

  const events = await db
    .select({
      tokenId: externalAccessEvents.secureAccessTokenId,
      eventType: externalAccessEvents.eventType,
      result: externalAccessEvents.result,
    })
    .from(externalAccessEvents)
    .where(
      inArray(
        externalAccessEvents.secureAccessTokenId,
        rows.map((row) => row.id),
      ),
    );
  assert.deepEqual(events.map((e) => [e.eventType, e.result]).sort(), [
    ["appointment.respond", "CUSTOMER_ARCHIVED"],
    ["consent.submit", "CUSTOMER_ARCHIVED"],
    ["questionnaire.submit", "CUSTOMER_ARCHIVED"],
  ]);
});

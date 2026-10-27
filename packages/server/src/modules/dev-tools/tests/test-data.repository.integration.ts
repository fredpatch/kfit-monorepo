import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { testDataTotal } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import {
  auditEvents,
  customers,
  documents,
  documentVersions,
  prospects,
  quotes,
  quoteVersions,
  serviceRequests,
  services,
  subscriptions,
  users,
} from "../../../db/schema/index.js";
import {
  assertLocalTestDatabase,
  cleanupInOrder,
  testFixtureName,
  uniqueTestWhatsapp,
} from "../../../testing/integration-fixtures.js";
import { DrizzleTestDataRepository } from "../repositories/test-data.repository.js";
import {
  testDataCounts,
  testDataFingerprint,
} from "../services/test-data.policy.js";

const options = { auditHashPepper: "synthetic-test-data-pepper" };
const userId = randomUUID();
const actor = {
  userId,
  requestId: randomUUID(),
  ipAddress: null,
  userAgent: "test-data-integration",
};
const ids = {
  testService: randomUUID(),
  testProspect: randomUUID(),
  testCustomer: randomUUID(),
  testRequest: randomUUID(),
  testSubscription: randomUUID(),
  quote: randomUUID(),
  quoteVersion: randomUUID(),
  document: randomUUID(),
  documentVersion: randomUUID(),
  realProspect: randomUUID(),
  realCustomer: randomUUID(),
  convertedRequest: randomUUID(),
  realSubscription: randomUUID(),
};
const storageKey = `${randomUUID()}.pdf`;
let safe = false;

before(async () => {
  assertLocalTestDatabase();
  safe = true;
  await db.insert(users).values({
    id: userId,
    email: `test-data-${userId}@example.invalid`,
    passwordHash: "synthetic",
    role: "admin",
    status: "active",
  });
  await db.insert(services).values({
    id: ids.testService,
    name: testFixtureName("Purge service"),
    slug: `purge-${ids.testService}`,
    pricingMode: "quote",
    deliveryType: "one_time",
    availabilityStatus: "open",
    capacityMode: "unlimited",
    isPublic: false,
  });
  await db.insert(prospects).values([
    {
      id: ids.testProspect,
      fullName: testFixtureName("Purge prospect"),
      whatsapp: uniqueTestWhatsapp(),
    },
    {
      id: ids.realProspect,
      fullName: `Synthetic real prospect ${ids.realProspect}`,
      whatsapp: uniqueTestWhatsapp(),
    },
  ]);
  await db.insert(customers).values([
    {
      id: ids.testCustomer,
      fullName: testFixtureName("Purge customer"),
      whatsapp: uniqueTestWhatsapp(),
    },
    {
      id: ids.realCustomer,
      prospectId: ids.realProspect,
      fullName: `Synthetic real customer ${ids.realCustomer}`,
      whatsapp: uniqueTestWhatsapp(),
    },
  ]);
  await db.insert(serviceRequests).values([
    {
      id: ids.testRequest,
      reference: `REQ-${ids.testRequest}`,
      submissionToken: `purge-${ids.testRequest}`,
      prospectId: ids.testProspect,
      serviceId: ids.testService,
      status: "submitted",
    },
    {
      id: ids.convertedRequest,
      reference: `REQ-${ids.convertedRequest}`,
      submissionToken: `purge-${ids.convertedRequest}`,
      prospectId: ids.realProspect,
      serviceId: ids.testService,
      status: "converted",
    },
  ]);
  await db.insert(subscriptions).values([
    {
      id: ids.testSubscription,
      reference: `SUB-${ids.testSubscription}`,
      customerId: ids.testCustomer,
      serviceId: ids.testService,
      status: "onboarding",
      agreedPriceXaf: 0,
    },
    {
      id: ids.realSubscription,
      reference: `SUB-${ids.realSubscription}`,
      customerId: ids.realCustomer,
      serviceId: ids.testService,
      sourceRequestId: ids.convertedRequest,
      status: "onboarding",
      agreedPriceXaf: 0,
    },
  ]);
  // quotes ↔ quote_versions ← subscriptions is the FK cycle the plan detaches.
  await db.insert(quotes).values({
    id: ids.quote,
    customerId: ids.testCustomer,
    subscriptionId: ids.testSubscription,
    status: "draft",
  });
  await db.insert(quoteVersions).values({
    id: ids.quoteVersion,
    quoteId: ids.quote,
    versionNumber: 1,
    serviceSnapshotJson: {},
    amountXaf: 0,
  });
  await db
    .update(quotes)
    .set({ currentVersionId: ids.quoteVersion })
    .where(eq(quotes.id, ids.quote));
  await db
    .update(subscriptions)
    .set({ acceptedQuoteVersionId: ids.quoteVersion })
    .where(eq(subscriptions.id, ids.testSubscription));
  await db.insert(documents).values({
    id: ids.document,
    ownerType: "subscription",
    ownerId: ids.testSubscription,
    documentType: "progress_summary",
    status: "available",
  });
  await db.insert(documentVersions).values({
    id: ids.documentVersion,
    documentId: ids.document,
    versionNumber: 1,
    storageKey,
    originalFilename: "purge.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    sha256: "0".repeat(64),
    uploadedByType: "admin",
    malwareScanStatus: "clean",
  });
});

after(async () => {
  try {
    if (safe)
      await cleanupInOrder([
        [
          "audit",
          () =>
            db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId)),
        ],
        [
          "document versions",
          () =>
            db
              .delete(documentVersions)
              .where(eq(documentVersions.id, ids.documentVersion)),
        ],
        [
          "documents",
          () => db.delete(documents).where(eq(documents.id, ids.document)),
        ],
        [
          "quote detach",
          () =>
            db
              .update(quotes)
              .set({ currentVersionId: null })
              .where(eq(quotes.id, ids.quote)),
        ],
        [
          "subscription detach",
          () =>
            db
              .update(subscriptions)
              .set({ acceptedQuoteVersionId: null })
              .where(eq(subscriptions.id, ids.testSubscription)),
        ],
        [
          "quote versions",
          () =>
            db
              .delete(quoteVersions)
              .where(eq(quoteVersions.id, ids.quoteVersion)),
        ],
        ["quotes", () => db.delete(quotes).where(eq(quotes.id, ids.quote))],
        [
          "subscriptions",
          () =>
            db
              .delete(subscriptions)
              .where(
                inArray(subscriptions.id, [
                  ids.testSubscription,
                  ids.realSubscription,
                ]),
              ),
        ],
        [
          "requests",
          () =>
            db
              .delete(serviceRequests)
              .where(
                inArray(serviceRequests.id, [
                  ids.testRequest,
                  ids.convertedRequest,
                ]),
              ),
        ],
        [
          "customers",
          () =>
            db
              .delete(customers)
              .where(
                inArray(customers.id, [ids.testCustomer, ids.realCustomer]),
              ),
        ],
        [
          "prospects",
          () =>
            db
              .delete(prospects)
              .where(
                inArray(prospects.id, [ids.testProspect, ids.realProspect]),
              ),
        ],
        [
          "service",
          () => db.delete(services).where(eq(services.id, ids.testService)),
        ],
        ["user", () => db.delete(users).where(eq(users.id, userId))],
      ]);
  } finally {
    await pool.end();
  }
});

const has = (list: string[] | undefined, id: string) =>
  (list ?? []).includes(id);
const exists = async () => ({
  testSubscription: (
    await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.id, ids.testSubscription))
  ).length,
  quoteVersion: (
    await db
      .select({ id: quoteVersions.id })
      .from(quoteVersions)
      .where(eq(quoteVersions.id, ids.quoteVersion))
  ).length,
  testCustomer: (
    await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, ids.testCustomer))
  ).length,
});

test("TEST-01 analyse selects test rows and keeps what a real customer's subscription needs (D5)", async () => {
  const classification = await new DrizzleTestDataRepository(
    db,
    options,
  ).classify();
  for (const [kind, id] of [
    ["services", ids.testService],
    ["service_requests", ids.convertedRequest],
    ["subscriptions", ids.realSubscription],
  ] as const)
    assert.ok(has(classification.kept.get(kind), id), kind);
  for (const [kind, id] of [
    ["subscriptions", ids.testSubscription],
    ["service_requests", ids.testRequest],
    ["customers", ids.testCustomer],
    ["prospects", ids.testProspect],
    ["quotes", ids.quote],
    ["quote_versions", ids.quoteVersion],
    ["documents", ids.document],
    ["document_versions", ids.documentVersion],
  ] as const)
    assert.ok(has(classification.doomed.get(kind), id), kind);
  for (const id of [ids.realCustomer])
    assert.ok(
      !has(classification.doomed.get("customers"), id) &&
        !has(classification.kept.get("customers"), id),
    );
  assert.ok((testDataCounts(classification).kept.users ?? 0) >= 1);
});

test("TEST-01 a failure inside the purge transaction deletes nothing; a stale fingerprint deletes nothing (D6)", async () => {
  const failing = new DrizzleTestDataRepository(db, options, async () => {
    throw new Error("injected audit failure");
  });
  const fingerprint = testDataFingerprint(await failing.classify());
  await assert.rejects(
    failing.purge(fingerprint, testDataFingerprint, actor),
    /injected audit failure/,
  );
  assert.deepEqual(await exists(), {
    testSubscription: 1,
    quoteVersion: 1,
    testCustomer: 1,
  });
  assert.deepEqual(
    await new DrizzleTestDataRepository(db, options).purge(
      "0".repeat(64),
      testDataFingerprint,
      actor,
    ),
    { status: "changed" },
  );
  assert.deepEqual(await exists(), {
    testSubscription: 1,
    quoteVersion: 1,
    testCustomer: 1,
  });
});

test("TEST-01 purge deletes test rows in one transaction, keeps real ones, audits counts only; a second purge finds nothing (D5, D6, D7)", async () => {
  const repository = new DrizzleTestDataRepository(db, options);
  const result = await repository.purge(
    testDataFingerprint(await repository.classify()),
    testDataFingerprint,
    actor,
  );
  assert.equal(result.status, "purged");
  if (result.status !== "purged") return;
  assert.ok(
    result.files.some(
      (file) =>
        file.documentVersionId === ids.documentVersion &&
        file.storageKey === storageKey,
    ),
  );
  assert.deepEqual(await exists(), {
    testSubscription: 0,
    quoteVersion: 0,
    testCustomer: 0,
  });
  assert.equal(
    (
      await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, ids.realSubscription))
    ).length,
    1,
  );
  assert.equal(
    (
      await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, ids.convertedRequest))
    ).length,
    1,
  );
  assert.equal(
    (
      await db
        .select()
        .from(customers)
        .where(eq(customers.id, ids.realCustomer))
    ).length,
    1,
  );
  assert.equal(
    (await db.select().from(users).where(eq(users.id, userId))).length,
    1,
  );

  const [audit] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.requestId, actor.requestId));
  assert.equal(audit?.eventType, "dev.test_data_purged");
  assert.ok(
    Object.values(audit?.metadataJson as Record<string, unknown>).every(
      (value) => typeof value === "number",
    ),
  );
  assert.deepEqual(audit?.metadataJson, result.counts);

  const again = await repository.classify();
  assert.equal(testDataTotal(testDataCounts(again).counts), 0);
  const second = await repository.purge(
    testDataFingerprint(again),
    testDataFingerprint,
    { ...actor, requestId: randomUUID() },
  );
  assert.deepEqual(second.status === "purged" ? second.counts : second, {});
});

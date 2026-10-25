import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { services } from "../../../db/schema/catalogue.js";
import { DrizzleRequestsRepository } from "../repositories/requests.repositories.js";
import { assertLocalTestDatabase, cleanupInOrder, testFixtureName, uniqueTestWhatsapp } from "../../../testing/integration-fixtures.js";

const serviceId = randomUUID();
const submissionToken = `integration-${randomUUID()}`;
const whatsapp = uniqueTestWhatsapp();
let safe = false;

before(() => { assertLocalTestDatabase(); safe = true; });

// POL-01 D1: only this run's rows, reverse FK order, every step attempted.
after(async () => {
  try {
    if (safe) await cleanupInOrder([
      ["service requests", () => db.delete(serviceRequests).where(eq(serviceRequests.submissionToken, submissionToken))],
      ["prospects", () => db.delete(prospects).where(eq(prospects.whatsapp, whatsapp))],
      ["service", () => db.delete(services).where(eq(services.id, serviceId))],
    ]);
  } finally {
    await pool.end();
  }
});

test("DrizzleRequestsRepository resolves a real Postgres unique-token collision by returning the existing request", async () => {
  await db.insert(services).values({
    id: serviceId,
    name: testFixtureName("Integration test service"),
    slug: `integration-test-service-${serviceId}`,
    pricingMode: "quote",
    deliveryType: "one_time",
    availabilityStatus: "open",
    capacityMode: "unlimited",
    isPublic: false,
  });

  const repository = new DrizzleRequestsRepository(db);
  const input = {
    submissionToken,
    fullName: testFixtureName("Integration Test"),
    whatsapp,
    email: null,
    serviceId,
    requestedVariantId: null,
    objective: null,
    preferredStartDate: null,
    message: null,
  };

  // Two concurrent calls race the same submission token against the real
  // service_requests_submission_token_uq unique index. Exactly one must win the
  // insert; the other must recover via the SAVEPOINT-protected replay path instead
  // of throwing "current transaction is aborted".
  const [first, second] = await Promise.all([
    repository.createServiceRequest(input),
    repository.createServiceRequest(input),
  ]);

  const outcomes = [first.outcome, second.outcome].sort();
  assert.deepEqual(outcomes, ["created", "replayed"]);
  assert.equal(first.request.id, second.request.id);

  const rows = await db.select().from(serviceRequests).where(eq(serviceRequests.submissionToken, submissionToken));
  assert.equal(rows.length, 1);
});

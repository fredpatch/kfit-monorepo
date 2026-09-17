import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { services } from "../../../db/schema/catalogue.js";
import { DrizzleRequestsRepository } from "../repositories/requests.repositories.js";

const serviceId = randomUUID();
const submissionToken = `integration-${randomUUID()}`;

after(async () => {
  await db.delete(serviceRequests).where(eq(serviceRequests.submissionToken, submissionToken));
  await db.delete(prospects).where(eq(prospects.whatsapp, "+24100000000"));
  await db.delete(services).where(eq(services.id, serviceId));
  await pool.end();
});

test("DrizzleRequestsRepository resolves a real Postgres unique-token collision by returning the existing request", async () => {
  await db.insert(services).values({
    id: serviceId,
    name: "Integration test service",
    slug: `integration-test-service-${serviceId}`,
    pricingMode: "quote",
    deliveryType: "one_time",
    availabilityStatus: "open",
    capacityMode: "unlimited",
    isPublic: true,
  });

  const repository = new DrizzleRequestsRepository(db);
  const input = {
    submissionToken,
    fullName: "Integration Test",
    whatsapp: "+24100000000",
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

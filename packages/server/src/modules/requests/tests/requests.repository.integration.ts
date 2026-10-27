import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { services } from "../../../db/schema/catalogue.js";
import { DrizzleRequestsRepository } from "../repositories/requests.repositories.js";
import {
  assertLocalTestDatabase,
  cleanupInOrder,
  testFixtureName,
  uniqueTestWhatsapp,
} from "../../../testing/integration-fixtures.js";

const serviceId = randomUUID();
const submissionToken = `integration-${randomUUID()}`;
const whatsapp = uniqueTestWhatsapp();
const forcedToken = `integration-forced-${randomUUID()}`;
const holderWhatsapp = uniqueTestWhatsapp(),
  forcedWhatsapp = uniqueTestWhatsapp();
let safe = false;

before(() => {
  assertLocalTestDatabase();
  safe = true;
});

// POL-01 D1: only this run's rows, reverse FK order, every step attempted.
after(async () => {
  try {
    if (safe)
      await cleanupInOrder([
        [
          "service requests",
          () =>
            db
              .delete(serviceRequests)
              .where(
                inArray(serviceRequests.submissionToken, [
                  submissionToken,
                  forcedToken,
                ]),
              ),
        ],
        [
          "prospects",
          () =>
            db
              .delete(prospects)
              .where(
                inArray(prospects.whatsapp, [
                  whatsapp,
                  holderWhatsapp,
                  forcedWhatsapp,
                ]),
              ),
        ],
        [
          "service",
          () => db.delete(services).where(eq(services.id, serviceId)),
        ],
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

  const rows = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.submissionToken, submissionToken));
  assert.equal(rows.length, 1);
});

test("FIX-02 D2: a forced submission-token collision (wrapped 23505) replays the committed request instead of failing", async () => {
  const holder = await pool.connect();
  let pending: ReturnType<
    DrizzleRequestsRepository["createServiceRequest"]
  > | null = null;
  try {
    await holder.query("BEGIN");
    const prospect = await holder.query<{ id: string }>(
      "INSERT INTO prospects (full_name, whatsapp, source) VALUES ($1, $2, 'public_request_form') RETURNING id",
      [testFixtureName("Collision holder"), holderWhatsapp],
    );
    const held = await holder.query<{ id: string }>(
      "INSERT INTO service_requests (reference, submission_token, prospect_id, service_id, status) VALUES ($1, $2, $3, $4, 'submitted') RETURNING id",
      [
        `REQ-FORCED-${randomUUID().slice(0, 8)}`,
        forcedToken,
        prospect.rows[0]!.id,
        serviceId,
      ],
    );

    // The holder's row is uncommitted: the repository pre-check sees nothing and its insert waits on the unique index.
    pending = new DrizzleRequestsRepository(db).createServiceRequest({
      submissionToken: forcedToken,
      fullName: testFixtureName("Collision forced"),
      whatsapp: forcedWhatsapp,
      email: null,
      serviceId,
      requestedVariantId: null,
      objective: null,
      preferredStartDate: null,
      message: null,
    });
    const deadline = Date.now() + 5000;
    for (;;) {
      const waiting = await db.execute(
        sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%insert into "service_requests"%'`,
      );
      if ((waiting.rows[0] as { n: number }).n > 0) break;
      assert.ok(
        Date.now() < deadline,
        "the repository insert never blocked on the held token",
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await holder.query("COMMIT");

    const result = await pending;
    assert.equal(result.outcome, "replayed");
    assert.equal(result.request.id, held.rows[0]!.id);
    assert.equal(
      (
        await db
          .select()
          .from(serviceRequests)
          .where(eq(serviceRequests.submissionToken, forcedToken))
      ).length,
      1,
    );
  } finally {
    await holder.query("ROLLBACK").catch(() => undefined);
    holder.release();
    await pending?.catch(() => undefined);
  }
});

import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import {
  serviceComponents,
  services,
  serviceVariants,
} from "../../../db/schema/catalogue.js";
import { subscriptionFollowUpCadenceHistory } from "../../../db/schema/coaching.js";
import {
  customers,
  subscriptionComponents,
  subscriptions,
  subscriptionStatusHistory,
} from "../../../db/schema/customers.js";
import {
  prospects,
  qualificationReviews,
  serviceRequests,
} from "../../../db/schema/prospects.js";
import { DrizzleAdminRequestsRepository } from "../repositories/admin-requests.repositories.js";
import { DrizzleRequestConversionRepository } from "../repositories/request-conversion.repository.js";
import { AdminRequestsService } from "../services/admin-requests.service.js";
import { RequestConversionService } from "../services/request-conversion.service.js";

// REG-F1 (recette 2026-10-25): an offer sold without variant must be qualifiable and convertible.
const userId = randomUUID(),
  variantlessServiceId = randomUUID(),
  variantServiceId = randomUUID();
const activeVariantId = randomUUID(),
  archivedVariantId = randomUUID(),
  lateVariantId = randomUUID();
const serviceComponentId = randomUUID(),
  lateComponentId = randomUUID();
const requestIds: string[] = [],
  prospectIds: string[] = [];
const options = {
  auditHashPepper: "synthetic-variantless-audit-pepper-at-least-32-characters",
};
const actor = { userId },
  audit = { ipAddress: "192.0.2.9", userAgent: "synthetic-variantless-test" };
const admin = new AdminRequestsService(
  new DrizzleAdminRequestsRepository(db, options),
);
const conversion = new RequestConversionService(
  new DrizzleRequestConversionRepository(db, options),
);
const qualified = (finalVariantId?: string | null) => ({
  outcome: "qualified",
  agreedPriceXaf: 25000,
  targetStartDate: "2026-11-02",
  ...(finalVariantId === undefined ? {} : { finalVariantId }),
});
let safe = false;

before(async () => {
  assertLocalTestDatabase();
  safe = true;
  await db.insert(users).values({
    id: userId,
    email: `variantless-${userId}@example.invalid`,
    passwordHash: "synthetic",
    role: "admin",
    status: "active",
  });
  await db.insert(services).values([
    {
      id: variantlessServiceId,
      name: "Synthetic Bilan",
      slug: `bilan-${variantlessServiceId}`,
      pricingMode: "fixed",
      deliveryType: "one_off",
      availabilityStatus: "open",
      capacityMode: "unlimited",
      defaultDurationValue: 1,
      defaultDurationUnit: "week",
    },
    {
      id: variantServiceId,
      name: "Synthetic Coaching",
      slug: `coaching-${variantServiceId}`,
      pricingMode: "quote",
      deliveryType: "subscription",
      availabilityStatus: "open",
      capacityMode: "unlimited",
      defaultDurationValue: 8,
      defaultDurationUnit: "week",
    },
  ]);
  await db.insert(serviceVariants).values([
    {
      id: activeVariantId,
      serviceId: variantServiceId,
      name: "Active option",
      slug: `active-${activeVariantId}`,
      priceXaf: 60000,
    },
    {
      id: archivedVariantId,
      serviceId: variantServiceId,
      name: "Archived option",
      slug: `archived-${archivedVariantId}`,
      priceXaf: 50000,
      archivedAt: new Date(),
      availabilityStatus: "archived",
    },
  ]);
  await db.insert(serviceComponents).values({
    id: serviceComponentId,
    serviceId: variantlessServiceId,
    variantId: null,
    componentType: "appointment",
    label: "Session d'évaluation initiale",
    quantity: 1,
  });
});

after(async () => {
  try {
    if (!safe) return;
    if (requestIds.length) {
      await db
        .delete(auditEvents)
        .where(inArray(auditEvents.entityId, requestIds));
      const subs = (
        await db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(inArray(subscriptions.sourceRequestId, requestIds))
      ).map((r) => r.id);
      if (subs.length) {
        await db
          .delete(subscriptionComponents)
          .where(inArray(subscriptionComponents.subscriptionId, subs));
        await db
          .delete(subscriptionFollowUpCadenceHistory)
          .where(
            inArray(subscriptionFollowUpCadenceHistory.subscriptionId, subs),
          );
        await db
          .delete(subscriptionStatusHistory)
          .where(inArray(subscriptionStatusHistory.subscriptionId, subs));
        await db
          .update(serviceRequests)
          .set({ convertedSubscriptionId: null })
          .where(inArray(serviceRequests.id, requestIds));
        await db.delete(subscriptions).where(inArray(subscriptions.id, subs));
      }
      await db
        .delete(qualificationReviews)
        .where(inArray(qualificationReviews.requestId, requestIds));
      await db
        .delete(serviceRequests)
        .where(inArray(serviceRequests.id, requestIds));
    }
    if (prospectIds.length) {
      await db
        .delete(customers)
        .where(inArray(customers.prospectId, prospectIds));
      await db.delete(prospects).where(inArray(prospects.id, prospectIds));
    }
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    await db
      .delete(serviceComponents)
      .where(
        inArray(serviceComponents.serviceId, [
          variantlessServiceId,
          variantServiceId,
        ]),
      );
    await db
      .delete(serviceVariants)
      .where(
        inArray(serviceVariants.serviceId, [
          variantlessServiceId,
          variantServiceId,
        ]),
      );
    await db
      .delete(services)
      .where(inArray(services.id, [variantlessServiceId, variantServiceId]));
    await db.delete(users).where(eq(users.id, userId));
  } finally {
    await pool.end();
  }
});

async function requestInQualification(serviceId: string) {
  const prospectId = randomUUID(),
    requestId = randomUUID();
  prospectIds.push(prospectId);
  requestIds.push(requestId);
  const phone = `+2416${prospectId.replace(/\D/g, "").slice(0, 7).padEnd(7, "0")}`;
  await db.insert(prospects).values({
    id: prospectId,
    fullName: "Synthetic Variantless",
    whatsapp: phone,
    source: "integration-test",
  });
  await db.insert(serviceRequests).values({
    id: requestId,
    reference: `REQ-VL-${requestId}`,
    submissionToken: `variantless-${requestId}`,
    prospectId,
    serviceId,
    status: "qualification_in_progress",
  });
  return requestId;
}

test("variant-less offer: qualified with no option succeeds (R1)", async () => {
  const requestId = await requestInQualification(variantlessServiceId);
  const result = await admin.recordQualificationReview(
    requestId,
    qualified(null),
    actor,
    audit,
    new Date(),
  );
  assert.equal(result.status, "ok", JSON.stringify(result));
  const [review] = await db
    .select()
    .from(qualificationReviews)
    .where(eq(qualificationReviews.requestId, requestId));
  assert.equal(review?.finalVariantId, null);
  const absent = await admin.recordQualificationReview(
    await requestInQualification(variantlessServiceId),
    qualified(),
    actor,
    audit,
    new Date(),
  );
  assert.equal(absent.status, "ok", "an absent finalVariantId is accepted too");
});

test("variant-less offer: choosing an option is refused as not applicable (R1)", async () => {
  const requestId = await requestInQualification(variantlessServiceId);
  assert.deepEqual(
    await admin.recordQualificationReview(
      requestId,
      qualified(activeVariantId),
      actor,
      audit,
      new Date(),
    ),
    { status: "invalid", reason: "final_variant_not_applicable" },
  );
});

test("offer with options: no option is refused as required; archived option refused and not offered (R1, R4)", async () => {
  const requestId = await requestInQualification(variantServiceId);
  assert.deepEqual(
    await admin.recordQualificationReview(
      requestId,
      qualified(null),
      actor,
      audit,
      new Date(),
    ),
    { status: "invalid", reason: "final_variant_required" },
  );
  assert.deepEqual(
    await admin.recordQualificationReview(
      requestId,
      qualified(archivedVariantId),
      actor,
      audit,
      new Date(),
    ),
    { status: "invalid", reason: "final_variant_id_invalid" },
  );
  const detail = await new DrizzleAdminRequestsRepository(
    db,
    options,
  ).getDetail(requestId);
  assert.deepEqual(
    detail?.qualificationAvailableVariants.map((v) => v.id),
    [activeVariantId],
  );
  assert.equal(
    (
      await admin.recordQualificationReview(
        requestId,
        qualified(activeVariantId),
        actor,
        audit,
        new Date(),
      )
    ).status,
    "ok",
    "existing variant path unchanged",
  );
});

test("rejected decision still forbids an option (R2)", async () => {
  const requestId = await requestInQualification(variantlessServiceId);
  assert.deepEqual(
    await admin.recordQualificationReview(
      requestId,
      { outcome: "rejected", finalVariantId: activeVariantId },
      actor,
      audit,
      new Date(),
    ),
    { status: "invalid", reason: "final_variant_forbidden" },
  );
});

test("conversion of a no-option qualification: variant_id null, service duration, service-level components only, even after a later option (R3)", async () => {
  const requestId = await requestInQualification(variantlessServiceId);
  assert.equal(
    (
      await admin.recordQualificationReview(
        requestId,
        qualified(null),
        actor,
        audit,
        new Date(),
      )
    ).status,
    "ok",
  );
  await db.insert(serviceVariants).values({
    id: lateVariantId,
    serviceId: variantlessServiceId,
    name: "Late option",
    slug: `late-${lateVariantId}`,
    priceXaf: 40000,
    durationValue: 3,
    durationUnit: "month",
  });
  await db.insert(serviceComponents).values({
    id: lateComponentId,
    serviceId: variantlessServiceId,
    variantId: lateVariantId,
    componentType: "follow_up",
    label: "Late option component",
    quantity: 5,
  });
  try {
    const result = await conversion.convert(
      requestId,
      {},
      { ...actor, requestId: randomUUID(), ...audit },
    );
    assert.equal(result.status, "ok", JSON.stringify(result));
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.sourceRequestId, requestId));
    assert.equal(subscription?.variantId, null);
    assert.deepEqual(
      [subscription?.durationValueSnapshot, subscription?.durationUnitSnapshot],
      [1, "week"],
    );
    const components = await db
      .select()
      .from(subscriptionComponents)
      .where(eq(subscriptionComponents.subscriptionId, subscription!.id));
    assert.deepEqual(
      components.map((c) => [
        c.sourceServiceComponentId,
        c.labelSnapshot,
        c.quantityEntitled,
      ]),
      [[serviceComponentId, "Session d'évaluation initiale", 1]],
    );
  } finally {
    await db
      .delete(serviceComponents)
      .where(eq(serviceComponents.id, lateComponentId));
  }
});

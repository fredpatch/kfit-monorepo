import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { serviceComponents, servicePolicies, services, serviceVariants } from "../../../db/schema/catalogue.js";
import { subscriptionFollowUpCadenceHistory } from "../../../db/schema/coaching.js";
import { customers, subscriptionComponents, subscriptions, subscriptionStatusHistory } from "../../../db/schema/customers.js";
import { medicalClearanceRecords, onboardingItems } from "../../../db/schema/onboarding.js";
import { prospects, qualificationReviews, serviceRequests } from "../../../db/schema/prospects.js";
import { DrizzleCatalogueContentRepository } from "../repositories/catalogue-content.repository.js";
import { DrizzleCatalogueRepository } from "../repositories/catalogue.repositories.js";
import { CatalogueContentService } from "../services/catalogue-content.service.js";
import { CatalogueService } from "../services/catalogue.service.js";
import { DrizzleOnboardingRepository } from "../../onboarding/repositories/onboarding.repository.js";
import { lockCadenceWrites, recordEffectiveCadence, resolvedCadence } from "../../follow-ups/repositories/cadence-history.repository.js";
import { DrizzleAdminRequestsRepository } from "../../requests/repositories/admin-requests.repositories.js";
import { DrizzleRequestConversionRepository } from "../../requests/repositories/request-conversion.repository.js";
import { AdminRequestsService } from "../../requests/services/admin-requests.service.js";
import { RequestConversionService } from "../../requests/services/request-conversion.service.js";

// CAT-03a (REG-F2): offer content editing against real PostgreSQL.
const userId = randomUUID(), customerId = randomUUID();
const serviceIds: string[] = [], requestIds: string[] = [], prospectIds: string[] = [], subscriptionIds: string[] = [];
const options = { auditHashPepper: "synthetic-catalogue-content-pepper-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.61", userAgent: "synthetic-catalogue-content" };
const content = new CatalogueContentService(new DrizzleCatalogueContentRepository(db, options));
const catalogue = new CatalogueService(new DrizzleCatalogueRepository(db));
const onboarding = new DrizzleOnboardingRepository(db, options);
const admin = new AdminRequestsService(new DrizzleAdminRequestsRepository(db, options));
const conversion = new RequestConversionService(new DrizzleRequestConversionRepository(db, options));
const rules = { followUpFrequencyDays: 7, lateCancelNoticeHours: 24, lateCancelConsumesComponent: false, missedConsumesComponent: true, medicalClearancePolicy: "not_required" };
let safe = false;

before(async () => {
  assertLocalTestDatabase();
  safe = true;
  await db.insert(users).values({ id: userId, email: `catalogue-content-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Catalogue Customer", whatsapp: `+2417${customerId.replace(/\D/g, "").slice(0, 7).padEnd(7, "0")}` });
});
after(async () => {
  try {
    if (!safe) return;
    const subs = serviceIds.length ? (await db.select({ id: subscriptions.id }).from(subscriptions).where(inArray(subscriptions.serviceId, serviceIds))).map(s => s.id) : [];
    if (subs.length) {
      await db.delete(subscriptionComponents).where(inArray(subscriptionComponents.subscriptionId, subs));
      await db.delete(subscriptionFollowUpCadenceHistory).where(inArray(subscriptionFollowUpCadenceHistory.subscriptionId, subs));
      await db.delete(subscriptionStatusHistory).where(inArray(subscriptionStatusHistory.subscriptionId, subs));
      await db.delete(onboardingItems).where(inArray(onboardingItems.subscriptionId, subs));
      await db.delete(medicalClearanceRecords).where(inArray(medicalClearanceRecords.subscriptionId, subs));
      if (requestIds.length) await db.update(serviceRequests).set({ convertedSubscriptionId: null }).where(inArray(serviceRequests.id, requestIds));
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, subs));
      await db.delete(subscriptions).where(inArray(subscriptions.id, subs));
    }
    if (requestIds.length) {
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, requestIds));
      await db.delete(qualificationReviews).where(inArray(qualificationReviews.requestId, requestIds));
      await db.delete(serviceRequests).where(inArray(serviceRequests.id, requestIds));
    }
    if (prospectIds.length) { await db.delete(customers).where(inArray(customers.prospectId, prospectIds)); await db.delete(prospects).where(inArray(prospects.id, prospectIds)); }
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    if (serviceIds.length) {
      await db.delete(servicePolicies).where(inArray(servicePolicies.serviceId, serviceIds));
      await db.delete(serviceComponents).where(inArray(serviceComponents.serviceId, serviceIds));
      await db.delete(serviceVariants).where(inArray(serviceVariants.serviceId, serviceIds));
      await db.delete(services).where(inArray(services.id, serviceIds));
    }
    await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});

async function offer(overrides: Partial<typeof services.$inferInsert> = {}) {
  const id = randomUUID(); serviceIds.push(id);
  await db.insert(services).values({ id, name: "Synthetic Offer", slug: `offer-${id}`, pricingMode: "fixed", deliveryType: "time_based", defaultDurationValue: 12, defaultDurationUnit: "week",
    availabilityStatus: "open", capacityMode: "unlimited", ...overrides });
  return id;
}
async function ok<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: string; reason?: string }>): Promise<T> {
  const result = await promise; assert.ok(result.ok, JSON.stringify(result)); if (!result.ok) throw new Error("expected ok"); return result.value;
}
const variant = async (serviceId: string, slug: string, extra: object = {}) =>
  (await ok(content.execute("variant_create", { serviceId }, { name: slug, slug, priceXaf: 50000, ...extra }, actor)) as { variant: { id: string } }).variant.id;
const component = async (serviceId: string, variantId: string | null, label: string) =>
  (await ok(content.execute("component_create", { serviceId }, { variantId, componentType: "appointment", label, quantity: 2 }, actor)) as { component: { id: string } }).component.id;
async function subscription(serviceId: string, variantId: string | null, status: string) {
  const id = randomUUID(); subscriptionIds.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-CAT03-${id}`, customerId, serviceId, variantId, status, agreedPriceXaf: 1, currency: "XAF",
    plannedStartDate: new Date(Date.now() + 86400000), actualStartDate: status === "active" ? new Date(Date.now() - 10 * 86400000) : null, createdByUserId: userId });
  return id;
}
async function startCadence(id: string) {
  await db.transaction(async tx => {
    await lockCadenceWrites(tx);
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for("update");
    await recordEffectiveCadence(tx, sub!, await resolvedCadence(tx, sub!), new Date(Date.now() - 86400000));
  });
}
const history = (id: string) => db.select().from(subscriptionFollowUpCadenceHistory).where(eq(subscriptionFollowUpCadenceHistory.subscriptionId, id)).orderBy(subscriptionFollowUpCadenceHistory.effectiveFrom);
async function convertedSubscription(serviceId: string, finalVariantId: string | null) {
  const prospectId = randomUUID(), requestId = randomUUID(); prospectIds.push(prospectId); requestIds.push(requestId);
  await db.insert(prospects).values({ id: prospectId, fullName: "Synthetic Catalogue Prospect", whatsapp: `+2416${prospectId.replace(/\D/g, "").slice(0, 7).padEnd(7, "0")}`, source: "integration-test" });
  await db.insert(serviceRequests).values({ id: requestId, reference: `REQ-CAT03-${requestId}`, submissionToken: `cat03-${requestId}`, prospectId, serviceId, status: "qualification_in_progress" });
  const review = await admin.recordQualificationReview(requestId, { outcome: "qualified", agreedPriceXaf: 25000, targetStartDate: "2026-11-02", finalVariantId }, { userId }, actor, new Date());
  assert.equal(review.status, "ok", JSON.stringify(review));
  return { requestId, convert: () => conversion.convert(requestId, {}, { ...actor, requestId: randomUUID() }) };
}

test("PostgreSQL variants: create, edit, slug conflict, archive; archived variant leaves the public list and new conversions (D1)", async () => {
  const serviceId = await offer({ isPublic: true, publishedAt: new Date() });
  await component(serviceId, null, "Séance commune");
  const keep = await variant(serviceId, "standard"), drop = await variant(serviceId, "premium", { durationValue: 3, durationUnit: "month" });
  const edited = await ok(content.execute("variant_update", { serviceId, variantId: keep }, { priceXaf: 55000, sortOrder: 2 }, actor)) as { variant: { priceXaf: number; sortOrder: number } };
  assert.equal(edited.variant.priceXaf, 55000); assert.equal(edited.variant.sortOrder, 2);
  assert.deepEqual(await content.execute("variant_create", { serviceId }, { name: "Dup", slug: "standard" }, actor), { ok: false, error: "variant_slug_conflict" });
  assert.deepEqual(await content.execute("variant_update", { serviceId, variantId: keep }, { durationValue: 4 }, actor), { ok: false, error: "invalid", reason: "duration_pair_invalid" });
  const { convert } = await convertedSubscription(serviceId, drop);
  await ok(content.execute("variant_archive", { serviceId, variantId: drop }, {}, actor));
  await ok(content.execute("variant_archive", { serviceId, variantId: drop }, {}, actor));
  assert.deepEqual(await content.execute("variant_update", { serviceId, variantId: drop }, { priceXaf: 1 }, actor), { ok: false, error: "variant_archived" });
  const listed = (await catalogue.listPublicServices()).services.find(s => s.id === serviceId);
  assert.deepEqual(listed?.variants.map(v => v.slug), ["standard"]);
  assert.deepEqual(await convert(), { status: "qualification_invalid" });
  const audits = await db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, userId), eq(auditEvents.entityId, drop)));
  assert.deepEqual(audits.map(a => a.eventType).sort(), ["catalogue.variant_archived", "catalogue.variant_created"], "repeated archive is a no-op");
});

test("PostgreSQL components: edit and archive; a new conversion skips archived ones; sold snapshots never change (D2)", async () => {
  const serviceId = await offer();
  const variantId = await variant(serviceId, "suivi");
  const shared = await component(serviceId, null, "Bilan initial"), own = await component(serviceId, variantId, "Séances");
  const first = await convertedSubscription(serviceId, variantId);
  const converted = await first.convert(); assert.equal(converted.status, "ok", JSON.stringify(converted));
  const soldId = converted.status === "ok" ? converted.response.subscription.id : "";
  await ok(content.execute("component_update", { serviceId, componentId: own }, { label: "Séances individuelles", quantity: 6 }, actor));
  await ok(content.execute("variant_update", { serviceId, variantId }, { priceXaf: 99000 }, actor));
  await ok(content.execute("component_archive", { serviceId, componentId: shared }, {}, actor));
  assert.deepEqual(await content.execute("component_update", { serviceId, componentId: shared }, { label: "x" }, actor), { ok: false, error: "component_archived" });
  assert.deepEqual(await content.execute("component_update", { serviceId, componentId: own }, { variantId: null }, actor), { ok: false, error: "invalid", reason: "scope_not_editable" });
  const sold = await db.select().from(subscriptionComponents).where(eq(subscriptionComponents.subscriptionId, soldId));
  assert.deepEqual(sold.map(c => [c.labelSnapshot, c.quantityEntitled]).sort(), [["Bilan initial", 2], ["Séances", 2]]);
  const [soldSub] = await db.select().from(subscriptions).where(eq(subscriptions.id, soldId)); assert.equal(soldSub?.agreedPriceXaf, 25000);
  const second = await (await convertedSubscription(serviceId, variantId)).convert(); assert.equal(second.status, "ok");
  const fresh = await db.select().from(subscriptionComponents).where(eq(subscriptionComponents.subscriptionId, second.status === "ok" ? second.response.subscription.id : ""));
  assert.deepEqual(fresh.map(c => [c.labelSnapshot, c.quantityEntitled]), [["Séances individuelles", 6]]);
  const overview = (await catalogue.listAdminOverview()).services.find(s => s.id === serviceId);
  assert.deepEqual(overview?.components, [], "archived components leave the admin « included » list");
});

test("PostgreSQL rules: offer-level create then update keeps the questionnaire assignment; one offer-level row per service (D3, D7)", async () => {
  const serviceId = await offer();
  const created = await ok(content.execute("rules_put", { serviceId }, rules, actor)) as { rules: { followUpFrequencyDays: number }; onboardingSubscriptionsAffected: number };
  assert.equal(created.onboardingSubscriptionsAffected, 0);
  const templateId = randomUUID();
  await db.update(servicePolicies).set({ questionnaireTemplateId: templateId }).where(and(eq(servicePolicies.serviceId, serviceId), isNull(servicePolicies.variantId)));
  await ok(content.execute("rules_put", { serviceId }, { ...rules, lateCancelNoticeHours: 48 }, actor));
  const [row] = await db.select().from(servicePolicies).where(and(eq(servicePolicies.serviceId, serviceId), isNull(servicePolicies.variantId)));
  assert.equal(row?.lateCancelNoticeHours, 48); assert.equal(row?.questionnaireTemplateId, templateId);
  await assert.rejects(db.insert(servicePolicies).values({ serviceId, variantId: null }), (error: unknown) => JSON.stringify(error).includes("23505") || String((error as { cause?: { code?: string } }).cause?.code) === "23505");
  const updated = (await db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, userId), eq(auditEvents.entityId, row!.id), eq(auditEvents.eventType, "catalogue.rules_updated"))));
  assert.ok(updated.some(a => JSON.stringify(a.metadataJson).includes("lateCancelNoticeHours") && !JSON.stringify(a.metadataJson).includes("followUpFrequencyDays")), "only changed fields are audited");
});

test("PostgreSQL rules: cadence history follows offer and override changes without overlap; override subscriptions untouched (D3)", async () => {
  const serviceId = await offer();
  const plain = await variant(serviceId, "plain"), special = await variant(serviceId, "special");
  await ok(content.execute("rules_put", { serviceId }, rules, actor));
  await ok(content.execute("variant_rules_put", { serviceId, variantId: special }, { ...rules, followUpFrequencyDays: 3, medicalClearancePolicy: null }, actor));
  const onPlain = await subscription(serviceId, plain, "active"), onSpecial = await subscription(serviceId, special, "active");
  await startCadence(onPlain); await startCadence(onSpecial);
  await ok(content.execute("rules_put", { serviceId }, { ...rules, followUpFrequencyDays: 14 }, actor));
  assert.deepEqual((await history(onPlain)).map(h => [h.effectiveFrequencyDays, h.source, h.effectiveTo === null]), [[7, "service", false], [14, "service", true]]);
  assert.deepEqual((await history(onSpecial)).map(h => [h.effectiveFrequencyDays, h.source]), [[3, "variant"]]);
  const removed = await ok(content.execute("variant_rules_delete", { serviceId, variantId: special }, undefined, actor));
  assert.deepEqual(removed, { removed: true, onboardingSubscriptionsAffected: 0 });
  const rows = await history(onSpecial);
  assert.deepEqual(rows.map(h => [h.effectiveFrequencyDays, h.source]), [[3, "variant"], [14, "service"]]);
  assert.equal(rows[0]!.effectiveTo?.toISOString(), rows[1]!.effectiveFrom.toISOString(), "intervals touch, never overlap");
  assert.deepEqual(await content.execute("variant_rules_delete", { serviceId, variantId: special }, undefined, actor), { ok: false, error: "override_not_found" });
});

test("PostgreSQL rules: concurrent writes serialize into one consistent row and history", async () => {
  const serviceId = await offer();
  await ok(content.execute("rules_put", { serviceId }, rules, actor));
  const sub = await subscription(serviceId, null, "active"); await startCadence(sub);
  const results = await Promise.all([10, 20, 30].map(days => content.execute("rules_put", { serviceId }, { ...rules, followUpFrequencyDays: days }, actor)));
  assert.ok(results.every(r => r.ok), JSON.stringify(results));
  const policies = await db.select().from(servicePolicies).where(eq(servicePolicies.serviceId, serviceId));
  assert.equal(policies.length, 1);
  const rows = await history(sub);
  assert.equal(rows.at(-1)!.effectiveFrequencyDays, policies[0]!.followUpFrequencyDays);
  assert.equal(rows.filter(h => h.effectiveTo === null).length, 1);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1]!.effectiveTo! <= rows[i]!.effectiveFrom);
});

test("PostgreSQL a variant row holding a questionnaire assignment is not removed as an override (D3)", async () => {
  const serviceId = await offer(); const variantId = await variant(serviceId, "q");
  await ok(content.execute("rules_put", { serviceId }, rules, actor));
  await ok(content.execute("variant_rules_put", { serviceId, variantId }, rules, actor));
  await db.update(servicePolicies).set({ questionnaireTemplateId: randomUUID() }).where(eq(servicePolicies.variantId, variantId));
  assert.deepEqual(await content.execute("variant_rules_delete", { serviceId, variantId }, undefined, actor), { ok: false, error: "override_has_questionnaire" });
});

async function medicalItem(id: string) { return (await db.select().from(onboardingItems).where(and(eq(onboardingItems.subscriptionId, id), eq(onboardingItems.itemType, "medical_clearance"))))[0]; }
async function openMedical(id: string) { return db.select().from(medicalClearanceRecords).where(and(eq(medicalClearanceRecords.subscriptionId, id), inArray(medicalClearanceRecords.status, ["required", "pending", "awaiting_document", "under_review"]))); }

test("PostgreSQL medical « required » blocks onboarding live; lifting it re-derives readiness; affected count returned (D4, D5)", async () => {
  const serviceId = await offer();
  await ok(content.execute("rules_put", { serviceId }, { ...rules, medicalClearancePolicy: "required" }, actor));
  const early = await subscription(serviceId, null, "onboarding");
  const init = await onboarding.execute(early, { action: "initialize" }, actor); assert.equal(init.status, "ok");
  assert.equal((await medicalItem(early))?.status, "pending"); assert.equal((await medicalItem(early))?.isBlocking, true); assert.equal((await openMedical(early)).length, 1);
  if (init.status === "ok") assert.equal(init.onboarding.canReady, false);
  const late = await subscription(serviceId, null, "onboarding"); const active = await subscription(serviceId, null, "active"); await startCadence(active);
  const lifted = await ok(content.execute("rules_put", { serviceId }, { ...rules, medicalClearancePolicy: "not_required" }, actor)) as { onboardingSubscriptionsAffected: number };
  assert.equal(lifted.onboardingSubscriptionsAffected, 2);
  assert.equal(await medicalItem(early), undefined); assert.equal((await openMedical(early)).length, 0);
  const [waived] = await db.select().from(medicalClearanceRecords).where(eq(medicalClearanceRecords.subscriptionId, early)); assert.equal(waived?.status, "waived");
  const again = await ok(content.execute("rules_put", { serviceId }, { ...rules, medicalClearancePolicy: "required" }, actor)) as { onboardingSubscriptionsAffected: number };
  assert.equal(again.onboardingSubscriptionsAffected, 2);
  for (const id of [early, late]) { assert.equal((await medicalItem(id))?.status, "pending"); assert.equal((await openMedical(id)).length, 1); }
  assert.equal(await medicalItem(active), undefined, "D5: live medical changes reach onboarding subscriptions only");
  const unchanged = await ok(content.execute("rules_put", { serviceId }, { ...rules, medicalClearancePolicy: "required", lateCancelNoticeHours: 72 }, actor)) as { onboardingSubscriptionsAffected: number };
  assert.equal(unchanged.onboardingSubscriptionsAffected, 0);
});

test("PostgreSQL publish guard: refused with failed rules, then publishes; a published offer that breaks is flagged, not unpublished (D6)", async () => {
  const serviceId = await offer({ basePriceXaf: null });
  const variantId = await variant(serviceId, "only", { priceXaf: null });
  const refused = await catalogue.publishAdminService(serviceId);
  assert.equal(refused.status, "not_deliverable");
  if (refused.status === "not_deliverable") assert.deepEqual(refused.failures.map(f => f.rule).sort(), ["price_missing", "service_rules_missing", "variant_component_missing"]);
  const [still] = await db.select().from(services).where(eq(services.id, serviceId)); assert.equal(still?.publishedAt, null);
  await ok(content.execute("variant_update", { serviceId, variantId }, { priceXaf: 40000 }, actor));
  const own = await component(serviceId, variantId, "Séance");
  await ok(content.execute("rules_put", { serviceId }, rules, actor));
  assert.equal((await catalogue.publishAdminService(serviceId)).status, "ok");
  await ok(content.execute("component_archive", { serviceId, componentId: own }, {}, actor));
  assert.deepEqual(await ok(content.execute("deliverability", { serviceId }, undefined, actor)), { serviceId, deliverable: false, failures: [{ rule: "variant_component_missing", variantId }] });
  const [published] = await db.select().from(services).where(eq(services.id, serviceId)); assert.ok(published?.publishedAt); assert.equal(published?.isPublic, true);
});

test("PostgreSQL archived offers stay read-only for content writes", async () => {
  const serviceId = await offer({ archivedAt: new Date(), availabilityStatus: "archived" });
  assert.deepEqual(await content.execute("variant_create", { serviceId }, { name: "X", slug: "x" }, actor), { ok: false, error: "service_archived" });
  assert.deepEqual(await content.execute("rules_put", { serviceId }, rules, actor), { ok: false, error: "service_archived" });
  assert.deepEqual(await content.execute("variant_create", { serviceId: randomUUID() }, { name: "X", slug: "x" }, actor), { ok: false, error: "service_not_found" });
});

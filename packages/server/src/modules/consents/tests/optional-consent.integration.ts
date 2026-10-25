import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray, or } from "drizzle-orm";
import { consentTypes, type ConsentDetail, type ConsentType, type OptionalConsentType } from "@kfit/shared";
import { latestDefinitions } from "../services/consent.service.js";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { services } from "../../../db/schema/catalogue.js";
import { progressMeasurements } from "../../../db/schema/coaching.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { consentDefinitions, consentRecords } from "../../../db/schema/onboarding.js";
import { externalAccessEvents, secureAccessTokens } from "../../../db/schema/documents.js";
import { DrizzleConsentRepository } from "../repositories/consent.repository.js";
import { DrizzleProgressRepository } from "../../progress/repositories/progress.repository.js";
import { DrizzleDocumentsRepository } from "../../documents/repositories/documents.repository.js";

const userId = randomUUID(), customerId = randomUUID(), serviceId = randomUUID();
const subscriptionIds: string[] = [], definitionIds: string[] = [];
const options = { auditHashPepper: "synthetic-optional-consent-pepper-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.45", userAgent: "synthetic-optional-consent-integration" };
const anonymous = { ...actor, userId: null };
const repo = new DrizzleConsentRepository(db, options);
const progress = new DrizzleProgressRepository(db, options);
const documents = new DrizzleDocumentsRepository(db, { auditHashPepper: options.auditHashPepper, tokenPepper: "optional-consent-token-pepper-123456789012", verificationPepper: "optional-consent-code-pepper-1234567890123" });
const contentOf = (type: ConsentType, marker: string) => `SYNTHETIC CONS-02 WORDING ${type} ${marker}`;
let safeTarget = false;

async function draft(type: ConsentType, marker: string = randomUUID()) {
  const result = await repo.definitions({ action: "definition_create", consentType: type, title: `SYNTHETIC CONS-02 ${type}`, content: contentOf(type, marker) }, actor);
  assert.ok(result.ok && "definition" in result.body); if (!result.ok || !("definition" in result.body)) throw new Error("expected draft");
  definitionIds.push(result.body.definition.id); return result.body.definition;
}
async function publish(type: ConsentType) {
  const created = await draft(type);
  const result = await repo.definitions({ action: "definition_publish", definitionId: created.id }, actor);
  assert.ok(result.ok && "definition" in result.body); if (!result.ok || !("definition" in result.body)) throw new Error("expected published");
  return result.body.definition;
}
before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev", "optional consent integration requires disposable local PostgreSQL"); safeTarget = true;
  await db.insert(users).values({ id: userId, email: `optional-consent-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Optional Consent Customer", whatsapp: `+241${String(BigInt("0x" + customerId.replaceAll("-", "").slice(0, 12)) % 1000000000000n).padStart(12, "0")}` });
  await db.insert(services).values({ id: serviceId, name: "Synthetic Optional Consent Service", slug: `optional-consent-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  for (const type of consentTypes) await publish(type);
});
after(async () => {
  try {
    if (!safeTarget) return;
    if (subscriptionIds.length) {
      const tokens = await db.select({ id: secureAccessTokens.id }).from(secureAccessTokens).where(inArray(secureAccessTokens.resourceId, subscriptionIds));
      await db.delete(consentRecords).where(inArray(consentRecords.subscriptionId, subscriptionIds));
      await db.delete(progressMeasurements).where(inArray(progressMeasurements.subscriptionId, subscriptionIds));
      if (tokens.length) { await db.delete(externalAccessEvents).where(inArray(externalAccessEvents.secureAccessTokenId, tokens.map(t => t.id))); await db.delete(secureAccessTokens).where(inArray(secureAccessTokens.id, tokens.map(t => t.id))); }
      await db.delete(subscriptions).where(inArray(subscriptions.id, subscriptionIds));
    }
    await db.delete(auditEvents).where(or(eq(auditEvents.actorUserId, userId), ...(subscriptionIds.length ? [inArray(auditEvents.entityId, subscriptionIds)] : [])));
    if (definitionIds.length) await db.delete(consentDefinitions).where(inArray(consentDefinitions.id, definitionIds));
    await db.delete(services).where(eq(services.id, serviceId)); await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});
async function subscription(status: string) {
  const id = randomUUID(); subscriptionIds.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-OPTCONSENT-${id}`, customerId, serviceId, status, agreedPriceXaf: 50000, currency: "XAF", createdByUserId: userId });
  return id;
}
async function detail(id: string): Promise<ConsentDetail> {
  const result = await repo.execute(id, { action: "read" }, actor); assert.ok(result.ok && "consents" in result.body);
  if (!result.ok || !("consents" in result.body)) throw new Error("expected consent detail"); return result.body.consents;
}
async function request(id: string, types: OptionalConsentType[]) {
  const result = await repo.execute(id, { action: "issue_optional", types, expiresAt: new Date(Date.now() + 3600000) }, actor); assert.ok(result.ok && "token" in result.body, JSON.stringify(result));
  if (!result.ok || !("token" in result.body)) throw new Error("expected optional link"); return result.body;
}
async function coachCapture(id: string, decisions: Partial<Record<OptionalConsentType, "granted" | "refused">>) {
  const expectedDefinitionIds = latestDefinitions((await detail(id)).definitions).filter(d => d.consentType in decisions).map(d => d.id);
  return repo.execute(id, { action: "capture_optional", decisions, expectedDefinitionIds }, actor);
}
async function canRecord(id: string) {
  const result = await progress.execute(id, { action: "progress" }, actor); assert.ok(result.ok && "progress" in result.body);
  return result.ok && "progress" in result.body ? result.body.progress.canRecord : false;
}
async function photoRefusal(id: string) {
  const measurementId = randomUUID(); const now = new Date();
  await db.insert(progressMeasurements).values({ id: measurementId, subscriptionId: id, measuredAt: now, weightKg: "80.00", createdByUserId: userId });
  return documents.execute(measurementId, { action: "add-photo", measurementId, photoType: "front", takenAt: now,
    file: { storageKey: randomUUID() + ".jpg", originalFilename: "progress.jpg", mimeType: "image/jpeg", sizeBytes: 100, sha256: "e".repeat(64) } }, actor);
}
const rows = (id: string) => db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, id));
const audits = (id: string) => db.select().from(auditEvents).where(eq(auditEvents.entityId, id));

test("PostgreSQL active subscription: optional link lists only requested types, records grant and refusal, gates progress and photos, rejects replay (D1, D3)", async () => {
  const id = await subscription("active");
  assert.equal(await canRecord(id), false);
  const link = await request(id, ["health_data", "progress_photo_storage"]);
  assert.equal(link.link.kind, "optional"); assert.deepEqual(link.link.types, ["health_data", "progress_photo_storage"]); assert.equal(link.link.state, "available");
  const view = await repo.publicAccess(link.token, null, anonymous); assert.ok(view.ok && "document" in view.body);
  if (view.ok && "document" in view.body) assert.deepEqual(view.body.document.definitions.map(d => d.consentType), ["health_data", "progress_photo_storage"]);
  assert.deepEqual(await repo.publicAccess(link.token, { health_data: "granted", progress_photo_storage: "refused" }, anonymous), { ok: true, body: { accepted: true } });
  const records = await rows(id);
  assert.deepEqual(records.map(r => r.decision).sort(), ["granted", "refused"]); assert.ok(records.every(r => r.capturedVia === "public_link" && r.secureAccessTokenId === link.link.id && r.capturedByUserId === null));
  assert.equal(await canRecord(id), true);
  assert.deepEqual(await photoRefusal(id), { ok: false, error: "DOCUMENT_PHOTO_CONSENT_REQUIRED" });
  assert.deepEqual(await repo.publicAccess(link.token, { health_data: "granted", progress_photo_storage: "granted" }, anonymous), { ok: false, error: "CONSENT_LINK_CONSUMED" });
  assert.equal((await rows(id)).length, 2);
  const states = (await detail(id)).optionalStates; assert.equal(states.health_data, "granted"); assert.equal(states.progress_photo_storage, "refused"); assert.equal(states.marketing, "none");
  assert.equal((await audits(id)).filter(e => e.eventType === "consent.request_link_issued").length, 1);
});

test("PostgreSQL optional link submission refuses a type that was not requested, with no consent writes", async () => {
  const id = await subscription("paused"); const link = await request(id, ["marketing"]);
  assert.deepEqual(await repo.publicAccess(link.token, { marketing: "granted", publication: "granted" }, anonymous), { ok: false, error: "CONSENT_TYPE_NOT_REQUESTED" });
  assert.deepEqual(await repo.publicAccess(link.token, { service_terms: "granted", privacy_notice: "granted" }, anonymous), { ok: false, error: "CONSENT_TYPE_NOT_REQUESTED" });
  assert.equal((await rows(id)).length, 0);
  const access = await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.secureAccessTokenId, link.link.id)); assert.ok(access.every(e => e.result === "CONSENT_TYPE_NOT_REQUESTED"));
  assert.deepEqual(await repo.publicAccess(link.token, { marketing: "refused" }, anonymous), { ok: true, body: { accepted: true } });
});

test("PostgreSQL issuing a new optional link revokes the previous available one (D3)", async () => {
  const id = await subscription("active"); const first = await request(id, ["health_data"]); const second = await request(id, ["health_data", "marketing"]);
  const links = (await detail(id)).links; assert.equal(links.find(l => l.id === first.link.id)?.state, "revoked"); assert.equal(links.find(l => l.id === second.link.id)?.state, "available");
  assert.deepEqual(await repo.publicAccess(first.token, { health_data: "granted" }, anonymous), { ok: false, error: "CONSENT_LINK_REVOKED" });
});

for (const status of ["completed", "cancelled"]) test(`PostgreSQL ${status} subscription refuses optional link and capture, still allows revocation (D1)`, async () => {
  const id = await subscription("active"); assert.ok((await coachCapture(id, { marketing: "granted" })).ok);
  await db.update(subscriptions).set({ status }).where(eq(subscriptions.id, id));
  assert.deepEqual(await repo.execute(id, { action: "issue_optional", types: ["health_data"], expiresAt: new Date(Date.now() + 3600000) }, actor), { ok: false, error: "CONSENT_INVALID_STATE" });
  assert.deepEqual(await coachCapture(id, { health_data: "granted" }), { ok: false, error: "CONSENT_INVALID_STATE" });
  assert.ok((await repo.execute(id, { action: "revoke", consentType: "marketing" }, actor)).ok);
  assert.equal((await detail(id)).optionalStates.marketing, "revoked");
});

test("PostgreSQL an optional link issued while active is refused once the subscription completes", async () => {
  const id = await subscription("active"); const link = await request(id, ["health_data"]);
  await db.update(subscriptions).set({ status: "completed" }).where(eq(subscriptions.id, id));
  assert.deepEqual(await repo.publicAccess(link.token, { health_data: "granted" }, anonymous), { ok: false, error: "CONSENT_INVALID_STATE" }); assert.equal((await rows(id)).length, 0);
});

test("PostgreSQL required link and capture stay onboarding-only on an active subscription (D5)", async () => {
  const id = await subscription("active");
  assert.deepEqual(await repo.execute(id, { action: "issue", expiresAt: new Date(Date.now() + 3600000) }, actor), { ok: false, error: "CONSENT_INVALID_STATE" });
  const expectedDefinitionIds = latestDefinitions((await detail(id)).definitions).filter(d => d.consentType === "service_terms" || d.consentType === "privacy_notice").map(d => d.id);
  assert.deepEqual(await repo.execute(id, { action: "capture", decisions: { service_terms: "granted", privacy_notice: "granted" }, expectedDefinitionIds }, actor), { ok: false, error: "CONSENT_INVALID_STATE" });
  assert.equal((await rows(id)).length, 0);
});

test("PostgreSQL coach-assisted optional capture records provenance and rejects a stale displayed version (D4)", async () => {
  const id = await subscription("onboarding");
  assert.ok((await coachCapture(id, { health_data: "granted", publication: "refused" })).ok);
  assert.ok((await rows(id)).every(r => r.capturedVia === "coach_assisted" && r.capturedByUserId === userId && r.secureAccessTokenId === null));
  assert.deepEqual(await repo.execute(id, { action: "capture_optional", decisions: { health_data: "granted" }, expectedDefinitionIds: [randomUUID()] }, actor), { ok: false, error: "CONSENT_DEFINITIONS_CHANGED" });
  assert.deepEqual(await repo.execute(id, { action: "capture_optional", decisions: { service_terms: "granted" }, expectedDefinitionIds: [randomUUID()] }, actor), { ok: false, error: "CONSENT_TYPE_NOT_REQUESTED" });
});

test("PostgreSQL new optional version: impact counted, grant needs renewal, measurement refused until re-consent, old link stale (D3, D6, D7)", async () => {
  const id = await subscription("active"); assert.ok((await coachCapture(id, { health_data: "granted" })).ok); assert.equal(await canRecord(id), true);
  const link = await request(id, ["health_data", "marketing"]);
  const next = await draft("health_data");
  const impact = await repo.definitions({ action: "definition_impact", definitionId: next.id }, actor); assert.ok(impact.ok && "activeSubscriptionsAffected" in impact.body);
  const before = impact.ok && "activeSubscriptionsAffected" in impact.body ? impact.body.activeSubscriptionsAffected : -1;
  const other = await subscription("paused"); assert.ok((await coachCapture(other, { health_data: "granted" })).ok);
  assert.deepEqual(await repo.definitions({ action: "definition_impact", definitionId: next.id }, actor), { ok: true, body: { type: "health_data", activeSubscriptionsAffected: before + 1 } });
  assert.ok(before >= 1);
  assert.ok((await repo.definitions({ action: "definition_publish", definitionId: next.id }, actor)).ok);
  assert.equal((await detail(id)).optionalStates.health_data, "renewal_required"); assert.equal(await canRecord(id), false);
  assert.equal((await detail(id)).links.find(l => l.id === link.link.id)?.state, "stale");
  assert.deepEqual(await repo.publicAccess(link.token, { health_data: "granted", marketing: "granted" }, anonymous), { ok: false, error: "CONSENT_LINK_STALE" });
  assert.ok((await coachCapture(id, { health_data: "granted" })).ok);
  assert.equal((await detail(id)).optionalStates.health_data, "granted"); assert.equal(await canRecord(id), true);
  const published = (await audits(next.id)).find(e => e.eventType === "consent.definition_published");
  assert.equal((published?.metadataJson as { activeSubscriptionsAffected?: number } | null)?.activeSubscriptionsAffected, before + 1);
});

test("PostgreSQL definition drafts: create, edit, delete; published rows refuse edit and delete; hash matches published wording (D7)", async () => {
  const created = await draft("publication", "first");
  const edited = await repo.definitions({ action: "definition_update", definitionId: created.id, content: contentOf("publication", "edited") }, actor);
  assert.ok(edited.ok && "definition" in edited.body); if (!edited.ok || !("definition" in edited.body)) return;
  assert.equal(edited.body.definition.content, contentOf("publication", "edited")); assert.equal(edited.body.definition.version, created.version); assert.equal(edited.body.definition.status, "draft");
  const published = await repo.definitions({ action: "definition_publish", definitionId: created.id }, actor); assert.ok(published.ok && "definition" in published.body);
  if (!published.ok || !("definition" in published.body)) return;
  assert.equal(published.body.definition.contentHash, createHash("sha256").update(contentOf("publication", "edited")).digest("hex")); assert.ok(published.body.definition.publishedAt);
  for (const command of [{ action: "definition_update", definitionId: created.id, title: "Changed" }, { action: "definition_delete", definitionId: created.id }, { action: "definition_publish", definitionId: created.id }] as const)
    assert.deepEqual(await repo.definitions(command, actor), { ok: false, error: "CONSENT_DEFINITION_IMMUTABLE" });
  const throwaway = await draft("publication");
  assert.deepEqual(await repo.definitions({ action: "definition_delete", definitionId: throwaway.id }, actor), { ok: true, body: { deleted: true } });
  assert.deepEqual(await repo.definitions({ action: "definition_read", definitionId: throwaway.id }, actor), { ok: false, error: "CONSENT_NOT_FOUND" });
  const list = await repo.definitions({ action: "definitions_list" }, actor); assert.ok(list.ok && "definitions" in list.body);
  if (list.ok && "definitions" in list.body) {
    const publication = list.body.definitions.find(group => group.consentType === "publication");
    assert.equal(publication?.versions[0]?.id, created.id); assert.ok(publication?.versions.every(v => !("content" in v)));
    assert.deepEqual(list.body.definitions.map(group => group.consentType), [...consentTypes]);
  }
});

test("PostgreSQL concurrent draft creation yields distinct consecutive version numbers", async () => {
  const drafts = await Promise.all([draft("marketing"), draft("marketing"), draft("marketing")]);
  const versions = drafts.map(d => BigInt(d.version)).sort((a, b) => a < b ? -1 : 1);
  assert.equal(versions[1]! - versions[0]!, 1n); assert.equal(versions[2]! - versions[1]!, 1n);
  for (const created of drafts) assert.ok((await repo.definitions({ action: "definition_delete", definitionId: created.id }, actor)).ok);
});

test("PostgreSQL consent text and request audits carry type, version, ids and counts, never wording or PII", async () => {
  const id = await subscription("active"); const link = await request(id, ["publication"]); await repo.publicAccess(link.token, { publication: "granted" }, anonymous);
  const events = await db.select().from(auditEvents).where(or(inArray(auditEvents.entityId, [...definitionIds, ...subscriptionIds]), eq(auditEvents.actorUserId, userId)));
  assert.ok(events.some(e => e.eventType === "consent.definition_draft_saved") && events.some(e => e.eventType === "consent.definition_published") && events.some(e => e.eventType === "consent.definition_draft_deleted"));
  const serialized = JSON.stringify(events.map(e => e.metadataJson));
  for (const forbidden of ["SYNTHETIC CONS-02 WORDING", "Synthetic Optional Consent Customer", "192.0.2.45", "@example.invalid", link.token]) assert.ok(!serialized.includes(forbidden), forbidden);
});

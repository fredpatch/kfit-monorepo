import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { consentTypes, requiredConsentTypes, type ConsentDecisions, type ConsentDetail, type ConsentType } from "@kfit/shared";
import { latestDefinitions } from "../services/consent.service.js";
import { db, pool } from "../../../db/client.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { services } from "../../../db/schema/catalogue.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { consentDefinitions, consentRecords, onboardingItems } from "../../../db/schema/onboarding.js";
import { secureAccessTokens, externalAccessEvents } from "../../../db/schema/documents.js";
import { DrizzleConsentRepository, lockConsentDefinitions, readConsentEvidence } from "../repositories/consent.repository.js";
import { DrizzleOnboardingRepository } from "../../onboarding/repositories/onboarding.repository.js";
import { hashConsentToken } from "../services/consent-token.crypto.js";
const userId = randomUUID(), customerId = randomUUID(), serviceId = randomUUID();
const subscriptionIds: string[] = [], definitionIds: string[] = [];
const options = { auditHashPepper: "synthetic-consent-test-pepper-32-characters-minimum" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.44", userAgent: "synthetic-consent-integration" };
const anonymous = { ...actor, userId: null };
const repo = new DrizzleConsentRepository(db, options);
const onboarding = new DrizzleOnboardingRepository(db, options);
const granted: ConsentDecisions = { service_terms: "granted", privacy_notice: "granted" };
let safeTarget = false;
async function publish(type: ConsentType) {
  const rows = await db.select().from(consentDefinitions).where(eq(consentDefinitions.consentType, type));
  const version = (rows.reduce((max, row) => BigInt(row.version) > max ? BigInt(row.version) : max, 0n) + 1n).toString();
  const result = await repo.saveDefinition({ consentType: type, version, title: `SYNTHETIC TEST ${type}`, content: `SYNTHETIC TEST ONLY. Not legal wording. ${type} version ${version}.`, publish: true });
  assert.ok(result.ok); if (!result.ok) throw new Error("expected synthetic definition"); definitionIds.push(result.definition.id); return result.definition;
}
before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev", "consent integration requires disposable local PostgreSQL"); safeTarget = true;
  await db.insert(users).values({ id: userId, email: `consent-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Consent Customer", whatsapp: `+241${String(BigInt("0x" + customerId.replaceAll("-", "").slice(0,12)) % 1000000000000n).padStart(12,"0")}` });
  await db.insert(services).values({ id: serviceId, name: "Synthetic Consent Service", slug: `consent-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  for (const type of consentTypes) await publish(type);
});
after(async () => {
  try {
    if (!safeTarget) return;
    if (subscriptionIds.length) {
      const tokens = await db.select().from(secureAccessTokens).where(inArray(secureAccessTokens.resourceId, subscriptionIds));
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, subscriptionIds));
      await db.delete(consentRecords).where(inArray(consentRecords.subscriptionId, subscriptionIds));
      await db.delete(onboardingItems).where(inArray(onboardingItems.subscriptionId, subscriptionIds));
      if (tokens.length) { await db.delete(externalAccessEvents).where(inArray(externalAccessEvents.secureAccessTokenId, tokens.map(t => t.id))); await db.delete(secureAccessTokens).where(inArray(secureAccessTokens.id, tokens.map(t => t.id))); }
      await db.delete(subscriptions).where(inArray(subscriptions.id, subscriptionIds));
    }
    // Unknown-token events have no token FK; select only this fixture's hashed UA.
    const { hashAuditContext } = await import("../../auth/services/audit.service.js");
    await db.delete(externalAccessEvents).where(eq(externalAccessEvents.userAgentHash, hashAuditContext(actor.userAgent, options.auditHashPepper)!));
    if (definitionIds.length) await db.delete(consentDefinitions).where(inArray(consentDefinitions.id, definitionIds));
    await db.delete(services).where(eq(services.id, serviceId)); await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});
async function subscription() {
  const id = randomUUID(); subscriptionIds.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-CONSENT-${id}`, customerId, serviceId, status: "onboarding", agreedPriceXaf: 50000, currency: "XAF", plannedStartDate: new Date(Date.now() + 86400000), createdByUserId: userId });
  assert.equal((await onboarding.execute(id, { action: "initialize" }, actor)).status, "ok"); return id;
}
async function detail(id: string): Promise<ConsentDetail> {
  const result = await repo.execute(id, { action: "read" }, actor); assert.ok(result.ok);
  if (!result.ok || !("consents" in result.body)) throw new Error("expected consent detail"); return result.body.consents;
}
async function capture(id: string, decisions = granted) {
  const expectedDefinitionIds = latestDefinitions((await detail(id)).definitions).filter(d => requiredConsentTypes.some(type => type === d.consentType)).map(d => d.id);
  const result = await repo.execute(id, { action: "capture", decisions, expectedDefinitionIds }, actor); assert.ok(result.ok); return detail(id);
}
async function issue(id: string) {
  const result = await repo.execute(id, { action: "issue", expiresAt: new Date(Date.now() + 3600000) }, actor); assert.ok(result.ok);
  if (!result.ok || !("token" in result.body)) throw new Error("expected consent link"); return result.body;
}
async function termsItem(id: string) { return (await db.select().from(onboardingItems).where(and(eq(onboardingItems.subscriptionId, id), eq(onboardingItems.itemType, "service_terms"))))[0]!; }
async function events(id: string) { return db.select().from(auditEvents).where(eq(auditEvents.entityId, id)); }
async function rows(id: string) { return db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, id)); }
// Only fixture for later optional workflows; no optional capture HTTP workflow is activated.
async function optionalFixture(id: string, type: ConsentType, decision: "granted" | "refused") {
  await db.transaction(async tx => {
    await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for("update");
    const evidence = await readConsentEvidence(tx, id); const prior = evidence.current?.find(r => r.consentType === type);
    const definition = evidence.definitions.filter(d => d.consentType === type).sort((a,b) => BigInt(a.version) > BigInt(b.version) ? -1 : 1)[0]!;
    await tx.insert(consentRecords).values({ customerId, subscriptionId: id, consentDefinitionId: definition.id, decision, capturedVia: "coach_assisted", capturedByUserId: userId, supersedesConsentRecordId: prior?.id ?? null });
  });
}
test("PostgreSQL enforces unique definition type/version", async () => {
  const original = (await db.select().from(consentDefinitions).where(eq(consentDefinitions.id, definitionIds[0]!)))[0]!;
  await assert.rejects(db.insert(consentDefinitions).values({ ...original, id: randomUUID() }), error => error instanceof Error && !!error.cause && typeof error.cause === "object" && "code" in error.cause && error.cause.code === "23505");
});
test("PostgreSQL-backed definition store rejects published edits and preserves exact wording/hash", async () => {
  const original = (await db.select().from(consentDefinitions).where(eq(consentDefinitions.id, definitionIds[0]!)))[0]!;
  assert.deepEqual(await repo.saveDefinition({ id: original.id, consentType: "service_terms", version: original.version, title: "Replacement", content: "Changed", publish: true }), { ok: false, error: "CONSENT_DEFINITION_IMMUTABLE" });
  assert.deepEqual((await db.select().from(consentDefinitions).where(eq(consentDefinitions.id, original.id)))[0], original);
});
test("PostgreSQL draft can be revised then published once; lower versions cannot be published", async () => {
  const draft = await repo.saveDefinition({ consentType: "marketing", version: "1000000", title: "Synthetic draft", content: "Synthetic draft wording", publish: false });
  assert.ok(draft.ok); if (!draft.ok) throw new Error("expected draft"); definitionIds.push(draft.definition.id);
  assert.ok((await repo.saveDefinition({ id: draft.definition.id, consentType: "marketing", version: "1000000", title: "Synthetic final", content: "Synthetic final wording", publish: true })).ok);
  assert.deepEqual(await repo.saveDefinition({ consentType: "marketing", version: "999999", title: "Synthetic lower", content: "Synthetic lower wording", publish: true }), { ok: false, error: "CONSENT_VERSION_CONFLICT" });
});
test("PostgreSQL grant/refuse decisions append a supersession chain without mutating earlier evidence", async () => {
  const id = await subscription(); await capture(id); const original = await rows(id);
  await capture(id, { service_terms: "refused", privacy_notice: "refused" });
  const view = await detail(id); assert.equal(view.history.length, 4); assert.equal(view.current.length, 2); assert.ok(view.current.every(r => r.decision === "refused" && r.supersedesConsentRecordId));
  const after = await rows(id); for (const row of original) assert.deepEqual(after.find(r => r.id === row.id), row);
});
test("PostgreSQL concurrent coach writers serialize into unambiguous current heads", async () => {
  const id = await subscription(); await Promise.all([capture(id), capture(id, { service_terms: "refused", privacy_notice: "refused" })]);
  const view = await detail(id); assert.equal(view.history.length, 4); assert.equal(view.current.length, 2);
  assert.equal(new Set(view.current.map(r => r.decision)).size, 1); assert.equal(view.history.filter(r => r.supersedesConsentRecordId).length, 2);
});
test("PostgreSQL service_terms grant alone does not complete the required bundle", async () => {
  const id = await subscription(); const view = await capture(id, { service_terms: "granted", privacy_notice: "refused" }); assert.equal(view.requiredBundle.satisfied, false); assert.equal((await termsItem(id)).status, "pending");
});
test("PostgreSQL privacy grant alone does not complete the required bundle", async () => {
  const id = await subscription(); await capture(id, { service_terms: "refused", privacy_notice: "granted" }); assert.equal((await termsItem(id)).status, "pending");
});
test("PostgreSQL both latest grants complete service_terms once, including repeated coach evidence", async () => {
  const id = await subscription(); assert.equal((await capture(id)).requiredBundle.satisfied, true); const first = await termsItem(id); await capture(id);
  assert.equal(first.status, "completed"); assert.equal((await termsItem(id)).completedAt?.toISOString(), first.completedAt?.toISOString());
  assert.equal((await events(id)).filter(e => e.eventType === "subscription.onboarding_item_completed" && (e.metadataJson as { itemType?: string })?.itemType === "service_terms").length, 1);
});
test("PostgreSQL later refusal reopens the terms blocker without changing prior grants", async () => {
  const id = await subscription(); await capture(id); const first = await rows(id); await capture(id, { service_terms: "granted", privacy_notice: "refused" });
  assert.equal((await termsItem(id)).status, "pending"); assert.equal((await termsItem(id)).completedAt, null); assert.equal((await rows(id)).filter(r => first.some(p => p.id === r.id) && r.decision === "granted").length, 2);
});
test("PostgreSQL optional decisions and append-only revocation never satisfy required acceptance", async () => {
  const id = await subscription(); await optionalFixture(id, "marketing", "granted"); await optionalFixture(id, "marketing", "refused"); await optionalFixture(id, "marketing", "granted");
  const originals = await rows(id); assert.ok((await repo.execute(id, { action: "revoke", consentType: "marketing" }, actor)).ok);
  const view = await detail(id); assert.equal(view.history.length, 4); assert.equal(view.current[0]?.decision, "revoked"); assert.equal(view.requiredBundle.satisfied, false); assert.equal((await termsItem(id)).status, "pending");
  for (const row of originals) assert.deepEqual((await rows(id)).find(r => r.id === row.id), row);
});
test("PostgreSQL coach capture stores the acting user and explicit capture provenance", async () => {
  const id = await subscription(); await capture(id); const records = await rows(id); assert.ok(records.every(r => r.capturedByUserId === userId && r.capturedVia === "coach_assisted" && r.secureAccessTokenId === null));
});
test("PostgreSQL stores only the bearer hash and exact definition context", async () => {
  const id = await subscription(); const link = await issue(id); const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id));
  assert.equal(token?.tokenHash, hashConsentToken(link.token)); assert.ok(!JSON.stringify(token).includes(link.token)); assert.equal(token?.action, "onboarding_consent"); assert.equal(token?.resourceId, id);
  assert.ok(!JSON.stringify(await events(id)).includes(link.token));
});
test("PostgreSQL public GET returns exact safe text without consuming token or exposing customer PII", async () => {
  const id = await subscription(); const link = await issue(id); const response = await repo.publicAccess(link.token, null, anonymous); assert.ok(response.ok);
  if (!response.ok || !("document" in response.body)) throw new Error("expected public document");
  assert.equal(response.body.document.definitions.length, 2); assert.ok(response.body.document.definitions.every(d => d.content.startsWith("SYNTHETIC TEST ONLY")));
  assert.deepEqual(Object.keys(response.body.document).sort(), ["definitions", "subscriptionReference"]);
  const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id)); assert.equal(token?.usedAt, null); assert.equal(token?.useCount, 0); assert.equal((await rows(id)).length, 0);
});
for (const kind of ["expired", "revoked"] as const) test(`PostgreSQL ${kind} token rejects with zero business writes and records failed access`, async () => {
  const id = await subscription(); const link = await issue(id);
  if (kind === "expired") await db.update(secureAccessTokens).set({ expiresAt: new Date(0) }).where(eq(secureAccessTokens.id, link.link.id));
  else assert.ok((await repo.execute(id, { action: "revoke_link", tokenId: link.link.id }, actor)).ok);
  const before = await events(id); const item = await termsItem(id);
  assert.deepEqual(await repo.publicAccess(link.token, granted, anonymous), { ok: false, error: kind === "expired" ? "CONSENT_LINK_EXPIRED" : "CONSENT_LINK_REVOKED" });
  assert.equal((await rows(id)).length, 0); assert.deepEqual(await termsItem(id), item); assert.deepEqual(await events(id), before);
  const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id)); assert.equal(token?.useCount, 0);
  assert.equal((await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.secureAccessTokenId, link.link.id))).length, 1);
});
test("PostgreSQL unknown token records a failed access without consent or token writes", async () => {
  const response = await repo.publicAccess("unknown-token", granted, anonymous); assert.deepEqual(response, { ok: false, error: "CONSENT_LINK_INVALID" });
  const events = await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.result, "CONSENT_LINK_INVALID")); assert.ok(events.some(e => e.secureAccessTokenId === null && e.ipHash && e.userAgentHash));
});
test("PostgreSQL malformed public submission writes only a sanitized failed-use event", async () => {
  const id = await subscription(); const link = await issue(id); const audits = await events(id);
  assert.deepEqual(await repo.publicAccess(link.token, null, anonymous, "CONSENT_INVALID_INPUT"), { ok: false, error: "CONSENT_INVALID_INPUT" });
  assert.equal((await rows(id)).length, 0); assert.deepEqual(await events(id), audits); assert.equal((await termsItem(id)).status, "pending");
  const access = await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.secureAccessTokenId, link.link.id));
  assert.equal(access[0]?.result, "CONSENT_INVALID_INPUT"); assert.equal(access[0]?.eventType, "consent.submit");
});
test("PostgreSQL token expiry during a definition-lock wait rejects as expired without business writes", async () => {
  const id = await subscription(); const link = await issue(id); const deadline = new Date(Date.now() + 2000);
  await db.update(secureAccessTokens).set({ expiresAt: deadline }).where(eq(secureAccessTokens.id, link.link.id));
  let release = () => {}; let acquired = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { acquired = resolve; });
  const blocker = db.transaction(async tx => { await lockConsentDefinitions(tx); acquired(); await held; });
  await ready;
  const pending = repo.publicAccess(link.token, granted, anonymous);
  try {
    let waiting = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = await pool.query("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event = 'advisory' AND query LIKE '%kfit:consent-definitions%'");
      if (state.rows[0]?.waiting > 0) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(waiting, true, "public access reached the held definition lock while token was valid");
    await pool.query("SELECT pg_sleep(GREATEST(0, $1::double precision))", [(deadline.getTime() - Date.now() + 50) / 1000]);
  } finally { release(); await blocker; }
  assert.deepEqual(await pending, { ok: false, error: "CONSENT_LINK_EXPIRED" });
  assert.equal((await rows(id)).length, 0); assert.equal((await termsItem(id)).status, "pending");
});
test("PostgreSQL public POST atomically captures grants, completes checklist, audits and consumes token", async () => {
  const id = await subscription(); const link = await issue(id); assert.deepEqual(await repo.publicAccess(link.token, granted, anonymous), { ok: true, body: { accepted: true } });
  assert.equal((await termsItem(id)).status, "completed"); assert.ok((await rows(id)).every(r => r.capturedVia === "public_link" && r.capturedByUserId === null && r.secureAccessTokenId === link.link.id));
  const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id)); assert.ok(token?.usedAt); assert.equal(token?.useCount, 1);
  const access = await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.secureAccessTokenId, link.link.id)); assert.equal(access.length, 1); assert.equal(access[0]?.result, "success");
  assert.equal((await events(id)).filter(e => e.eventType === "consent.decision_recorded").length, 2);
});
test("PostgreSQL consumed link replay rejects without duplicate decisions, checklist completion or audits", async () => {
  const id = await subscription(); const link = await issue(id); await repo.publicAccess(link.token, granted, anonymous); const records = await rows(id); const audits = await events(id);
  assert.deepEqual(await repo.publicAccess(link.token, granted, anonymous), { ok: false, error: "CONSENT_LINK_CONSUMED" }); assert.deepEqual(await rows(id), records); assert.deepEqual(await events(id), audits);
});
function auditFailureRepository() {
  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, { get(target, key, receiver) {
    if (key === "transaction") return <T>(work: (tx: Transaction) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, { get(transaction, member, txReceiver) {
      if (member === "insert") return (table: Parameters<Transaction["insert"]>[0]) => {
        const insert = transaction.insert(table); if (table !== auditEvents) return insert;
        return new Proxy(insert, { get(builder, method, builderReceiver) { if (method === "values") return (value: Record<string, unknown>) => Reflect.apply(builder.values, builder, [{ ...value, actorUserId: randomUUID() }]); return Reflect.get(builder, method, builderReceiver); } });
      }; return Reflect.get(transaction, member, txReceiver);
    } })), config); return Reflect.get(target, key, receiver);
  } }); return new DrizzleConsentRepository(database, options);
}
test("PostgreSQL real audit FK failure rolls back consent, checklist completion and token consumption", async () => {
  const id = await subscription(); const link = await issue(id); const item = await termsItem(id); const audits = await events(id);
  await assert.rejects(auditFailureRepository().publicAccess(link.token, granted, anonymous), error => error instanceof Error && !!error.cause && typeof error.cause === "object" && "code" in error.cause && error.cause.code === "23503");
  assert.equal((await rows(id)).length, 0); assert.deepEqual(await termsItem(id), item); assert.deepEqual(await events(id), audits);
  const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id)); assert.equal(token?.usedAt, null); assert.equal(token?.useCount, 0);
});
test("PostgreSQL required revocation rejects, and optional revocation requires a current grant", async () => {
  const id = await subscription(); await capture(id);
  for (const type of ["service_terms", "privacy_notice"] as const) assert.deepEqual(await repo.execute(id, { action: "revoke", consentType: type }, actor), { ok: false, error: "CONSENT_REVOCATION_FORBIDDEN" });
  for (const type of ["health_data", "progress_photo_storage", "marketing", "publication"] as const) {
    assert.deepEqual(await repo.execute(id, { action: "revoke", consentType: type }, actor), { ok: false, error: "CONSENT_DECISION_MISSING" });
    await optionalFixture(id, type, "granted"); assert.ok((await repo.execute(id, { action: "revoke", consentType: type }, actor)).ok);
  }
  assert.equal((await termsItem(id)).status, "completed");
});
test("PostgreSQL concurrent public submissions produce one authoritative decision set", async () => {
  const id = await subscription(); const link = await issue(id);
  const results = await Promise.all([repo.publicAccess(link.token, granted, anonymous), repo.publicAccess(link.token, granted, anonymous)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "CONSENT_LINK_CONSUMED")); assert.equal((await rows(id)).length, 2);
});
test("PostgreSQL consent audits contain structural evidence and no PII, bearer or full wording", async () => {
  const id = await subscription(); const link = await issue(id); await repo.publicAccess(link.token, granted, anonymous);
  const serialized = JSON.stringify((await events(id)).map(e => e.metadataJson));
  for (const forbidden of [link.token, "Synthetic Consent Customer", "192.0.2.44", "SYNTHETIC TEST ONLY", "@example.invalid"]) assert.ok(!serialized.includes(forbidden));
  const decision = (await events(id)).find(e => e.eventType === "consent.decision_recorded"); assert.ok(decision?.metadataJson && typeof decision.metadataJson === "object" && "definitionVersion" in decision.metadataJson);
});
test("PostgreSQL new definition version preserves history, invalidates old links and blocks synthetic checklist completion", async () => {
  const id = await subscription(); await capture(id); const records = await rows(id); const link = await issue(id);
  const expectedDefinitionIds = latestDefinitions((await detail(id)).definitions).filter(d => requiredConsentTypes.some(type => type === d.consentType)).map(d => d.id);
  await publish("service_terms");
  assert.deepEqual(await repo.execute(id, { action: "capture", decisions: granted, expectedDefinitionIds }, actor), { ok: false, error: "CONSENT_DEFINITIONS_CHANGED" });
  assert.deepEqual(await rows(id), records); assert.equal((await detail(id)).requiredBundle.satisfied, false);
  assert.deepEqual(await repo.publicAccess(link.token, granted, anonymous), { ok: false, error: "CONSENT_LINK_STALE" });
  const read = await onboarding.execute(id, { action: "read" }, actor); assert.equal(read.status, "ok"); if (read.status === "ok") assert.equal(read.onboarding.items.find(i => i.itemType === "service_terms")?.status, "pending");
  assert.deepEqual(await onboarding.execute(id, { action: "ready" }, actor), { status: "blocked" });
  await capture(id); assert.equal((await detail(id)).requiredBundle.satisfied, true);
});

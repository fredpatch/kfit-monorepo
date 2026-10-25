import "dotenv/config";
import { assertLocalTestDatabase } from "../../../testing/integration-fixtures.js";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import type { QuoteDetail, QuoteDecision, QuoteSnapshot } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { users, auditEvents } from "../../../db/schema/auth.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { services } from "../../../db/schema/catalogue.js";
import { prospects, serviceRequests } from "../../../db/schema/prospects.js";
import { quotes, quoteVersions, businessDocumentCounters, paymentPlans, installments, paymentEvents, paymentAllocations } from "../../../db/schema/finance.js";
import { documents, documentVersions, secureAccessTokens, externalAccessEvents } from "../../../db/schema/documents.js";
import { DrizzleDocumentsRepository } from "../../documents/repositories/documents.repository.js";
import { DrizzleQuotesRepository } from "../repositories/quotes.repository.js";
import { QuotesService, type QuoteAction, type QuoteActor, type QuoteArtifacts, type QuoteResult } from "../services/quotes.service.js";
import { hashDocumentBearer } from "../../documents/services/document-token.crypto.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";
import { FinanceService } from "../../finance/services/finance.service.js";

const userId = randomUUID(), customerId = randomUUID(), serviceId = randomUUID(), subIds: string[] = [], artifactIds: string[] = [], publicTokenIds: string[] = [];
const prospectId = randomUUID(), requestIds: string[] = [];
const year = 8000 + Math.floor(Math.random() * 1000), now = new Date(`${year}-10-22T12:00:00Z`);
const at = (offset: number) => new Date(now.getTime() + offset), options = { auditHashPepper: "synthetic-quote-audit-pepper", tokenPepper: "synthetic-quote-token-pepper" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.62", userAgent: "synthetic-quote-tests" }, visitor = { ...actor, userId: null };
const files = new Map<string, Buffer>(), rendered: QuoteSnapshot[] = [];
let safe = false, counterExisted = false;
const artifacts: QuoteArtifacts = {
  async render(snapshot) { rendered.push(structuredClone(snapshot)); return Buffer.from("%PDF-synthetic-snapshot\n" + JSON.stringify(snapshot)); },
  async persist(input) { const key = randomUUID() + ".pdf"; files.set(key, input.bytes); return { storageKey: key, originalFilename: input.originalFilename, mimeType: "application/pdf", sizeBytes: input.bytes.length, sha256: createHash("sha256").update(input.bytes).digest("hex") }; },
  async read(key) { const bytes = files.get(key); assert.ok(bytes); return bytes; }, async remove(key) { files.delete(key); },
};
const repoAt = (clock = () => new Date(now), port = artifacts) => new DrizzleQuotesRepository(db, options, port, clock);
const repo = repoAt(), service = new QuotesService(repo);
const draft = (amountXaf = 15000) => ({ amountXaf, validUntil: at(86400000).toISOString(), terms: "Conditions synthétiques explicites\nAucune clause inventée." });
const call = (id: string, action: QuoteAction, body: unknown = {}, caller: QuoteActor = actor, repository = repo) => new QuotesService(repository).execute(id, action, body, caller);
const failure = (error: string) => ({ ok: false, error });
function quote(result: QuoteResult): QuoteDetail { assert.ok(result.ok, JSON.stringify(result)); if (!result.ok || !("body" in result) || !("quote" in result.body)) throw new Error("Missing quote detail"); return result.body.quote; }
const current = (q: QuoteDetail) => { const v = q.versions.find(v => v.id === q.currentVersionId); assert.ok(v); return v; };
before(async () => {
  assertLocalTestDatabase(); safe = true;
  counterExisted = (await db.select().from(businessDocumentCounters).where(and(eq(businessDocumentCounters.documentType, "quote"), eq(businessDocumentCounters.year, year)))).length > 0;
  await db.insert(users).values({ id: userId, email: `quote-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Quote Customer", whatsapp: "+241000006262" });
  await db.insert(services).values({ id: serviceId, name: "Synthetic Quote Service", slug: `quote-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  await db.insert(prospects).values({ id: prospectId, fullName: "Synthetic Quote Prospect", whatsapp: "+241000006263" });
});
after(async () => {
  try {
    if (!safe) return;
    const qs = subIds.length ? await db.select().from(quotes).where(inArray(quotes.subscriptionId, subIds)) : [];
    const vs = qs.length ? await db.select().from(quoteVersions).where(inArray(quoteVersions.quoteId, qs.map(q => q.id))) : [];
    const docIds = [...new Set([...artifactIds, ...vs.flatMap(v => v.pdfDocumentId ? [v.pdfDocumentId] : [])])];
    const tokens = vs.length ? await db.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.resourceType, "quote_version"), inArray(secureAccessTokens.resourceId, vs.map(v => v.id)))) : [];
    const tokenIds = [...new Set([...publicTokenIds, ...tokens.map(t => t.id)])];
    if (tokenIds.length) { await db.delete(externalAccessEvents).where(inArray(externalAccessEvents.secureAccessTokenId, tokenIds)); await db.delete(secureAccessTokens).where(inArray(secureAccessTokens.id, tokenIds)); }
    await db.delete(externalAccessEvents).where(eq(externalAccessEvents.userAgentHash, createHashForContext(actor.userAgent)));
    if (subIds.length) await db.update(subscriptions).set({ acceptedQuoteVersionId: null }).where(inArray(subscriptions.id, subIds));
    if (qs.length) await db.update(quotes).set({ currentVersionId: null }).where(inArray(quotes.id, qs.map(q => q.id)));
    if (vs.length) await db.delete(quoteVersions).where(inArray(quoteVersions.id, vs.map(v => v.id)));
    if (qs.length) await db.delete(quotes).where(inArray(quotes.id, qs.map(q => q.id)));
    if (docIds.length) { await db.delete(documentVersions).where(inArray(documentVersions.documentId, docIds)); await db.delete(documents).where(inArray(documents.id, docIds)); }
    if (subIds.length) {
      const events = await db.selectDistinct({ id: paymentAllocations.paymentEventId }).from(paymentAllocations).where(inArray(paymentAllocations.subscriptionId, subIds));
      await db.delete(paymentAllocations).where(inArray(paymentAllocations.subscriptionId, subIds));
      if (events.length) await db.delete(paymentEvents).where(inArray(paymentEvents.id, events.map(e => e.id)));
      const plans = await db.select().from(paymentPlans).where(inArray(paymentPlans.subscriptionId, subIds));
      if (plans.length) await db.delete(installments).where(inArray(installments.paymentPlanId, plans.map(p => p.id)));
      await db.delete(paymentPlans).where(inArray(paymentPlans.subscriptionId, subIds)); await db.delete(subscriptions).where(inArray(subscriptions.id, subIds));
    }
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    if (qs.length) await db.delete(auditEvents).where(inArray(auditEvents.entityId, qs.map(q => q.id)));
    if (requestIds.length) await db.delete(serviceRequests).where(inArray(serviceRequests.id, requestIds));
    await db.delete(prospects).where(eq(prospects.id, prospectId));
    await db.delete(services).where(eq(services.id, serviceId)); await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(users).where(eq(users.id, userId));
    if (!counterExisted) await db.delete(businessDocumentCounters).where(and(eq(businessDocumentCounters.documentType, "quote"), eq(businessDocumentCounters.year, year)));
  } finally { await pool.end(); }
});
import { createHmac } from "node:crypto";
const createHashForContext = (value: string) => createHmac("sha256", options.auditHashPepper).update(value).digest("hex");
async function owner(amount = 10000) {
  const id = randomUUID(); subIds.push(id); await db.insert(subscriptions).values({ id, reference: `SUB-QUOTE-${id}`, customerId, serviceId, status: "onboarding", agreedPriceXaf: amount, durationValueSnapshot: 12, durationUnitSnapshot: "week", createdByUserId: userId }); return id;
}
async function create(amount = 15000, subscriptionId?: string) { const sub = subscriptionId ?? await owner(); return quote(await call(sub, "create", draft(amount))); }
async function issue(q?: QuoteDetail) { const item = q ?? await create(); return quote(await call(item.versions.at(-1)!.id, "issue")); }
async function share(q?: QuoteDetail) {
  const item = q ?? await issue(), result = await call(current(item).id, "share", { expiresAt: at(3600000).toISOString() });
  assert.ok(result.ok && "body" in result && "share" in result.body && result.body.share); if (!result.ok || !("body" in result) || !("share" in result.body) || !result.body.share) throw new Error("Missing bearer");
  return { q: item, ...result.body.share };
}
async function accept(q?: QuoteDetail, decision: QuoteDecision = "accepted") { const link = await share(q); const result = await call(link.token, "respond", { decision }, visitor); assert.ok(result.ok, JSON.stringify(result)); return { ...link, q: quote(await call(link.q.id, "read")) }; }
const sub = async (id: string) => (await db.select().from(subscriptions).where(eq(subscriptions.id, id)))[0]!;
const counter = async () => (await db.select().from(businessDocumentCounters).where(and(eq(businessDocumentCounters.documentType, "quote"), eq(businessDocumentCounters.year, year))))[0]?.lastValue ?? 0;
function auditFailureRepository() {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, { get(target, key, receiver) {
    if (key === "transaction") return <T>(work: (tx: Tx) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, { get(transaction, member, txReceiver) {
      if (member === "insert") return (table: Parameters<Tx["insert"]>[0]) => {
        const insert = transaction.insert(table); if (table !== auditEvents) return insert;
        return new Proxy(insert, { get(builder, method, builderReceiver) { if (method === "values") return (value: Record<string, unknown>) => Reflect.apply(builder.values, builder, [{ ...value, actorUserId: randomUUID() }]); return Reflect.get(builder, method, builderReceiver); } });
      }; return Reflect.get(transaction, member, txReceiver);
    } })), config); return Reflect.get(target, key, receiver);
  } }); return new DrizzleQuotesRepository(database, options, artifacts, () => new Date(now));
}

test("PostgreSQL draft derives ownership/request, has no official number and creates no new customer/subscription", async () => {
  const id = await owner(), before = await sub(id), q = await create(15000, id); assert.equal(q.customerId, customerId); assert.equal(q.subscriptionId, id); assert.equal(q.requestId, before.sourceRequestId); assert.equal(q.quoteNumber, null); assert.equal(current(q).issuedAt, null); assert.equal(current(q).pdfDocumentId, null); assert.deepEqual(await sub(id), before);
});
test("PostgreSQL quote preserves the non-null converted request reference without changing request", async () => {
  const id = await owner(), requestId = randomUUID(); requestIds.push(requestId);
  await db.insert(serviceRequests).values({ id: requestId, reference: `REQ-QUOTE-${requestId}`, submissionToken: randomUUID(), prospectId, serviceId, status: "converted", convertedSubscriptionId: id });
  await db.update(subscriptions).set({ sourceRequestId: requestId }).where(eq(subscriptions.id, id));
  const before = await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)), q = await create(15000, id);
  assert.equal(q.requestId, requestId); assert.deepEqual(await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)), before);
});
test("PostgreSQL concurrent issuance of the same draft allocates exactly one number, PDF and audit", async () => {
  const q = await create(), count = await counter(), renders = rendered.length;
  const results = await Promise.all([call(current(q).id, "issue"), call(current(q).id, "issue")]); assert.ok(results.every(r => r.ok));
  const fresh = quote(await call(q.id, "read")); assert.match(fresh.quoteNumber!, new RegExp(`^DEV-${year}-\\d{4,}$`)); assert.equal(await counter(), count + 1); assert.equal(rendered.length, renders + 1);
  assert.equal((await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, q.id), eq(auditEvents.eventType, "quote.version_issued")))).length, 1);
});
test("PostgreSQL different quotes issue unique consecutive annual references under concurrency", async () => {
  const a = await create(), b = await create(), count = await counter();
  const results = await Promise.all([call(current(a).id, "issue"), call(current(b).id, "issue")]); const numbers = results.map(r => quote(r).quoteNumber!);
  assert.equal(new Set(numbers).size, 2); assert.equal(await counter(), count + 2);
});
test("PostgreSQL draft edit is explicit; issued amount/terms/validity/snapshot/PDF cannot edit", async () => {
  let q = await create(); q = quote(await call(current(q).id, "edit", { ...draft(17000), terms: "Conditions révisées" })); assert.equal(current(q).amountXaf, 17000);
  q = await issue(q); const before = await db.select().from(quoteVersions).where(eq(quoteVersions.id, current(q).id)); assert.deepEqual(await call(current(q).id, "edit", draft(500)), failure("QUOTE_VERSION_IMMUTABLE")); assert.deepEqual(await db.select().from(quoteVersions).where(eq(quoteVersions.id, current(q).id)), before);
});
test("PostgreSQL V2 preserves V1 and the quote number; no duplicate concurrent draft", async () => {
  const q = await issue(), v1 = await db.select().from(quoteVersions).where(eq(quoteVersions.id, current(q).id));
  const results = await Promise.all([call(q.id, "version", draft(19000)), call(q.id, "version", draft(19000))]); assert.equal(results.filter(r => r.ok).length, 1);
  const fresh = quote(results.find(r => r.ok)!); const v2 = fresh.versions.at(-1)!; assert.equal(v2.versionNumber, 2); const issued = quote(await call(v2.id, "issue")); assert.equal(issued.quoteNumber, q.quoteNumber); assert.deepEqual(await db.select().from(quoteVersions).where(eq(quoteVersions.id, current(q).id)), v1);
});
test("PostgreSQL historical PDF uses immutable snapshots after profile/catalogue and subscription changes", async () => {
  const q = await issue(), v = current(q), before = await call(v.id, "pdf"); assert.ok(before.ok && "binary" in before);
  await db.update(customers).set({ fullName: "Synthetic Renamed Customer" }).where(eq(customers.id, customerId)); await db.update(services).set({ name: "Synthetic Renamed Service" }).where(eq(services.id, serviceId));
  await db.update(subscriptions).set({ agreedPriceXaf: 20000 }).where(eq(subscriptions.id, q.subscriptionId));
  const fresh = quote(await call(q.id, "read")), afterPdf = await call(v.id, "pdf"); assert.deepEqual(fresh.versions[0]?.snapshot, v.snapshot); assert.deepEqual(afterPdf, before);
  await db.update(customers).set({ fullName: "Synthetic Quote Customer" }).where(eq(customers.id, customerId)); await db.update(services).set({ name: "Synthetic Quote Service" }).where(eq(services.id, serviceId));
});
test("PostgreSQL secure quote bearer stored hash-only; GET/PDF do not accept or consume", async () => {
  const link = await share(), [stored] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.tokenId)); assert.ok(stored); assert.notEqual(stored.tokenHash, link.token); assert.equal(stored.tokenHash, hashDocumentBearer(link.token, options.tokenPepper)); assert.equal(stored.resourceId, current(link.q).id); assert.equal(stored.action, "quote_response"); assert.ok(!JSON.stringify(stored).includes(link.token));
  const before = await sub(link.q.subscriptionId); assert.ok((await call(link.token, "public-read", {}, visitor)).ok); assert.ok((await call(link.token, "public-pdf", {}, visitor)).ok);
  const [afterToken] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.tokenId)); assert.equal(afterToken?.useCount, 0); assert.equal(afterToken?.usedAt, null); assert.deepEqual(await sub(link.q.subscriptionId), before);
});
test("PostgreSQL expired quote link rejects at exact deadline and records access event", async () => {
  const link = await share(); const result = await call(link.token, "respond", { decision: "accepted" }, visitor, repoAt(() => at(3600000))); assert.deepEqual(result, failure("QUOTE_LINK_EXPIRED"));
  assert.equal((await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.secureAccessTokenId, link.tokenId))).at(-1)?.result, "QUOTE_LINK_EXPIRED");
});
test("PostgreSQL revoked quote link rejects all public operations", async () => {
  const link = await share(); quote(await call(link.tokenId, "revoke"));
  for (const action of ["public-read", "public-pdf", "respond"] as const) assert.deepEqual(await call(link.token, action, action === "respond" ? { decision: "accepted" } : {}, visitor), failure("QUOTE_LINK_REVOKED"));
});
test("PostgreSQL invalid/malformed bearers and malformed public response inputs are audited without raw input", async () => {
  assert.deepEqual(await call("invalid", "public-read", {}, visitor), failure("QUOTE_LINK_INVALID")); const link = await share();
  assert.deepEqual(await call(link.token, "respond", { decision: "accepted", message: "SENSITIVE_UNEXPECTED" }, visitor), failure("QUOTE_INVALID_INPUT"));
  const access = await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.secureAccessTokenId, link.tokenId)); assert.equal(access.length, 1); assert.equal(access[0]?.result, "QUOTE_INVALID_INPUT"); assert.ok(!JSON.stringify(access).includes("SENSITIVE_UNEXPECTED"));
});
test("PostgreSQL malformed response bearer keeps response event type and no token reference", async () => {
  const marker = { ...visitor, userAgent: `synthetic-response-${userId}` };
  assert.deepEqual(await call("bad", "respond", { decision: "accepted" }, marker), failure("QUOTE_LINK_INVALID"));
  const rows = await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.userAgentHash, createHashForContext(marker.userAgent)));
  try { assert.equal(rows.length, 1); assert.equal(rows[0]?.eventType, "quote.respond"); assert.equal(rows[0]?.secureAccessTokenId, null); }
  finally { await db.delete(externalAccessEvents).where(eq(externalAccessEvents.userAgentHash, createHashForContext(marker.userAgent))); }
});
test("PostgreSQL missing stored PDF records failed access without consuming token or exposing storage failure", async () => {
  const link = await share(), unavailable = repoAt(undefined, { ...artifacts, async read() { throw new Error("Synthetic private path failure"); } });
  assert.deepEqual(await call(link.token, "public-pdf", {}, visitor, unavailable), failure("QUOTE_ROUTE_UNEXPECTED_FAILURE"));
  const rows = await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.secureAccessTokenId, link.tokenId)); assert.equal(rows.at(-1)?.eventType, "quote.download"); assert.equal(rows.at(-1)?.result, "QUOTE_ROUTE_UNEXPECTED_FAILURE");
  assert.equal((await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.tokenId)))[0]?.useCount, 0);
});
test("PostgreSQL public acceptance preserves every subscription field; exact retry idempotent, conflicting retry consumed", async () => {
  const link = await share(), before = await sub(link.q.subscriptionId); const result = await call(link.token, "respond", { decision: "accepted" }, visitor); assert.ok(result.ok); assert.deepEqual(await sub(link.q.subscriptionId), before);
  const retry = await call(link.token, "respond", { decision: "accepted" }, visitor); assert.ok(retry.ok && "body" in retry && "replayed" in retry.body && retry.body.replayed);
  assert.deepEqual(await call(link.token, "respond", { decision: "declined" }, visitor), failure("QUOTE_LINK_CONSUMED"));
  const audits = await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, link.q.id), eq(auditEvents.eventType, "quote.accepted"))); assert.equal(audits.length, 1);
});
test("PostgreSQL concurrent accept vs decline yields exactly one authoritative response", async () => {
  const link = await share(); const results = await Promise.all([call(link.token, "respond", { decision: "accepted" }, visitor), call(link.token, "respond", { decision: "declined" }, visitor)]); assert.equal(results.filter(r => r.ok).length, 1);
  const v = current(quote(await call(link.q.id, "read"))); assert.ok(v.response === "accepted" || v.response === "declined");
});
test("PostgreSQL two different tokens cannot submit conflicting decisions on one version", async () => {
  const q = await issue(), a = await share(q), b = await share(q);
  const results = await Promise.all([call(a.token, "respond", { decision: "accepted" }, visitor), call(b.token, "respond", { decision: "declined" }, visitor)]); assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "QUOTE_RESPONSE_CONFLICT"));
});
test("PostgreSQL changes_requested allows V2 issuance/acceptance without destroying V1 evidence", async () => {
  const first = await accept(undefined, "changes_requested"), v1 = current(first.q); const before = await db.select().from(quoteVersions).where(eq(quoteVersions.id, v1.id));
  const next = quote(await call(first.q.id, "version", draft(17000))), issued = await issue(next), second = await accept(issued); assert.equal(current(second.q).response, "accepted"); assert.equal(second.q.quoteNumber, first.q.quoteNumber); assert.deepEqual(await db.select().from(quoteVersions).where(eq(quoteVersions.id, v1.id)), before);
  assert.deepEqual(await call(first.token, "respond", { decision: "accepted" }, visitor), failure("QUOTE_INVALID_STATE")); assert.ok((await call(v1.id, "pdf")).ok);
});
test("PostgreSQL synchronization before finance changes only price, exact accepted reference and update timestamp", async () => {
  const accepted = await accept(), q = accepted.q, before = await sub(q.subscriptionId), v = current(q); quote(await call(v.id, "synchronize")); const updated = await sub(q.subscriptionId);
  assert.equal(updated.agreedPriceXaf, v.amountXaf); assert.equal(updated.acceptedQuoteVersionId, v.id); assert.deepEqual({ ...updated, agreedPriceXaf: before.agreedPriceXaf, acceptedQuoteVersionId: before.acceptedQuoteVersionId, updatedAt: before.updatedAt }, before);
});
test("PostgreSQL synchronization requires accepted current version and rejects draft/issued/declined/changes requested", async () => {
  for (const state of ["draft", "issued", "declined", "changes_requested"] as const) {
    let q = await create(); if (state !== "draft") q = await issue(q); if (state === "declined" || state === "changes_requested") q = (await accept(q, state)).q;
    assert.deepEqual(await call(current(q).id, "synchronize"), failure("QUOTE_SYNC_REQUIRES_ACCEPTANCE"));
  }
});
for (const status of ["draft", "active", "settled", "cancelled"] as const) test(`PostgreSQL differing amount rejects sync with committed ${status} plan without row mutation`, async () => {
  const accepted = await accept(), q = accepted.q, before = await sub(q.subscriptionId);
  const [plan] = await db.insert(paymentPlans).values({ subscriptionId: q.subscriptionId, totalExpectedXaf: before.agreedPriceXaf, status }).returning(); assert.ok(plan);
  assert.deepEqual(await call(current(q).id, "synchronize"), failure("QUOTE_SYNC_FINANCE_CONFLICT")); assert.deepEqual(await sub(q.subscriptionId), before); assert.deepEqual((await db.select().from(paymentPlans).where(eq(paymentPlans.id, plan.id)))[0], plan);
});
test("PostgreSQL same amount synchronization remains linkage-only with existing finance", async () => {
  const q = await create(10000), accepted = await accept(await issue(q)), before = await sub(q.subscriptionId);
  const [plan] = await db.insert(paymentPlans).values({ subscriptionId: q.subscriptionId, totalExpectedXaf: 10000, status: "active" }).returning(); assert.ok(plan);
  quote(await call(current(accepted.q).id, "synchronize")); const updated = await sub(q.subscriptionId); assert.equal(updated.agreedPriceXaf, before.agreedPriceXaf); assert.equal(updated.acceptedQuoteVersionId, current(accepted.q).id); assert.deepEqual((await db.select().from(paymentPlans).where(eq(paymentPlans.id, plan.id)))[0], plan);
});
for (const amount of [10000, 15000]) test(`PostgreSQL quote sync ${amount} respects confirmed real ledger events and allocations`, async () => {
  const id = await owner(), q = await create(amount, id), accepted = await accept(await issue(q));
  const finance = new FinanceService(new DrizzleFinanceRepository(db, options, () => now));
  const planResult = await finance.execute(id, "create", { installments: [{ amountXaf: 10000, dueDate: at(10000).toISOString() }] }, actor); assert.ok(planResult.ok); if (!planResult.ok) throw new Error("Missing synthetic finance plan");
  assert.ok((await finance.execute(planResult.body.finance.plans[0]!.id, "activate", {}, actor)).ok);
  assert.ok((await finance.execute(id, "record", { amountXaf: 2000, occurredAt: now.toISOString(), paymentMethod: "cash", idempotencyKey: randomUUID() }, actor)).ok);
  const before = await finance.execute(id, "read", {}, actor), beforeSub = await sub(id);
  const result = await call(current(accepted.q).id, "synchronize");
  if (amount === 10000) assert.ok(result.ok); else { assert.deepEqual(result, failure("QUOTE_SYNC_FINANCE_CONFLICT")); assert.deepEqual(await sub(id), beforeSub); }
  assert.deepEqual(await finance.execute(id, "read", {}, actor), before);
});
test("PostgreSQL quote cancellation blocks new public use and preserves issued evidence/PDF", async () => {
  const link = await share(), before = await db.select().from(quoteVersions).where(eq(quoteVersions.id, current(link.q).id)); quote(await call(link.q.id, "cancel"));
  assert.deepEqual(await call(link.token, "respond", { decision: "accepted" }, visitor), failure("QUOTE_INVALID_STATE")); assert.deepEqual(await db.select().from(quoteVersions).where(eq(quoteVersions.id, current(link.q).id)), before); assert.ok((await call(current(link.q).id, "pdf")).ok);
});
test("PostgreSQL quote PDF cannot be edited/revoked/shared through personalized document routes", async () => {
  const q = await issue(), v = current(q), [dv] = await db.select().from(documentVersions).where(eq(documentVersions.documentId, v.pdfDocumentId!)); assert.ok(dv);
  const docs = new DrizzleDocumentsRepository(db, { ...options, verificationPepper: "synthetic" }, () => now);
  assert.deepEqual(await docs.execute(v.pdfDocumentId!, { action: "archive" }, actor), { ok: false, error: "DOCUMENT_NOT_FOUND" });
  const [file] = await db.select().from(documentVersions).where(eq(documentVersions.id, dv.id)); assert.deepEqual(file, dv);
  assert.deepEqual(await docs.execute(dv.id, { action: "issue-link", expiresAt: at(1000), maxUses: 3 }, actor), { ok: false, error: "DOCUMENT_NOT_FOUND" });
});
test("PostgreSQL quote audits contain only structural facts, never bearer/name/terms", async () => {
  const accepted = await accept(); const rows = await db.select().from(auditEvents).where(eq(auditEvents.entityId, accepted.q.id)); assert.ok(rows.length >= 4);
  const allowed = new Set(["quoteId", "subscriptionId", "quoteNumber", "quoteVersionId", "versionNumber", "amountXaf", "templateVersion", "transition", "tokenId"]);
  for (const row of rows) { assert.ok(row.metadataJson && typeof row.metadataJson === "object"); assert.ok(Object.keys(row.metadataJson).every(k => allowed.has(k))); const serialized = JSON.stringify(row.metadataJson); for (const excluded of [accepted.token, "Synthetic Quote Customer", draft().terms]) assert.ok(!serialized.includes(excluded)); }
});
test("PostgreSQL audit failure rolls back first issue, counter, artifact rows and removes finalized file", async () => {
  const q = await create(), count = await counter(), fileCount = files.size;
  await assert.rejects(call(current(q).id, "issue", {}, actor, auditFailureRepository()));
  assert.equal(await counter(), count); assert.equal(files.size, fileCount); const fresh = quote(await call(q.id, "read")); assert.equal(fresh.quoteNumber, null); assert.equal(current(fresh).issuedAt, null); assert.equal(current(fresh).pdfDocumentId, null);
});
test("PostgreSQL renderer failure rolls back annual allocation without issuing version", async () => {
  const q = await create(), count = await counter(); const failing = repoAt(undefined, { ...artifacts, async render() { throw new Error("Synthetic renderer failure"); } });
  await assert.rejects(call(current(q).id, "issue", {}, actor, failing)); assert.equal(await counter(), count); assert.equal(current(quote(await call(q.id, "read"))).issuedAt, null);
});
test("PostgreSQL expiry during rendering rolls back number/file/version atomically", async () => {
  const q = await create(), count = await counter(), fileCount = files.size; let expired = false;
  const slow = repoAt(() => expired ? at(86400000) : now, { ...artifacts, async render(snapshot) { const bytes = await artifacts.render(snapshot); expired = true; return bytes; } });
  assert.deepEqual(await call(current(q).id, "issue", {}, actor, slow), failure("QUOTE_INVALID_STATE")); assert.equal(await counter(), count); assert.equal(files.size, fileCount); assert.equal(current(quote(await call(q.id, "read"))).issuedAt, null);
});
test("PostgreSQL audit failure rolls back synchronization and accepted reference", async () => {
  const accepted = await accept(), before = await sub(accepted.q.subscriptionId);
  await assert.rejects(call(current(accepted.q).id, "synchronize", {}, actor, auditFailureRepository())); assert.deepEqual(await sub(accepted.q.subscriptionId), before);
});
test("PostgreSQL response audit failure rolls back response, token use and access event", async () => {
  const link = await share(); const before = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.tokenId));
  await assert.rejects(auditFailureRepository().execute(link.token, { action: "respond", decision: "accepted" }, visitor));
  assert.deepEqual(await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.tokenId)), before); assert.equal(current(quote(await call(link.q.id, "read"))).response, null); assert.equal((await db.select().from(externalAccessEvents).where(eq(externalAccessEvents.secureAccessTokenId, link.tokenId))).length, 0);
});
test("PostgreSQL quote list returns every quote of the subscription with its versions", async () => {
  const id = await owner(), a = await issue(await create(15000, id)), b = await create(16000, id);
  const listed = await call(id, "list"); assert.ok(listed.ok && "body" in listed && "quotes" in listed.body, JSON.stringify(listed)); if (!listed.ok || !("body" in listed) || !("quotes" in listed.body)) throw new Error("Missing quotes");
  assert.deepEqual(listed.body.quotes.map(q => q.id).sort(), [a.id, b.id].sort()); assert.ok(listed.body.quotes.every(q => q.versions.length > 0));
});

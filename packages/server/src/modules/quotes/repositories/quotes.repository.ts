import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { quoteStatuses, type QuoteDetail, type QuoteDecision, type QuoteSnapshot, type QuoteVersion } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { customers, subscriptions, subscriptionComponents } from "../../../db/schema/customers.js";
import { services, serviceVariants } from "../../../db/schema/catalogue.js";
import { quotes, quoteVersions, businessDocumentCounters, paymentPlans, paymentEvents, paymentAllocations } from "../../../db/schema/finance.js";
import { documents, documentVersions, secureAccessTokens, externalAccessEvents } from "../../../db/schema/documents.js";
import { AuditService, hashAuditContext, type AuditMetadata } from "../../auth/services/audit.service.js";
import { createDocumentBearer, hashDocumentBearer } from "../../documents/services/document-token.crypto.js";
import { quoteFailure, type Draft, type QuoteActor, type QuoteArtifacts, type QuoteCommand, type QuoteResult, type QuotesRepository } from "../services/quotes.service.js";
import { quoteYear, quoteNumber, readQuoteSnapshot } from "../services/quote-snapshot.js";

type Database = typeof appDb;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Quote = typeof quotes.$inferSelect;
type Version = typeof quoteVersions.$inferSelect;
type Token = typeof secureAccessTokens.$inferSelect;
const decisionOf = (v: Version): QuoteDecision | null => v.acceptedAt ? "accepted" : v.declinedAt ? "declined" : v.changesRequestedAt ? "changes_requested" : null;
const termsOf = (v: Version) => v.termsSnapshotJson && typeof v.termsSnapshotJson === "object" && "terms" in v.termsSnapshotJson && typeof v.termsSnapshotJson.terms === "string" ? v.termsSnapshotJson.terms : "";
function dbCode(error: unknown): { code: string; constraint: string } | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return { code: error.code, constraint: "constraint" in error && typeof error.constraint === "string" ? error.constraint : "" };
  return "cause" in error && error.cause !== error ? dbCode(error.cause) : null;
}
export class DrizzleQuotesRepository implements QuotesRepository {
  constructor(private readonly database: Database, private readonly options: { auditHashPepper: string; tokenPepper: string }, private readonly artifacts: QuoteArtifacts, private readonly clock: () => Date = () => new Date()) {}
  private audit(tx: Tx, actor: QuoteActor, eventType: string, q: Quote, v?: Version, extra: AuditMetadata = {}) {
    return new AuditService(tx, this.options).record({ actorType: actor.userId ? "user" : "anonymous", actorUserId: actor.userId, eventType, entityType: "quote", entityId: q.id,
      requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent, result: "success",
      metadata: { quoteId: q.id, subscriptionId: q.subscriptionId, quoteNumber: q.quoteNumber, ...(v ? { quoteVersionId: v.id, versionNumber: v.versionNumber, amountXaf: v.amountXaf } : {}), ...extra } });
  }
  private access(tx: Tx, token: Token | null, actor: QuoteActor, eventType: string, result: string) {
    return tx.insert(externalAccessEvents).values({ secureAccessTokenId: token?.id ?? null, eventType, result,
      ipHash: hashAuditContext(actor.ipAddress, this.options.auditHashPepper), userAgentHash: hashAuditContext(actor.userAgent, this.options.auditHashPepper) });
  }
  private async detail(tx: Tx, q: Quote): Promise<QuoteDetail> {
    if (!q.subscriptionId) throw new Error("Quote ownership missing");
    const status = quoteStatuses.find(s => s === q.status); if (!status) throw new Error("Invalid quote status");
    const [sub] = await tx.select({ accepted: subscriptions.acceptedQuoteVersionId }).from(subscriptions).where(eq(subscriptions.id, q.subscriptionId));
    const versions = await tx.select().from(quoteVersions).where(eq(quoteVersions.quoteId, q.id)).orderBy(quoteVersions.versionNumber);
    const ids = versions.map(v => v.id);
    const links = ids.length ? await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.resourceType, "quote_version"), eq(secureAccessTokens.action, "quote_response"), inArray(secureAccessTokens.resourceId, ids))).orderBy(secureAccessTokens.createdAt) : [];
    return { id: q.id, quoteNumber: q.quoteNumber, subscriptionId: q.subscriptionId, customerId: q.customerId, requestId: q.requestId, status,
      currentVersionId: q.currentVersionId, createdAt: q.createdAt.toISOString(), versions: versions.map(v => ({ id: v.id, versionNumber: v.versionNumber, amountXaf: v.amountXaf, currency: "XAF", validUntil: v.validUntil?.toISOString() ?? null,
        terms: termsOf(v), issuedAt: v.issuedAt?.toISOString() ?? null, response: decisionOf(v), respondedAt: (v.acceptedAt ?? v.declinedAt ?? v.changesRequestedAt)?.toISOString() ?? null,
        pdfDocumentId: v.pdfDocumentId, snapshot: v.issuedAt ? readQuoteSnapshot(v.serviceSnapshotJson) : null, synchronized: sub?.accepted === v.id } satisfies QuoteVersion)),
      links: links.map(t => ({ id: t.id, versionId: t.resourceId, expiresAt: t.expiresAt.toISOString(), revokedAt: t.revokedAt?.toISOString() ?? null, usedAt: t.usedAt?.toISOString() ?? null })) };
  }
  private async insertDraft(tx: Tx, q: Quote, draft: Draft, versionNumber: number) {
    const [v] = await tx.insert(quoteVersions).values({ quoteId: q.id, versionNumber, amountXaf: draft.amountXaf, validUntil: draft.validUntil,
      serviceSnapshotJson: {}, termsSnapshotJson: { terms: draft.terms } }).returning();
    if (!v) throw new Error("Missing quote version"); return v;
  }
  private async pdf(tx: Tx, q: Quote, v: Version): Promise<QuoteResult> {
    if (!v.issuedAt || !v.pdfDocumentId) return quoteFailure("QUOTE_INVALID_STATE");
    const [artifact] = await tx.select({ doc: documents, file: documentVersions }).from(documents).innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
      .where(and(eq(documents.id, v.pdfDocumentId), eq(documents.ownerType, "quote_version"), eq(documents.ownerId, v.id), eq(documents.currentVersionId, documentVersions.id), eq(documentVersions.malwareScanStatus, "clean")));
    if (!artifact || artifact.doc.documentType !== "quote" || artifact.file.versionNumber !== 1) return quoteFailure("QUOTE_INVALID_STATE");
    return { ok: true, binary: { bytes: await this.artifacts.read(artifact.file.storageKey), mimeType: "application/pdf", filename: `${q.quoteNumber}-v${v.versionNumber}.pdf` } };
  }
  private async publicCommand(tx: Tx, bearer: string, command: QuoteCommand, actor: QuoteActor): Promise<QuoteResult> {
    const [found] = await tx.select().from(secureAccessTokens).where(eq(secureAccessTokens.tokenHash, hashDocumentBearer(bearer, this.options.tokenPepper))).for("update");
    const token = found?.resourceType === "quote_version" && found.action === "quote_response" ? found : null;
    const action = command.action === "invalid-public-input" ? command.event : command.action;
    const eventType = action === "respond" ? "quote.respond" : action === "public-pdf" ? "quote.download" : "quote.view";
    const reject = async (error: Parameters<typeof quoteFailure>[0]) => { await this.access(tx, token, actor, eventType, error); return quoteFailure(error); };
    if (!token || token.maxUses !== 1 || token.requiresOtp) return reject("QUOTE_LINK_INVALID");
    if (command.action === "invalid-public-input") return reject("QUOTE_INVALID_INPUT");
    const [versionScope] = await tx.select({ quoteId: quoteVersions.quoteId }).from(quoteVersions).where(eq(quoteVersions.id, token.resourceId));
    if (!versionScope) return reject("QUOTE_LINK_INVALID");
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, versionScope.quoteId)).for("update");
    const [v] = await tx.select().from(quoteVersions).where(eq(quoteVersions.id, token.resourceId)).for("update");
    // Recheck time after every potentially blocking lock, including quote/version locks.
    const now = this.clock();
    if (token.revokedAt) return reject("QUOTE_LINK_REVOKED");
    if (token.expiresAt <= now || !v?.validUntil || v.validUntil <= now) return reject("QUOTE_LINK_EXPIRED");
    if (!q || !v.issuedAt || !v.pdfDocumentId || q.status === "cancelled" || q.currentVersionId !== v.id) return reject("QUOTE_INVALID_STATE");
    const snapshot = readQuoteSnapshot(v.serviceSnapshotJson); if (!snapshot) return reject("QUOTE_INVALID_STATE");
    const response = decisionOf(v);
    if (command.action === "respond") {
      if (token.usedAt || token.useCount !== 0) {
        if (response === command.decision && token.usedAt && token.useCount === 1) {
          await this.access(tx, token, actor, eventType, "replayed");
          return { ok: true, body: { snapshot, response, canRespond: false, replayed: true } };
        }
        return reject("QUOTE_LINK_CONSUMED");
      }
      if (response || q.status !== "issued") return reject("QUOTE_RESPONSE_CONFLICT");
      const stamp = command.decision === "accepted" ? { acceptedAt: now } : command.decision === "declined" ? { declinedAt: now } : { changesRequestedAt: now };
      await tx.update(quoteVersions).set(stamp).where(eq(quoteVersions.id, v.id));
      await tx.update(quotes).set({ status: command.decision, updatedAt: now }).where(eq(quotes.id, q.id));
      await tx.update(secureAccessTokens).set({ usedAt: now, useCount: 1, updatedAt: now }).where(eq(secureAccessTokens.id, token.id));
      await this.audit(tx, actor, `quote.${command.decision}`, q, v, { tokenId: token.id, transition: command.decision });
      await this.access(tx, token, actor, eventType, "success");
      return { ok: true, body: { snapshot, response: command.decision, canRespond: false } };
    }
    if (command.action === "public-pdf") {
      let result: QuoteResult;
      try { result = await this.pdf(tx, q, v); } catch { return reject("QUOTE_ROUTE_UNEXPECTED_FAILURE"); }
      await this.access(tx, token, actor, eventType, result.ok ? "success" : "unavailable"); return result;
    }
    await this.access(tx, token, actor, eventType, "success");
    return { ok: true, body: { snapshot, response, canRespond: !response && !token.usedAt && token.useCount === 0 && q.status === "issued" } };
  }
  async execute(id: string, command: QuoteCommand, actor: QuoteActor): Promise<QuoteResult> {
    let finalizedKey: string | null = null;
    try {
      return await this.database.transaction(async tx => {
        if (command.action === "public-read" || command.action === "public-pdf" || command.action === "respond" || command.action === "invalid-public-input") return this.publicCommand(tx, id, command, actor);
        if (command.action === "list" || command.action === "create") {
          const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for(command.action === "create" ? "update" : "share");
          if (!sub) return quoteFailure("QUOTE_NOT_FOUND");
          if (command.action === "list") {
            const rows = await tx.select().from(quotes).where(eq(quotes.subscriptionId, id)).orderBy(quotes.createdAt, quotes.id);
            const details: QuoteDetail[] = []; for (const q of rows) details.push(await this.detail(tx, q)); // one tx connection: no parallel queries
            return { ok: true, body: { quotes: details, acceptedQuoteVersionId: sub.acceptedQuoteVersionId } };
          }
          if (command.draft.validUntil <= this.clock()) return quoteFailure("QUOTE_INVALID_INPUT");
          const [q] = await tx.insert(quotes).values({ subscriptionId: sub.id, customerId: sub.customerId, requestId: sub.sourceRequestId, status: "draft" }).returning();
          if (!q) throw new Error("Missing quote");
          const v = await this.insertDraft(tx, q, command.draft, 1);
          await tx.update(quotes).set({ currentVersionId: v.id }).where(eq(quotes.id, q.id));
          await this.audit(tx, actor, "quote.created", q, v);
          return { ok: true, body: { quote: await this.detail(tx, { ...q, currentVersionId: v.id }) } };
        }
        if (command.action === "revoke") {
          const [token] = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.id, id), eq(secureAccessTokens.resourceType, "quote_version"), eq(secureAccessTokens.action, "quote_response"))).for("update");
          if (!token) return quoteFailure("QUOTE_NOT_FOUND");
          const [v] = await tx.select().from(quoteVersions).where(eq(quoteVersions.id, token.resourceId));
          const [q] = v ? await tx.select().from(quotes).where(eq(quotes.id, v.quoteId)) : [];
          if (!q || !v) return quoteFailure("QUOTE_NOT_FOUND");
          if (!token.revokedAt) {
            await tx.update(secureAccessTokens).set({ revokedAt: this.clock(), updatedAt: this.clock() }).where(eq(secureAccessTokens.id, id));
            await this.audit(tx, actor, "quote.link_revoked", q, v, { tokenId: id });
          }
          return { ok: true, body: { quote: await this.detail(tx, q) } };
        }
        let qid = id;
        if (!["read", "version", "cancel"].includes(command.action)) {
          const [scope] = await tx.select({ quoteId: quoteVersions.quoteId }).from(quoteVersions).where(eq(quoteVersions.id, id));
          if (!scope) return quoteFailure("QUOTE_NOT_FOUND"); qid = scope.quoteId;
        }
        // Synchronization shares the finance parent lock before locking the quote.
        let lockedSub: typeof subscriptions.$inferSelect | undefined;
        if (command.action === "synchronize") {
          const [scope] = await tx.select({ subscriptionId: quotes.subscriptionId }).from(quotes).where(eq(quotes.id, qid));
          if (!scope?.subscriptionId) return quoteFailure("QUOTE_NOT_FOUND");
          [lockedSub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, scope.subscriptionId)).for("update");
        }
        const [q] = await tx.select().from(quotes).where(eq(quotes.id, qid)).for("update");
        if (!q) return quoteFailure("QUOTE_NOT_FOUND");
        if (command.action === "read") return { ok: true, body: { quote: await this.detail(tx, q) } };
        const versions = await tx.select().from(quoteVersions).where(eq(quoteVersions.quoteId, q.id)).orderBy(quoteVersions.versionNumber).for("update");
        if (command.action === "version") {
          if (q.status === "cancelled" || versions.some(v => !v.issuedAt)) return quoteFailure("QUOTE_VERSION_CONFLICT");
          if (command.draft.validUntil <= this.clock()) return quoteFailure("QUOTE_INVALID_INPUT");
          const v = await this.insertDraft(tx, q, command.draft, (versions.at(-1)?.versionNumber ?? 0) + 1);
          await this.audit(tx, actor, "quote.version_created", q, v);
          return { ok: true, body: { quote: await this.detail(tx, q) } };
        }
        if (command.action === "cancel") {
          if (q.status !== "cancelled") {
            await tx.update(quotes).set({ status: "cancelled", updatedAt: this.clock() }).where(eq(quotes.id, q.id));
            await this.audit(tx, actor, "quote.cancelled", q, undefined, { transition: "cancelled" });
          }
          return { ok: true, body: { quote: await this.detail(tx, { ...q, status: "cancelled" }) } };
        }
        const v = versions.find(v => v.id === id); if (!v) return quoteFailure("QUOTE_NOT_FOUND");
        if (command.action === "pdf") return this.pdf(tx, q, v);
        if (q.status === "cancelled") return quoteFailure("QUOTE_INVALID_STATE");
        if (command.action === "edit") {
          if (v.issuedAt) return quoteFailure("QUOTE_VERSION_IMMUTABLE");
          if (command.draft.validUntil <= this.clock()) return quoteFailure("QUOTE_INVALID_INPUT");
          await tx.update(quoteVersions).set({ amountXaf: command.draft.amountXaf, validUntil: command.draft.validUntil, termsSnapshotJson: { terms: command.draft.terms } }).where(eq(quoteVersions.id, v.id));
          await this.audit(tx, actor, "quote.draft_edited", q, { ...v, amountXaf: command.draft.amountXaf });
        } else if (command.action === "issue") {
          if (v.issuedAt) return { ok: true, body: { quote: await this.detail(tx, q) } };
          if (v.id !== versions.at(-1)?.id || !v.validUntil || v.validUntil <= this.clock() || !termsOf(v)) return quoteFailure("QUOTE_INVALID_STATE");
          const [sub] = q.subscriptionId ? await tx.select().from(subscriptions).where(eq(subscriptions.id, q.subscriptionId)) : [];
          if (!sub || sub.customerId !== q.customerId || sub.currency !== "XAF") return quoteFailure("QUOTE_INVALID_STATE");
          const [customer] = await tx.select().from(customers).where(eq(customers.id, sub.customerId));
          const [service] = await tx.select().from(services).where(eq(services.id, sub.serviceId));
          const [variant] = sub.variantId ? await tx.select().from(serviceVariants).where(eq(serviceVariants.id, sub.variantId)) : [];
          if (!customer || customer.archivedAt || !service) return quoteFailure("QUOTE_INVALID_STATE");
          const components = await tx.select().from(subscriptionComponents).where(eq(subscriptionComponents.subscriptionId, sub.id)).orderBy(subscriptionComponents.id);
          const now = this.clock(); let number = q.quoteNumber;
          if (!number) {
            const year = quoteYear(now);
            await tx.insert(businessDocumentCounters).values({ documentType: "quote", year }).onConflictDoNothing();
            const [counter] = await tx.select().from(businessDocumentCounters).where(and(eq(businessDocumentCounters.documentType, "quote"), eq(businessDocumentCounters.year, year))).for("update");
            if (!counter || counter.lastValue >= 2147483647) return quoteFailure("QUOTE_NUMBER_CONFLICT");
            number = quoteNumber(year, counter.lastValue + 1);
            await tx.update(businessDocumentCounters).set({ lastValue: counter.lastValue + 1 }).where(eq(businessDocumentCounters.id, counter.id));
          }
          const snapshot: QuoteSnapshot = { quoteNumber: number, versionNumber: v.versionNumber, customerName: customer.fullName, subscriptionReference: sub.reference, serviceLabel: service.name,
            variantLabel: variant?.name ?? null, amountXaf: v.amountXaf, currency: "XAF", durationValue: sub.durationValueSnapshot, durationUnit: sub.durationUnitSnapshot,
            components: components.map(c => ({ label: c.labelSnapshot, quantity: c.quantityEntitled })), issuedAt: now.toISOString(), validUntil: v.validUntil.toISOString(), terms: termsOf(v), templateVersion: "quote-v1" };
          const bytes = await this.artifacts.render(snapshot);
          const file = await this.artifacts.persist({ bytes, mimeType: "application/pdf", originalFilename: `${number}-v${v.versionNumber}.pdf` }); finalizedKey = file.storageKey;
          // Time may have advanced while rendering or scanning. A late failure must roll back the counter too.
          if (v.validUntil <= this.clock()) throw new QuoteIssueExpired();
          const [doc] = await tx.insert(documents).values({ ownerType: "quote_version", ownerId: v.id, documentType: "quote", sensitivity: "private", status: "available", createdByUserId: actor.userId, createdAt: now, updatedAt: now }).returning();
          if (!doc) throw new Error("Missing quote artifact");
          const [dv] = await tx.insert(documentVersions).values({ documentId: doc.id, versionNumber: 1, ...file, malwareScanStatus: "clean", uploadedByType: "system", uploadedByUserId: actor.userId, createdAt: now }).returning();
          if (!dv) throw new Error("Missing quote artifact version");
          await tx.update(documents).set({ currentVersionId: dv.id }).where(eq(documents.id, doc.id));
          await tx.update(quoteVersions).set({ serviceSnapshotJson: snapshot, issuedAt: now, pdfDocumentId: doc.id }).where(eq(quoteVersions.id, v.id));
          await tx.update(quotes).set({ quoteNumber: number, currentVersionId: v.id, status: "issued", updatedAt: now }).where(eq(quotes.id, q.id));
          await this.audit(tx, actor, "quote.version_issued", { ...q, quoteNumber: number }, v, { templateVersion: "quote-v1", transition: "issued" });
        } else if (command.action === "share") {
          const now = this.clock();
          if (!v.issuedAt || !v.pdfDocumentId || q.currentVersionId !== v.id || q.status !== "issued" || decisionOf(v)) return quoteFailure("QUOTE_INVALID_STATE");
          if (!v.validUntil || command.expiresAt <= now || command.expiresAt > v.validUntil) return quoteFailure("QUOTE_INVALID_INPUT");
          const bearer = createDocumentBearer();
          const [token] = await tx.insert(secureAccessTokens).values({ tokenHash: hashDocumentBearer(bearer, this.options.tokenPepper), resourceType: "quote_version", resourceId: v.id,
            action: "quote_response", expiresAt: command.expiresAt, maxUses: 1, createdAt: now, updatedAt: now }).returning();
          if (!token) throw new Error("Missing quote token");
          await this.audit(tx, actor, "quote.link_issued", q, v, { tokenId: token.id });
          return { ok: true, body: { quote: await this.detail(tx, q), share: { token: bearer, tokenId: token.id, expiresAt: token.expiresAt.toISOString() } } };
        } else if (command.action === "synchronize") {
          if (!lockedSub || !v.acceptedAt || q.currentVersionId !== v.id || q.status !== "accepted") return quoteFailure("QUOTE_SYNC_REQUIRES_ACCEPTANCE");
          if (lockedSub.customerId !== q.customerId) return quoteFailure("QUOTE_INVALID_STATE");
          if (lockedSub.agreedPriceXaf !== v.amountXaf) {
            const plan = await tx.select({ id: paymentPlans.id }).from(paymentPlans).where(eq(paymentPlans.subscriptionId, lockedSub.id)).limit(1);
            const allocation = await tx.select({ id: paymentAllocations.id }).from(paymentAllocations).where(eq(paymentAllocations.subscriptionId, lockedSub.id)).limit(1);
            const confirmed = await tx.select({ id: paymentEvents.id }).from(paymentEvents).innerJoin(paymentAllocations, eq(paymentAllocations.paymentEventId, paymentEvents.id))
              .where(and(eq(paymentAllocations.subscriptionId, lockedSub.id), isNotNull(paymentEvents.confirmedAt))).limit(1);
            if (plan.length || allocation.length || confirmed.length) return quoteFailure("QUOTE_SYNC_FINANCE_CONFLICT");
          }
          if (lockedSub.acceptedQuoteVersionId !== v.id || lockedSub.agreedPriceXaf !== v.amountXaf) {
            await tx.update(subscriptions).set({ acceptedQuoteVersionId: v.id, agreedPriceXaf: v.amountXaf, updatedAt: this.clock() }).where(eq(subscriptions.id, lockedSub.id));
            await this.audit(tx, actor, "quote.synchronized", q, v);
          }
        }
        const [fresh] = await tx.select().from(quotes).where(eq(quotes.id, q.id)); if (!fresh) throw new Error("Missing quote");
        return { ok: true, body: { quote: await this.detail(tx, fresh) } };
      });
    } catch (error) {
      if (finalizedKey) await this.artifacts.remove(finalizedKey);
      if (error instanceof QuoteIssueExpired) return quoteFailure("QUOTE_INVALID_STATE");
      const failure = dbCode(error);
      if (failure?.code === "23505") return quoteFailure(failure.constraint === "quotes_number_uq" ? "QUOTE_NUMBER_CONFLICT" : "QUOTE_VERSION_CONFLICT");
      if (failure?.code === "40001" || failure?.code === "40P01") return quoteFailure("QUOTE_VERSION_CONFLICT");
      throw error;
    }
  }
}
class QuoteIssueExpired extends Error {}

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Receipt, ReceiptSnapshot, ReceiptErrorCode } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { receipts, paymentEvents, paymentAllocations, paymentPlans, installments, businessDocumentCounters } from "../../../db/schema/finance.js";
import { documents, documentVersions, secureAccessTokens, externalAccessEvents } from "../../../db/schema/documents.js";
import { AuditService, hashAuditContext, type AuditMetadata } from "../../auth/services/audit.service.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";
import { FinanceInvariantError } from "../../finance/services/finance.policy.js";
import { createDocumentBearer, hashDocumentBearer } from "../../documents/services/document-token.crypto.js";
import { quoteYear } from "../../quotes/services/quote-snapshot.js";
import { receiptFailure, ReceiptDomainError, type ReceiptActor, type ReceiptArtifacts, type ReceiptCommand, type ReceiptResult, type ReceiptsRepository } from "../services/receipts.types.js";
import { buildReceiptSnapshot, readReceiptSnapshot, receiptNumber, correctionOf, publicReceipt } from "../services/receipt-snapshot.js";
type Database = typeof appDb;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = typeof receipts.$inferSelect;
type Token = typeof secureAccessTokens.$inferSelect;
function dbCode(error: unknown): { code: string; constraint: string } | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return { code: error.code, constraint: "constraint" in error && typeof error.constraint === "string" ? error.constraint : "" };
  return "cause" in error && error.cause !== error ? dbCode(error.cause) : null;
}
export class DrizzleReceiptsRepository implements ReceiptsRepository {
  private readonly finance: DrizzleFinanceRepository;
  constructor(private readonly database: Database, private readonly options: { auditHashPepper: string; tokenPepper: string }, private readonly artifacts: ReceiptArtifacts, private readonly clock: () => Date = () => new Date()) {
    this.finance = new DrizzleFinanceRepository(database, options, clock);
  }
  private audit(tx: Tx, actor: ReceiptActor, eventType: string, r: Row, extra: AuditMetadata = {}) {
    return new AuditService(tx, this.options).record({ actorType: actor.userId ? "user" : "anonymous", actorUserId: actor.userId, eventType, entityType: "receipt", entityId: r.id, requestId: actor.requestId,
      ipAddress: actor.ipAddress, userAgent: actor.userAgent, result: "success", metadata: { receiptId: r.id, receiptNumber: r.receiptNumber, paymentEventId: r.paymentEventId, documentId: r.pdfDocumentId, ...extra } });
  }
  private access(tx: Tx, token: Token | null, actor: ReceiptActor, eventType: string, result: string) {
    return tx.insert(externalAccessEvents).values({ secureAccessTokenId: token?.id ?? null, eventType, result, ipHash: hashAuditContext(actor.ipAddress, this.options.auditHashPepper), userAgentHash: hashAuditContext(actor.userAgent, this.options.auditHashPepper) });
  }
  private snapshot(row: Row): ReceiptSnapshot {
    const value = readReceiptSnapshot(row.snapshotJson);
    if (!value || value.receiptNumber !== row.receiptNumber || value.paymentEventId !== row.paymentEventId || value.issuedAt !== row.issuedAt.toISOString()) throw new ReceiptDomainError("RECEIPT_ISSUE_CONFLICT");
    return value;
  }
  private async lockFinance(tx: Tx, paymentId: string) {
    const scopes = await tx.selectDistinct({ id: paymentAllocations.subscriptionId }).from(paymentAllocations).where(eq(paymentAllocations.paymentEventId, paymentId));
    if (scopes.length !== 1) throw new ReceiptDomainError("RECEIPT_INVALID_PAYMENT");
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, scopes[0]!.id)).for("update");
    if (!sub) throw new ReceiptDomainError("RECEIPT_INVALID_PAYMENT");
    // Same subscription -> plans -> installments -> event ordering as S6.1. Finance never locks receipts.
    await tx.select({ id: paymentPlans.id }).from(paymentPlans).where(eq(paymentPlans.subscriptionId, sub.id)).orderBy(paymentPlans.id).for("update");
    await tx.select({ id: installments.id }).from(installments).innerJoin(paymentPlans, eq(paymentPlans.id, installments.paymentPlanId)).where(eq(paymentPlans.subscriptionId, sub.id)).orderBy(installments.dueDate, installments.sequenceNumber, installments.id).for("update");
    const [payment] = await tx.select().from(paymentEvents).where(eq(paymentEvents.id, paymentId)).for("update");
    if (!payment || payment.eventType !== "payment_received" || !payment.confirmedAt || payment.customerId !== sub.customerId || payment.currency !== "XAF") throw new ReceiptDomainError("RECEIPT_INVALID_PAYMENT");
    const view = await this.finance.readInTransaction(tx, sub.id), source = view?.paymentHistory.find(p => p.id === payment.id);
    if (!view || !source || source.eventType !== "payment_received") throw new ReceiptDomainError("RECEIPT_INVALID_PAYMENT");
    return { sub, view, source };
  }
  private async detail(tx: Tx, row: Row): Promise<Receipt> {
    const snapshot = this.snapshot(row), { sub, source } = await this.lockFinance(tx, row.paymentEventId);
    if (row.customerId !== sub.customerId || snapshot.subscriptionId !== sub.id) throw new ReceiptDomainError("RECEIPT_INVALID_PAYMENT");
    const links = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.resourceType, "receipt"), eq(secureAccessTokens.resourceId, row.id), eq(secureAccessTokens.action, "receipt_download"))).orderBy(secureAccessTokens.createdAt);
    return { id: row.id, customerId: row.customerId, subscriptionId: sub.id, paymentEventId: row.paymentEventId, receiptNumber: row.receiptNumber, issuedAt: row.issuedAt.toISOString(), state: row.voidedAt ? "voided" : "issued",
      voidedAt: row.voidedAt?.toISOString() ?? null, voidReason: row.voidReason, snapshot, pdfDocumentId: row.pdfDocumentId, ...correctionOf(source),
      links: links.map(t => ({ id: t.id, expiresAt: t.expiresAt.toISOString(), revokedAt: t.revokedAt?.toISOString() ?? null, maxUses: t.maxUses ?? 0, useCount: t.useCount })) };
  }
  private async pdf(tx: Tx, row: Row): Promise<ReceiptResult> {
    const [artifact] = await tx.select({ doc: documents, file: documentVersions }).from(documents).innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
      .where(and(eq(documents.id, row.pdfDocumentId), eq(documents.ownerType, "receipt"), eq(documents.ownerId, row.id), eq(documents.documentType, "payment_receipt"), eq(documents.currentVersionId, documentVersions.id), eq(documentVersions.malwareScanStatus, "clean")));
    if (!artifact || artifact.file.versionNumber !== 1 || artifact.file.mimeType !== "application/pdf") return receiptFailure("RECEIPT_PDF_FAILURE");
    try { return { ok: true, binary: { bytes: await this.artifacts.read(artifact.file.storageKey), mimeType: "application/pdf", filename: `${row.receiptNumber}.pdf` } }; }
    catch { return receiptFailure("RECEIPT_PDF_FAILURE"); }
  }
  private async publicCommand(tx: Tx, bearer: string, command: ReceiptCommand, actor: ReceiptActor): Promise<ReceiptResult> {
    const [found] = await tx.select().from(secureAccessTokens).where(eq(secureAccessTokens.tokenHash, hashDocumentBearer(bearer, this.options.tokenPepper))).for("update");
    const token = found?.resourceType === "receipt" && found.action === "receipt_download" ? found : null;
    const event = command.action === "public-pdf" || command.action === "invalid-public-input" && command.event === "download" ? "receipt.download" : "receipt.view";
    const reject = async (error: ReceiptErrorCode) => { await this.access(tx, token, actor, event, error); return receiptFailure(error); };
    if (!token || token.requiresOtp || !token.maxUses || token.maxUses < 1 || token.maxUses > 20) return reject("RECEIPT_LINK_INVALID");
    const [row] = await tx.select().from(receipts).where(eq(receipts.id, token.resourceId)).for("update");
    if (!row) return reject("RECEIPT_LINK_INVALID");
    const detail = await this.detail(tx, row), now = this.clock();
    if (token.revokedAt) return reject("RECEIPT_LINK_REVOKED");
    if (token.expiresAt <= now) return reject("RECEIPT_LINK_EXPIRED");
    if (token.useCount >= token.maxUses) return reject("RECEIPT_LINK_CONSUMED");
    if (command.action === "invalid-public-input") return reject("RECEIPT_INVALID_INPUT");
    if (command.action === "public-pdf") {
      const result = await this.pdf(tx, row); if (!result.ok) return reject(result.error);
      await tx.update(secureAccessTokens).set({ useCount: token.useCount + 1, usedAt: now, updatedAt: now }).where(eq(secureAccessTokens.id, token.id));
      await this.access(tx, token, actor, event, "success"); return result;
    }
    await this.access(tx, token, actor, event, "success"); return { ok: true, body: publicReceipt(detail, { maxUses: token.maxUses, useCount: token.useCount }) };
  }
  async execute(id: string, command: ReceiptCommand, actor: ReceiptActor): Promise<ReceiptResult> {
    let key: string | null = null;
    try {
      return await this.database.transaction(async tx => {
        if (command.action === "public-read" || command.action === "public-pdf" || command.action === "invalid-public-input") return this.publicCommand(tx, id, command, actor);
        if (command.action === "list") {
          const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)); if (!sub) return receiptFailure("RECEIPT_NOT_FOUND");
          const rows = await tx.select({ receipt: receipts }).from(receipts).innerJoin(paymentAllocations, eq(paymentAllocations.paymentEventId, receipts.paymentEventId)).where(eq(paymentAllocations.subscriptionId, id)).orderBy(receipts.issuedAt, receipts.id);
          const unique = [...new Map(rows.map(r => [r.receipt.id, r.receipt])).values()];
          const details: Receipt[] = []; for (const r of unique) details.push(await this.detail(tx, r)); // one tx connection: no parallel queries
          return { ok: true, body: { receipts: details } };
        }
        if (command.action === "issue") {
          const { sub, view, source } = await this.lockFinance(tx, id);
          const [existing] = await tx.select().from(receipts).where(eq(receipts.paymentEventId, id));
          if (existing) return { ok: true, body: { receipt: await this.detail(tx, existing), replayed: true } };
          const [customer] = await tx.select().from(customers).where(eq(customers.id, sub.customerId)); if (!customer || customer.archivedAt) return receiptFailure("RECEIPT_INVALID_PAYMENT");
          const now = this.clock(), year = quoteYear(now), receiptId = randomUUID();
          // Validate historical reconstruction before allocating a number or creating an artifact.
          buildReceiptSnapshot(view, source, { receiptNumber: "pending", customerName: customer.fullName, subscriptionReference: sub.reference, issuedAt: now.toISOString() });
          await tx.insert(businessDocumentCounters).values({ documentType: "receipt", year }).onConflictDoNothing();
          const [counter] = await tx.select().from(businessDocumentCounters).where(and(eq(businessDocumentCounters.documentType, "receipt"), eq(businessDocumentCounters.year, year))).for("update");
          if (!counter || counter.lastValue >= 2147483647) throw new ReceiptDomainError("RECEIPT_NUMBER_CONFLICT");
          const number = receiptNumber(year, counter.lastValue + 1);
          await tx.update(businessDocumentCounters).set({ lastValue: counter.lastValue + 1 }).where(eq(businessDocumentCounters.id, counter.id));
          const snapshot = buildReceiptSnapshot(view, source, { receiptNumber: number, customerName: customer.fullName, subscriptionReference: sub.reference, issuedAt: now.toISOString() });
          let file;
          try { const bytes = await this.artifacts.render(snapshot); file = await this.artifacts.persist({ bytes, mimeType: "application/pdf", originalFilename: `${number}.pdf` }); key = file.storageKey; }
          catch { throw new ReceiptDomainError("RECEIPT_PDF_FAILURE"); }
          const [doc] = await tx.insert(documents).values({ ownerType: "receipt", ownerId: receiptId, documentType: "payment_receipt", sensitivity: "private", status: "available", createdByUserId: actor.userId, createdAt: now, updatedAt: now }).returning();
          if (!doc) throw new Error("Missing receipt document");
          const [version] = await tx.insert(documentVersions).values({ documentId: doc.id, versionNumber: 1, ...file, malwareScanStatus: "clean", uploadedByType: "system", uploadedByUserId: actor.userId, createdAt: now }).returning();
          if (!version) throw new Error("Missing receipt version");
          await tx.update(documents).set({ currentVersionId: version.id }).where(eq(documents.id, doc.id));
          const [row] = await tx.insert(receipts).values({ id: receiptId, receiptNumber: number, customerId: sub.customerId, paymentEventId: id, issuedAt: now, pdfDocumentId: doc.id, snapshotJson: snapshot }).returning();
          if (!row) throw new Error("Missing receipt");
          await this.audit(tx, actor, "receipt.issued", row, { subscriptionId: sub.id, documentVersionId: version.id, amountXaf: source.amountXaf, paymentMethod: source.paymentMethod, allocationCount: source.allocations.length });
          return { ok: true, body: { receipt: await this.detail(tx, row) } };
        }
        if (command.action === "revoke") {
          const [token] = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.id, id), eq(secureAccessTokens.resourceType, "receipt"), eq(secureAccessTokens.action, "receipt_download"))).for("update");
          if (!token) return receiptFailure("RECEIPT_NOT_FOUND");
          const [row] = await tx.select().from(receipts).where(eq(receipts.id, token.resourceId)); if (!row) return receiptFailure("RECEIPT_NOT_FOUND");
          if (!token.revokedAt) { await tx.update(secureAccessTokens).set({ revokedAt: this.clock(), updatedAt: this.clock() }).where(eq(secureAccessTokens.id, id)); await this.audit(tx, actor, "receipt.link_revoked", row, { tokenId: id }); }
          return { ok: true, body: { revoked: true } };
        }
        const [row] = await tx.select().from(receipts).where(eq(receipts.id, id)).for("update"); if (!row) return receiptFailure("RECEIPT_NOT_FOUND");
        const detail = await this.detail(tx, row);
        if (command.action === "read") return { ok: true, body: { receipt: detail } };
        if (command.action === "pdf") { const result = await this.pdf(tx, row); if (result.ok) await this.audit(tx, actor, "receipt.document_downloaded", row); return result; }
        if (command.action === "share") {
          const now = this.clock(); if (command.expiresAt <= now) return receiptFailure("RECEIPT_INVALID_INPUT");
          const bearer = createDocumentBearer(), [token] = await tx.insert(secureAccessTokens).values({ tokenHash: hashDocumentBearer(bearer, this.options.tokenPepper), resourceType: "receipt", resourceId: row.id, action: "receipt_download", expiresAt: command.expiresAt, maxUses: command.maxUses, createdAt: now, updatedAt: now }).returning();
          if (!token) throw new Error("Missing receipt token");
          await this.audit(tx, actor, "receipt.link_issued", row, { tokenId: token.id });
          return { ok: true, body: { receipt: await this.detail(tx, row), share: { token: bearer, tokenId: token.id, expiresAt: token.expiresAt.toISOString() } } };
        }
        if (command.action !== "void") return receiptFailure("RECEIPT_INVALID_INPUT");
        if (row.voidedAt) return receiptFailure("RECEIPT_ALREADY_VOIDED");
        if (detail.correctionState !== "fully_corrected") return receiptFailure("RECEIPT_VOID_NOT_ALLOWED");
        const [updated] = await tx.update(receipts).set({ voidedAt: this.clock(), voidReason: command.voidReason }).where(eq(receipts.id, id)).returning(); if (!updated) throw new Error("Missing receipt");
        await this.audit(tx, actor, "receipt.voided", updated, { subscriptionId: detail.subscriptionId, fromState: "issued", toState: "voided" });
        return { ok: true, body: { receipt: await this.detail(tx, updated) } };
      });
    } catch (error) {
      if (key) await this.artifacts.remove(key);
      if (error instanceof ReceiptDomainError) return receiptFailure(error.code);
      if (error instanceof FinanceInvariantError) return receiptFailure("RECEIPT_INVALID_PAYMENT");
      const failure = dbCode(error);
      if (failure?.code === "23505") return receiptFailure(failure.constraint === "receipts_number_uq" ? "RECEIPT_NUMBER_CONFLICT" : "RECEIPT_ALREADY_EXISTS");
      if (failure?.code === "40001" || failure?.code === "40P01") return receiptFailure("RECEIPT_CONCURRENCY_CONFLICT");
      throw error;
    }
  }
}

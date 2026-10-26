import { assertCustomerWritable, type CustomerWriteScope } from "../../privacy/repositories/subject-freeze.js";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { financePaymentMethods, paymentProofStatuses, paymentProofMimeTypes, paymentProofMaxBytes, paymentProofDocumentType, paymentProofDocumentOwnerType, type PaymentProof, type PaymentProofLink, type PaymentProofErrorCode } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { subscriptions } from "../../../db/schema/customers.js";
import { paymentProofs } from "../../../db/schema/finance.js";
import { documents, documentVersions, secureAccessTokens, externalAccessEvents } from "../../../db/schema/documents.js";
import { AuditService, hashAuditContext, type AuditMetadata } from "../../auth/services/audit.service.js";
import { DrizzleFinanceRepository } from "../../finance/repositories/finance.repository.js";
import { FinanceService } from "../../finance/services/finance.service.js";
import { FinanceInvariantError } from "../../finance/services/finance.policy.js";
import { createDocumentBearer, hashDocumentBearer } from "../../documents/services/document-token.crypto.js";
import { proofFailure, proofLineage, type ProofActor, type ProofCommand, type ProofResult, type ProofStorage, type PaymentProofsRepository } from "../services/payment-proofs.types.js";
import { pgErrorInfo } from "../../../db/pg-error.js";
type Database = typeof appDb;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Proof = typeof paymentProofs.$inferSelect;
type Token = typeof secureAccessTokens.$inferSelect;
const scope = { resourceType: "subscription", action: "payment_proof_upload" };
export class DrizzlePaymentProofsRepository implements PaymentProofsRepository {
  private readonly finance: DrizzleFinanceRepository;
  constructor(private readonly database: Database, private readonly options: { auditHashPepper: string; tokenPepper: string }, private readonly storage: Pick<ProofStorage, "read">, private readonly clock: () => Date = () => new Date()) {
    this.finance = new DrizzleFinanceRepository(database, options, clock);
  }
  private audit(tx: Tx, actor: ProofActor, eventType: string, id: string, metadata: AuditMetadata) {
    return new AuditService(tx, this.options).record({ actorType: actor.userId ? "user" : "anonymous", actorUserId: actor.userId, eventType, entityType: "payment_proof", entityId: id,
      requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent, result: "success", metadata });
  }
  private access(tx: Tx, token: Token | null, actor: ProofActor, eventType: string, result: string) {
    return tx.insert(externalAccessEvents).values({ secureAccessTokenId: token?.id ?? null, eventType, result, ipHash: hashAuditContext(actor.ipAddress, this.options.auditHashPepper), userAgentHash: hashAuditContext(actor.userAgent, this.options.auditHashPepper) });
  }
  private async file(tx: Tx, p: Proof) {
    const [row] = await tx.select({ doc: documents, file: documentVersions }).from(documents).innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
      .where(and(eq(documents.id, p.documentId), eq(documents.ownerType, paymentProofDocumentOwnerType), eq(documents.ownerId, p.id), eq(documents.documentType, paymentProofDocumentType), eq(documents.currentVersionId, documentVersions.id), eq(documentVersions.malwareScanStatus, "clean")));
    if (!row || row.file.versionNumber !== 1 || !paymentProofMimeTypes.some(m => m === row.file.mimeType)) throw new Error("Invalid private proof artifact"); return row.file;
  }
  private async detail(tx: Tx, p: Proof): Promise<PaymentProof> {
    const f = await this.file(tx, p), status = paymentProofStatuses.find(s => s === p.status), method = financePaymentMethods.find(m => m === p.claimedPaymentMethod), confirmed = financePaymentMethods.find(m => m === p.confirmedPaymentMethod) ?? null;
    if (!status || !method || p.submittedVia !== "public_link") throw new Error("Invalid proof state");
    return { id: p.id, subscriptionId: p.subscriptionId, customerId: p.customerId, documentId: p.documentId, documentVersionId: f.id, status, submittedVia: "public_link", submittedAt: p.submittedAt.toISOString(),
      reviewedAt: p.reviewedAt?.toISOString() ?? null, reviewedByUserId: p.reviewedByUserId, claimedAmountXaf: p.claimedAmountXaf, claimedPaymentMethod: method, claimedOccurredAt: p.claimedOccurredAt.toISOString(), claimedExternalReference: p.claimedExternalReference,
      confirmedAmountXaf: p.confirmedAmountXaf, confirmedPaymentMethod: confirmed, confirmedOccurredAt: p.confirmedOccurredAt?.toISOString() ?? null, paymentEventId: p.paymentEventId, supersedesProofId: p.supersedesProofId,
      reviewNote: p.reviewNote, customerMessage: p.customerMessage, mimeType: f.mimeType, sizeBytes: f.sizeBytes, sha256: f.sha256 };
  }
  private link(token: Token): PaymentProofLink { return { id: token.id, expiresAt: token.expiresAt.toISOString(), revokedAt: token.revokedAt?.toISOString() ?? null, usedAt: token.usedAt?.toISOString() ?? null, supersedesProofId: proofLineage(token.contextJson).supersedesProofId }; }
  private async publicCommand(tx: Tx, id: string, c: ProofCommand, actor: ProofActor): Promise<ProofResult> {
    const [found] = await tx.select().from(secureAccessTokens).where(eq(secureAccessTokens.tokenHash, hashDocumentBearer(id, this.options.tokenPepper))).for("update");
    const token = found?.resourceType === scope.resourceType && found.action === scope.action ? found : null;
    const event = c.action === "metadata" || c.action === "upload-failed" && c.event === "view" ? "payment_proof.view" : "payment_proof.upload";
    const reject = async (error: PaymentProofErrorCode) => { await this.access(tx, token, actor, event, error); return proofFailure(error); };
    if (!token || token.maxUses !== 1 || token.requiresOtp) return reject("PAYMENT_PROOF_LINK_INVALID");
    const lineage = proofLineage(token.contextJson); if (!lineage.valid) return reject("PAYMENT_PROOF_LINK_INVALID");
    // Every proof/lineage writer locks proof before subscription; manual finance never locks a proof.
    const [parent] = lineage.supersedesProofId ? await tx.select().from(paymentProofs).where(eq(paymentProofs.id, lineage.supersedesProofId)).for("update") : [];
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, token.resourceId)).for("update");
    const now = this.clock();
    if (token.revokedAt) return reject("PAYMENT_PROOF_LINK_REVOKED");
    if (token.expiresAt <= now) return reject("PAYMENT_PROOF_LINK_EXPIRED");
    if (token.usedAt || token.useCount !== 0) return reject("PAYMENT_PROOF_LINK_CONSUMED");
    if (!sub) return reject("PAYMENT_PROOF_LINK_INVALID");
    if (lineage.supersedesProofId && (!parent || parent.status !== "correction_requested" || parent.subscriptionId !== sub.id || parent.customerId !== sub.customerId)) return reject("PAYMENT_PROOF_INVALID_STATE");
    if (c.action === "upload-failed") return reject(c.error);
    if (c.action === "metadata" || c.action === "prepare-upload") {
      if (c.action === "metadata") await this.access(tx, token, actor, event, "success");
      return { ok: true, body: { subscriptionReference: sub.reference, expiresAt: token.expiresAt.toISOString(), customerMessage: parent?.customerMessage ?? null, acceptedMimeTypes: paymentProofMimeTypes, maxBytes: paymentProofMaxBytes } };
    }
    if (c.action !== "commit-upload") return reject("PAYMENT_PROOF_INVALID_INPUT");
    if (parent) {
      const all = await tx.select().from(paymentProofs).where(eq(paymentProofs.subscriptionId, sub.id)), map = new Map(all.map(p => [p.id, p])), visited = new Set<string>();
      let ancestor: Proof | undefined = parent;
      while (ancestor) {
        if (visited.has(ancestor.id)) return reject("PAYMENT_PROOF_INVALID_STATE"); visited.add(ancestor.id);
        if ((await this.file(tx, ancestor)).sha256 === c.file.sha256) return reject("PAYMENT_PROOF_DUPLICATE_UPLOAD");
        ancestor = ancestor.supersedesProofId ? map.get(ancestor.supersedesProofId) : undefined;
      }
    }
    const proofId = randomUUID();
    const [doc] = await tx.insert(documents).values({ ownerType: paymentProofDocumentOwnerType, ownerId: proofId, documentType: paymentProofDocumentType, sensitivity: "private", status: "available", createdAt: now, updatedAt: now }).returning();
    if (!doc) throw new Error("Proof document missing");
    const [version] = await tx.insert(documentVersions).values({ documentId: doc.id, versionNumber: 1, ...c.file, malwareScanStatus: "clean", uploadedByType: "customer", createdAt: now }).returning();
    if (!version) throw new Error("Proof document version missing");
    await tx.update(documents).set({ currentVersionId: version.id }).where(eq(documents.id, doc.id));
    await tx.insert(paymentProofs).values({ id: proofId, customerId: sub.customerId, subscriptionId: sub.id, documentId: doc.id, status: "pending_review", submittedVia: "public_link", submittedAt: now, supersedesProofId: parent?.id ?? null, ...c.claims });
    if (parent) {
      await tx.update(paymentProofs).set({ status: "superseded" }).where(eq(paymentProofs.id, parent.id));
      await this.audit(tx, actor, "payment_proof.superseded", parent.id, { proofId: parent.id, subscriptionId: sub.id, fromStatus: "correction_requested", toStatus: "superseded" });
    }
    await tx.update(secureAccessTokens).set({ usedAt: now, useCount: 1, updatedAt: now }).where(eq(secureAccessTokens.id, token.id));
    await this.audit(tx, actor, "payment_proof.submitted", proofId, { proofId, subscriptionId: sub.id, documentId: doc.id, documentVersionId: version.id, tokenId: token.id, amountXaf: c.claims.claimedAmountXaf, paymentMethod: c.claims.claimedPaymentMethod, toStatus: "pending_review" });
    await this.access(tx, token, actor, event, "success"); return { ok: true, body: { submitted: true } };
  }
  /** ARCH-01 D1: subscription a proof write acts on, resolved with plain reads before the token/proof/subscription locks. */
  private async writeScope(tx: Tx, id: string, c: ProofCommand): Promise<CustomerWriteScope | null> {
    switch (c.action) {
      case "prepare-upload": case "commit-upload": {
        const [token] = await tx.select({ resourceId: secureAccessTokens.resourceId, resourceType: secureAccessTokens.resourceType }).from(secureAccessTokens).where(eq(secureAccessTokens.tokenHash, hashDocumentBearer(id, this.options.tokenPepper)));
        return token?.resourceType === scope.resourceType ? { subscriptionId: token.resourceId } : null;
      }
      case "issue-link": return { subscriptionId: id };
      case "revoke-link": {
        const [token] = await tx.select({ resourceId: secureAccessTokens.resourceId, resourceType: secureAccessTokens.resourceType }).from(secureAccessTokens).where(eq(secureAccessTokens.id, id));
        return token?.resourceType === scope.resourceType ? { subscriptionId: token.resourceId } : null;
      }
      case "confirm": case "partially-confirm": case "request-correction": case "reject": case "mark-duplicate": {
        const [proof] = await tx.select({ subscriptionId: paymentProofs.subscriptionId }).from(paymentProofs).where(eq(paymentProofs.id, id));
        return proof ? { subscriptionId: proof.subscriptionId } : null;
      }
      default: return null;
    }
  }
  async execute(id: string, c: ProofCommand, actor: ProofActor): Promise<ProofResult> {
    try {
      return await this.database.transaction(async tx => {
        await assertCustomerWritable(tx, await this.writeScope(tx, id, c));
        if (c.action === "metadata" || c.action === "prepare-upload" || c.action === "commit-upload" || c.action === "upload-failed") return this.publicCommand(tx, id, c, actor);
        if (c.action === "list") {
          const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)); if (!sub) return proofFailure("PAYMENT_PROOF_NOT_FOUND");
          const rows = await tx.select().from(paymentProofs).where(eq(paymentProofs.subscriptionId, id)).orderBy(paymentProofs.submittedAt, paymentProofs.id);
          const links = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.resourceType, scope.resourceType), eq(secureAccessTokens.action, scope.action), eq(secureAccessTokens.resourceId, id))).orderBy(secureAccessTokens.createdAt);
          const proofs: PaymentProof[] = []; for (const p of rows) proofs.push(await this.detail(tx, p)); // one tx connection: no parallel queries
          return { ok: true, body: { proofs, links: links.map(t => this.link(t)) } };
        }
        if (c.action === "issue-link") {
          const [parent] = c.supersedesProofId ? await tx.select().from(paymentProofs).where(eq(paymentProofs.id, c.supersedesProofId)).for("update") : [];
          const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for("update"); if (!sub) return proofFailure("PAYMENT_PROOF_NOT_FOUND");
          if (c.expiresAt <= this.clock()) return proofFailure("PAYMENT_PROOF_INVALID_INPUT");
          if (c.supersedesProofId && (!parent || parent.status !== "correction_requested" || parent.subscriptionId !== id || parent.customerId !== sub.customerId)) return proofFailure("PAYMENT_PROOF_INVALID_STATE");
          const raw = createDocumentBearer(), [token] = await tx.insert(secureAccessTokens).values({ tokenHash: hashDocumentBearer(raw, this.options.tokenPepper), ...scope, resourceId: id, expiresAt: c.expiresAt, maxUses: 1, contextJson: { supersedesProofId: c.supersedesProofId } }).returning();
          if (!token) throw new Error("Proof token missing");
          await this.audit(tx, actor, "payment_proof.link_issued", parent?.id ?? token.id, { subscriptionId: sub.id, tokenId: token.id, ...(parent ? { proofId: parent.id } : {}) });
          return { ok: true, body: { token: raw, link: this.link(token) } };
        }
        if (c.action === "revoke-link") {
          const [token] = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.id, id), eq(secureAccessTokens.resourceType, scope.resourceType), eq(secureAccessTokens.action, scope.action))).for("update");
          if (!token) return proofFailure("PAYMENT_PROOF_NOT_FOUND");
          if (!token.revokedAt) { await tx.update(secureAccessTokens).set({ revokedAt: this.clock(), updatedAt: this.clock() }).where(eq(secureAccessTokens.id, id)); await this.audit(tx, actor, "payment_proof.link_revoked", id, { tokenId: id, subscriptionId: token.resourceId }); }
          return { ok: true, body: { revoked: true } };
        }
        const [p] = await tx.select().from(paymentProofs).where(eq(paymentProofs.id, id)).for("update"); if (!p) return proofFailure("PAYMENT_PROOF_NOT_FOUND");
        if (c.action === "read") return { ok: true, body: { proof: await this.detail(tx, p) } };
        if (c.action === "document") {
          const f = await this.file(tx, p), bytes = await this.storage.read(f.storageKey);
          await this.audit(tx, actor, "payment_proof.document_downloaded", p.id, { proofId: p.id, subscriptionId: p.subscriptionId, documentId: p.documentId, documentVersionId: f.id });
          return { ok: true, binary: { bytes, mimeType: f.mimeType, filename: `justificatif-${p.id}.${f.mimeType === "application/pdf" ? "pdf" : f.mimeType === "image/jpeg" ? "jpg" : f.mimeType === "image/png" ? "png" : "webp"}` } };
        }
        if (p.status !== "pending_review") return proofFailure("PAYMENT_PROOF_INVALID_STATE");
        const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, p.subscriptionId)).for("update");
        if (!sub || sub.customerId !== p.customerId) return proofFailure("PAYMENT_PROOF_INVALID_STATE");
        let status: "confirmed" | "partially_confirmed" | "correction_requested" | "rejected" | "duplicate", paymentEventId: string | null = null;
        let confirmation: { confirmedAmountXaf: number; confirmedPaymentMethod: string; confirmedOccurredAt: Date } | undefined;
        if (c.action === "confirm" || c.action === "partially-confirm") {
          const facts = c.facts;
          if (c.action === "confirm" ? facts.confirmedAmountXaf !== p.claimedAmountXaf : facts.confirmedAmountXaf <= 0 || facts.confirmedAmountXaf >= p.claimedAmountXaf) return proofFailure("PAYMENT_PROOF_AMOUNT_INVALID");
          if (!actor.userId) return proofFailure("PAYMENT_PROOF_ADMIN_FORBIDDEN");
          const service = new FinanceService({ execute: (subscriptionId, command, financeActor) => command.action === "record" ? this.finance.recordPaymentInTransaction(tx, subscriptionId, command, financeActor) : Promise.resolve({ ok: false, error: "FINANCE_INVALID_INPUT" }) });
          const result = await service.execute(sub.id, "record", { amountXaf: facts.confirmedAmountXaf, paymentMethod: facts.confirmedPaymentMethod, occurredAt: facts.confirmedOccurredAt.toISOString(), externalReference: facts.externalReference, idempotencyKey: randomUUID() }, { ...actor, userId: actor.userId });
          if (!result.ok) return proofFailure("PAYMENT_PROOF_FINANCE_CONFLICT");
          if (!result.body.paymentEventId || result.body.replayed) throw new Error("Proof payment missing");
          paymentEventId = result.body.paymentEventId; status = c.action === "confirm" ? "confirmed" : "partially_confirmed";
          confirmation = { confirmedAmountXaf: facts.confirmedAmountXaf, confirmedPaymentMethod: facts.confirmedPaymentMethod, confirmedOccurredAt: facts.confirmedOccurredAt };
        } else status = c.action === "request-correction" ? "correction_requested" : c.action === "reject" ? "rejected" : "duplicate";
        const now = this.clock(), note = c.action === "confirm" || c.action === "partially-confirm" ? c.facts.reviewNote : c.reviewNote;
        const [updated] = await tx.update(paymentProofs).set({ status, paymentEventId, ...confirmation, reviewedAt: now, reviewedByUserId: actor.userId, reviewNote: note,
          customerMessage: c.action === "request-correction" ? c.customerMessage : null }).where(eq(paymentProofs.id, id)).returning();
        if (!updated) throw new Error("Proof review missing");
        await this.audit(tx, actor, `payment_proof.${status}`, id, { proofId: id, subscriptionId: sub.id, documentId: p.documentId, paymentEventId, ...(confirmation ? { amountXaf: confirmation.confirmedAmountXaf, paymentMethod: confirmation.confirmedPaymentMethod } : {}), fromStatus: "pending_review", toStatus: status });
        return { ok: true, body: { proof: await this.detail(tx, updated) } };
      });
    } catch (error) {
      if (error instanceof FinanceInvariantError) return proofFailure("PAYMENT_PROOF_FINANCE_CONFLICT");
      const code = pgErrorInfo(error)?.code;
      if (code === "23505" || code === "40001" || code === "40P01") return proofFailure("PAYMENT_PROOF_REVIEW_CONFLICT");
      throw error;
    }
  }
}

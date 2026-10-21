import { createHash } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { consentTypes, requiredConsentTypes, type ConsentDefinition, type ConsentDecision, type ConsentDetail, type ConsentErrorCode, type ConsentLinkState, type ConsentRecord, type ConsentType } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { subscriptions } from "../../../db/schema/customers.js";
import { consentDefinitions, consentRecords, onboardingItems } from "../../../db/schema/onboarding.js";
import { externalAccessEvents, secureAccessTokens } from "../../../db/schema/documents.js";
import { AuditService, hashAuditContext, type AuditMetadata } from "../../auth/services/audit.service.js";
import { currentDecisions, latestDefinitions, requiredBundle, type ConsentActor, type ConsentCommand, type ConsentRepository, type ConsentResult } from "../services/consent.service.js";
import { consentTokenScope, createConsentToken, hashConsentToken, validateConsentToken } from "../services/consent-token.crypto.js";

type Database = typeof appDb;
export type ConsentTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DefinitionRow = typeof consentDefinitions.$inferSelect;
type TokenRow = typeof secureAccessTokens.$inferSelect;
type SubscriptionRow = typeof subscriptions.$inferSelect;
const failure = (error: ConsentErrorCode): ConsentResult => ({ ok: false, error });
class RejectedConsentAccess extends Error {
  constructor(readonly code: ConsentErrorCode) { super(code); }
}
const typeIsValid = (value: string): value is ConsentType => consentTypes.some(type => type === value);
function definitionDto(row: DefinitionRow): ConsentDefinition {
  if (!typeIsValid(row.consentType) || !["draft", "published", "retired"].some(status => status === row.status)) throw new Error("Invalid consent definition state");
  if (row.status !== "draft" && (!row.publishedAt || row.contentHash !== createHash("sha256").update(row.content).digest("hex"))) throw new Error("Invalid published consent evidence");
  return { id: row.id, consentType: row.consentType, version: row.version, title: row.title, content: row.content, contentHash: row.contentHash,
    status: row.status as ConsentDefinition["status"], publishedAt: row.publishedAt?.toISOString() ?? null, retiredAt: row.retiredAt?.toISOString() ?? null };
}
export async function lockConsentDefinitions(tx: ConsentTransaction): Promise<void> {
  // Definition publication and every acceptance/readiness check share this lock.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('kfit:consent-definitions', 0))`);
}
export async function readConsentEvidence(tx: ConsentTransaction, subscriptionId: string) {
  const definitions = (await tx.select().from(consentDefinitions)).map(definitionDto);
  const rows = await tx.select({ record: consentRecords, definition: consentDefinitions }).from(consentRecords)
    .innerJoin(consentDefinitions, eq(consentRecords.consentDefinitionId, consentDefinitions.id))
    .where(eq(consentRecords.subscriptionId, subscriptionId)).orderBy(desc(consentRecords.capturedAt));
  const history: ConsentRecord[] = rows.map(({ record, definition }) => {
    if (!typeIsValid(definition.consentType) || !["granted", "refused", "revoked"].includes(record.decision)
      || !["public_link", "coach_assisted"].includes(record.capturedVia)) throw new Error("Invalid consent history");
    return { id: record.id, consentType: definition.consentType, consentDefinitionId: record.consentDefinitionId, definitionVersion: definition.version,
      decision: record.decision as ConsentDecision, capturedVia: record.capturedVia as ConsentRecord["capturedVia"], capturedAt: record.capturedAt.toISOString(),
      capturedByUserId: record.capturedByUserId, secureAccessTokenId: record.secureAccessTokenId, supersedesConsentRecordId: record.supersedesConsentRecordId };
  });
  const current = currentDecisions(history);
  return { definitions, history, current, bundle: requiredBundle(definitions, current ?? []) };
}
function tokenDefinitionIds(token: TokenRow): string[] | null {
  const context = token.contextJson;
  if (!context || typeof context !== "object" || !("definitionIds" in context) || !Array.isArray(context.definitionIds)
    || context.definitionIds.length !== 2 || !context.definitionIds.every(id => typeof id === "string")) return null;
  return context.definitionIds;
}
function linkState(token: TokenRow, definitions: ConsentDefinition[]): ConsentLinkState {
  const error = validateConsentToken(token);
  const ids = tokenDefinitionIds(token);
  const latest = latestDefinitions(definitions).filter(d => requiredConsentTypes.some(type => type === d.consentType));
  const stale = !ids || latest.length !== 2 || !latest.every(d => ids.includes(d.id));
  return { id: token.id, expiresAt: token.expiresAt.toISOString(), state: error === "CONSENT_LINK_REVOKED" ? "revoked"
    : error === "CONSENT_LINK_CONSUMED" ? "consumed" : error === "CONSENT_LINK_EXPIRED" ? "expired" : error || stale ? "stale" : "available" };
}

export class DrizzleConsentRepository implements ConsentRepository {
  constructor(private readonly database: Database, private readonly options: { auditHashPepper: string }) {}
  private audit(tx: ConsentTransaction, actor: ConsentActor, subscriptionId: string, eventType: string, metadata: AuditMetadata) {
    return new AuditService(tx, this.options).record({ actorType: actor.userId ? "user" : "anonymous", actorUserId: actor.userId,
      requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent, eventType, entityType: "subscription", entityId: subscriptionId, result: "success", metadata });
  }
  private async detail(tx: ConsentTransaction, subscription: SubscriptionRow): Promise<ConsentResult> {
    const evidence = await readConsentEvidence(tx, subscription.id);
    if (!evidence.current) return failure("CONSENT_HISTORY_INVALID");
    const tokens = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.resourceType, consentTokenScope.resourceType),
      eq(secureAccessTokens.resourceId, subscription.id), eq(secureAccessTokens.action, consentTokenScope.action))).orderBy(desc(secureAccessTokens.createdAt));
    const detail: ConsentDetail = { subscription: { id: subscription.id, reference: subscription.reference }, definitions: evidence.definitions,
      history: evidence.history, current: evidence.current, requiredBundle: evidence.bundle, links: tokens.map(t => linkState(t, evidence.definitions)) };
    return { ok: true, body: { consents: detail } };
  }
  private async append(tx: ConsentTransaction, subscription: SubscriptionRow, decisions: { definition: ConsentDefinition; decision: ConsentDecision }[],
    actor: ConsentActor, tokenId: string | null): Promise<ConsentResult | null> {
    const evidence = await readConsentEvidence(tx, subscription.id);
    if (!evidence.current) return failure("CONSENT_HISTORY_INVALID");
    for (const { definition, decision } of decisions) {
      const prior = evidence.current.find(record => record.consentType === definition.consentType);
      if (decision === "revoked" && (!prior || prior.decision !== "granted")) return failure("CONSENT_DECISION_MISSING");
      const [record] = await tx.insert(consentRecords).values({ customerId: subscription.customerId, subscriptionId: subscription.id,
        consentDefinitionId: definition.id, decision, capturedVia: tokenId ? "public_link" : "coach_assisted", capturedByUserId: actor.userId,
        secureAccessTokenId: tokenId, supersedesConsentRecordId: prior?.id ?? null, capturedAt: new Date(),
      }).returning();
      if (!record) throw new Error("Consent insert did not return a row");
      await this.audit(tx, actor, subscription.id, decision === "revoked" ? "consent.revoked" : "consent.decision_recorded", {
        consentType: definition.consentType, definitionId: definition.id, definitionVersion: definition.version, decision,
        capturedVia: tokenId ? "public_link" : "coach_assisted", subscriptionId: subscription.id, secureAccessTokenId: tokenId,
      });
    }
    if (decisions.some(({ definition }) => requiredConsentTypes.some(type => type === definition.consentType))) {
      const after = await readConsentEvidence(tx, subscription.id);
      const [item] = await tx.select().from(onboardingItems).where(and(eq(onboardingItems.subscriptionId, subscription.id), eq(onboardingItems.itemType, "service_terms")));
      const status = after.bundle.satisfied ? "completed" : "pending";
      if (!item || item.status !== status) {
        await tx.insert(onboardingItems).values({ subscriptionId: subscription.id, itemType: "service_terms", label: "Conditions de service et confidentialité",
          status, isBlocking: true, completedAt: status === "completed" ? new Date() : null }).onConflictDoUpdate({
          target: [onboardingItems.subscriptionId, onboardingItems.itemType], set: { status, completedAt: status === "completed" ? new Date() : null,
            waivedAt: null, waiverReason: null, isBlocking: true, updatedAt: new Date() },
        });
        if (status === "completed" || item?.status === "completed") await this.audit(tx, actor, subscription.id,
          status === "completed" ? "subscription.onboarding_item_completed" : "subscription.onboarding_item_reopened", { itemType: "service_terms", toStatus: status });
      }
    }
    return null;
  }
  async execute(subscriptionId: string, command: ConsentCommand, actor: ConsentActor): Promise<ConsentResult> {
    return this.database.transaction(async tx => {
      const [subscription] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).for("update");
      if (!subscription) return failure("CONSENT_NOT_FOUND");
      await lockConsentDefinitions(tx);
      if (command.action === "read") return this.detail(tx, subscription);
      if (command.action !== "revoke_link" && command.action !== "revoke" && subscription.status !== "onboarding") return failure("CONSENT_INVALID_STATE");
      const evidence = await readConsentEvidence(tx, subscriptionId);
      if (!evidence.current) return failure("CONSENT_HISTORY_INVALID");
      if (command.action === "revoke_link") {
        const [token] = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.id, command.tokenId),
          eq(secureAccessTokens.resourceId, subscriptionId), eq(secureAccessTokens.resourceType, consentTokenScope.resourceType), eq(secureAccessTokens.action, consentTokenScope.action))).for("update");
        if (!token) return failure("CONSENT_NOT_FOUND");
        if (!token.revokedAt) {
          await tx.update(secureAccessTokens).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(secureAccessTokens.id, token.id));
          await this.audit(tx, actor, subscriptionId, "consent.link_revoked", { secureAccessTokenId: token.id });
        }
      } else if (command.action === "revoke") {
        if (requiredConsentTypes.some(type => type === command.consentType)) return failure("CONSENT_REVOCATION_FORBIDDEN");
        const prior = evidence.current.find(record => record.consentType === command.consentType);
        const definition = evidence.definitions.find(d => d.id === prior?.consentDefinitionId);
        if (!definition || prior?.decision !== "granted") return failure("CONSENT_DECISION_MISSING");
        const error = await this.append(tx, subscription, [{ definition, decision: "revoked" }], actor, null);
        if (error) return error;
      } else {
        if (evidence.bundle.missingDefinitions.length) return failure("CONSENT_DEFINITIONS_MISSING");
        const definitions = latestDefinitions(evidence.definitions).filter(d => requiredConsentTypes.some(type => type === d.consentType));
        if (command.action === "capture" && (command.expectedDefinitionIds.length !== 2 || !definitions.every(d => command.expectedDefinitionIds.includes(d.id)))) return failure("CONSENT_DEFINITIONS_CHANGED");
        if (command.action === "issue") {
          if (command.expiresAt.getTime() <= Date.now()) return failure("CONSENT_INVALID_INPUT");
          const token = createConsentToken();
          const [row] = await tx.insert(secureAccessTokens).values({ tokenHash: hashConsentToken(token), ...consentTokenScope,
            resourceId: subscriptionId, expiresAt: command.expiresAt, maxUses: 1, contextJson: { definitionIds: definitions.map(d => d.id) } }).returning();
          if (!row) throw new Error("Consent token insert did not return a row");
          await this.audit(tx, actor, subscriptionId, "consent.link_created", { subscriptionId, secureAccessTokenId: row.id });
          return { ok: true, body: { token, link: linkState(row, evidence.definitions) } };
        }
        const error = await this.append(tx, subscription, definitions.map(definition => ({ definition,
          decision: command.decisions[definition.consentType as "service_terms" | "privacy_notice"] })), actor, null);
        if (error) return error;
      }
      return this.detail(tx, subscription);
    });
  }
  async publicAccess(rawToken: string, decisions: import("@kfit/shared").ConsentDecisions | null, actor: ConsentActor, rejectedInput?: "CONSENT_INVALID_INPUT"): Promise<ConsentResult> {
    let attemptedTokenId: string | null = null;
    try { return await this.database.transaction(async tx => {
      const [initial] = /^[A-Za-z0-9_-]{43}$/.test(rawToken) ? await tx.select().from(secureAccessTokens).where(eq(secureAccessTokens.tokenHash, hashConsentToken(rawToken))) : [];
      attemptedTokenId = initial?.id ?? null;
      const event = (tokenId: string | null, result: string) => tx.insert(externalAccessEvents).values({ secureAccessTokenId: tokenId,
        eventType: decisions || rejectedInput ? "consent.submit" : "consent.view", result, ipHash: hashAuditContext(actor.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(actor.userAgent, this.options.auditHashPepper) });
      if (rejectedInput) { await event(attemptedTokenId, rejectedInput); return failure(rejectedInput); }
      if (!initial) { await event(null, "CONSENT_LINK_INVALID"); return failure("CONSENT_LINK_INVALID"); }
      // Same lock order for public submission, coach capture, link revocation and readiness.
      const [subscription] = await tx.select().from(subscriptions).where(eq(subscriptions.id, initial.resourceId)).for("update");
      const [token] = await tx.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, initial.id)).for("update");
      const invalid = token ? validateConsentToken(token) : "CONSENT_LINK_INVALID";
      if (invalid || !subscription || !token) { const error = invalid ?? "CONSENT_LINK_INVALID"; await event(initial.id, error); return failure(error); }
      await lockConsentDefinitions(tx);
      if (subscription.status !== "onboarding") { await event(token.id, "CONSENT_INVALID_STATE"); return failure("CONSENT_INVALID_STATE"); }
      const evidence = await readConsentEvidence(tx, subscription.id);
      const afterWaitError = validateConsentToken(token);
      if (afterWaitError) { await event(token.id, afterWaitError); return failure(afterWaitError); }
      if (!evidence.current) { await event(token.id, "CONSENT_HISTORY_INVALID"); return failure("CONSENT_HISTORY_INVALID"); }
      if (linkState(token, evidence.definitions).state !== "available") { await event(token.id, "CONSENT_LINK_STALE"); return failure("CONSENT_LINK_STALE"); }
      const definitions = latestDefinitions(evidence.definitions).filter(d => requiredConsentTypes.some(type => type === d.consentType));
      if (!decisions) {
        await event(token.id, "success");
        return { ok: true, body: { document: { subscriptionReference: subscription.reference, definitions } } };
      }
      const error = await this.append(tx, subscription, definitions.map(definition => ({ definition,
        decision: decisions[definition.consentType as "service_terms" | "privacy_notice"] })), { ...actor, userId: null }, token.id);
      if (error) { await event(token.id, error.ok ? "failure" : error.error); return error; }
      const consumed = await tx.update(secureAccessTokens).set({ usedAt: new Date(), useCount: 1, updatedAt: new Date() })
        .where(and(eq(secureAccessTokens.id, token.id), gt(secureAccessTokens.expiresAt, sql`clock_timestamp()`))).returning({ id: secureAccessTokens.id });
      if (consumed.length !== 1) throw new RejectedConsentAccess("CONSENT_LINK_EXPIRED");
      await event(token.id, "success");
      return { ok: true, body: { accepted: true } };
    }); } catch (error) {
      // Business transaction has rolled back. Only sanitized failure evidence survives.
      await this.database.insert(externalAccessEvents).values({ secureAccessTokenId: attemptedTokenId, eventType: decisions || rejectedInput ? "consent.submit" : "consent.view",
        result: error instanceof RejectedConsentAccess ? error.code : "CONSENT_ROUTE_UNEXPECTED_FAILURE", ipHash: hashAuditContext(actor.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(actor.userAgent, this.options.auditHashPepper) });
      if (error instanceof RejectedConsentAccess) return failure(error.code);
      throw error;
    }
  }
  // Internal definition storage boundary; no publishing/editing HTTP workflow in S4.4.
  async saveDefinition(input: { id?: string; consentType: ConsentType; version: string; title: string; content: string; publish: boolean }): Promise<{ ok: true; definition: ConsentDefinition } | { ok: false; error: ConsentErrorCode }> {
    if (!/^[1-9][0-9]*$/.test(input.version) || !input.content.trim() || !input.title.trim()) return { ok: false, error: "CONSENT_INVALID_INPUT" };
    return this.database.transaction(async tx => {
      await lockConsentDefinitions(tx);
      const rows = await tx.select().from(consentDefinitions).where(eq(consentDefinitions.consentType, input.consentType));
      const existing = rows.find(row => row.id === input.id);
      if (input.id && (!existing || existing.status !== "draft" || existing.publishedAt)) return { ok: false, error: "CONSENT_DEFINITION_IMMUTABLE" };
      if (rows.some(row => row.id !== input.id && row.version === input.version)) return { ok: false, error: "CONSENT_VERSION_CONFLICT" };
      if (input.publish && rows.some(row => row.publishedAt && BigInt(row.version) >= BigInt(input.version))) return { ok: false, error: "CONSENT_VERSION_CONFLICT" };
      const values = { consentType: input.consentType, version: input.version, title: input.title, content: input.content,
        contentHash: createHash("sha256").update(input.content).digest("hex"), status: input.publish ? "published" : "draft",
        publishedAt: input.publish ? new Date() : null, updatedAt: new Date() };
      const [row] = existing ? await tx.update(consentDefinitions).set(values).where(and(eq(consentDefinitions.id, existing.id), eq(consentDefinitions.status, "draft"))).returning()
        : await tx.insert(consentDefinitions).values(values).returning();
      if (!row) throw new Error("Definition write did not return a row");
      return { ok: true, definition: definitionDto(row) };
    });
  }
}

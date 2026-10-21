import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { validateQuestionnaireAnswers, parseQuestionnaireAnswers, type ConsentLinkState, type PublicQuestionnaireSubmitInput, type QuestionnaireDetail,
  type QuestionnaireDocument, type QuestionnaireErrorCode, type QuestionnaireRevision, type QuestionnaireSubmitInput } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { subscriptions } from "../../../db/schema/customers.js";
import { services, serviceVariants, servicePolicies } from "../../../db/schema/catalogue.js";
import { questionnaireAnswers, questionnaireSubmissions, questionnaireTemplates } from "../../../db/schema/questionnaires.js";
import { consentRecords, medicalClearanceRecords, onboardingItems } from "../../../db/schema/onboarding.js";
import { secureAccessTokens, externalAccessEvents } from "../../../db/schema/documents.js";
import { AuditService, hashAuditContext } from "../../auth/services/audit.service.js";
import { latestDefinitions } from "../../consents/services/consent.service.js";
import { lockConsentDefinitions, readConsentEvidence, type ConsentTransaction } from "../../consents/repositories/consent.repository.js";
import { loadQuestionnaireTemplate, lockQuestionnaireTemplates } from "./template.repository.js";
import { evaluateQuestionnaireRisk } from "../services/risk-evaluator.js";
import { questionnaireFailure, type QuestionnaireActor, type QuestionnaireCommand, type QuestionnaireRepository, type QuestionnaireResult } from "../services/questionnaire.service.js";
type Subscription = typeof subscriptions.$inferSelect;
type Token = typeof secureAccessTokens.$inferSelect;
export const questionnaireTokenScope = { resourceType: "subscription", action: "questionnaire_submit" } as const;
export const hashQuestionnaireToken = (token: string) => createHash("sha256").update(token).digest("hex");
type TokenContext = { subscriptionId: string; templateId: string; templateVersion: number; schemaHash: string; expectedHeadId: string | null; healthDefinitionId: string | null };
class RejectedQuestionnaireAccess extends Error { constructor(readonly code: QuestionnaireErrorCode) { super(code); } }
export function validateQuestionnaireToken(token: Token): QuestionnaireErrorCode | null {
  if (token.resourceType !== questionnaireTokenScope.resourceType || token.action !== questionnaireTokenScope.action || token.requiresOtp || token.maxUses !== 1) return "QUESTIONNAIRE_LINK_INVALID";
  if (token.revokedAt) return "QUESTIONNAIRE_LINK_REVOKED";
  if (token.usedAt || token.useCount !== 0) return "QUESTIONNAIRE_LINK_CONSUMED";
  return token.expiresAt.getTime() <= Date.now() ? "QUESTIONNAIRE_LINK_EXPIRED" : null;
}
function contextFor(document: QuestionnaireDocument, subscriptionId: string): TokenContext {
  return { subscriptionId, templateId: document.template.id, templateVersion: document.template.version, schemaHash: document.template.schemaHash,
    expectedHeadId: document.expectedHeadId, healthDefinitionId: document.healthConsent?.definition.id ?? null };
}
function matchesContext(value: unknown, expected: TokenContext): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(expected).every(([key, entry]) => key in value && Reflect.get(value, key) === entry);
}
function publicLinkState(token: Token, document: QuestionnaireDocument | null): ConsentLinkState {
  const error = validateQuestionnaireToken(token);
  return { id: token.id, expiresAt: token.expiresAt.toISOString(), state: error === "QUESTIONNAIRE_LINK_CONSUMED" ? "consumed" : error === "QUESTIONNAIRE_LINK_REVOKED" ? "revoked"
    : error === "QUESTIONNAIRE_LINK_EXPIRED" ? "expired" : error || !document || !matchesContext(token.contextJson, contextFor(document, token.resourceId)) ? "stale" : "available" };
}
type Assignment = { ok: true; document: QuestionnaireDocument | null; history: QuestionnaireRevision[]; medicalPolicy: "not_required" | "required_if_risk_flag" }
  | { ok: false; error: QuestionnaireErrorCode };
export class DrizzleQuestionnaireRepository implements QuestionnaireRepository {
  constructor(private readonly database: typeof appDb, private readonly options: { auditHashPepper: string }) {}
  private audit(tx: ConsentTransaction, actor: QuestionnaireActor, subscriptionId: string, eventType: string, metadata: import("../../auth/services/audit.service.js").AuditMetadata) {
    return new AuditService(tx, this.options).record({ actorType: actor.userId ? "user" : "anonymous", actorUserId: actor.userId, requestId: actor.requestId,
      ipAddress: actor.ipAddress, userAgent: actor.userAgent, eventType, entityType: "subscription", entityId: subscriptionId, result: "success", metadata });
  }
  private async assignment(tx: ConsentTransaction, subscription: Subscription): Promise<Assignment> {
    // Shared catalogue owner locks serialize effective policy with other operational writers.
    const [service] = await tx.select().from(services).where(eq(services.id, subscription.serviceId)).for("update");
    if (!service) return { ok: false, error: "QUESTIONNAIRE_ASSIGNMENT_INVALID" };
    if (subscription.variantId) {
      const [variant] = await tx.select().from(serviceVariants).where(and(eq(serviceVariants.id, subscription.variantId), eq(serviceVariants.serviceId, service.id))).for("update");
      if (!variant) return { ok: false, error: "QUESTIONNAIRE_ASSIGNMENT_INVALID" };
    }
    const policies = await tx.select().from(servicePolicies).where(and(eq(servicePolicies.serviceId, subscription.serviceId),
      subscription.variantId ? or(isNull(servicePolicies.variantId), eq(servicePolicies.variantId, subscription.variantId)) : isNull(servicePolicies.variantId))).for("share");
    const specific = policies.filter(p => p.variantId === subscription.variantId && p.variantId !== null);
    const selected = specific.length ? specific : policies.filter(p => p.variantId === null);
    if (selected.length > 1 || selected[0]?.medicalClearancePolicy && !["not_required", "required_if_risk_flag"].includes(selected[0].medicalClearancePolicy)) return { ok: false, error: "QUESTIONNAIRE_ASSIGNMENT_INVALID" };
    const medicalPolicy = selected[0]?.medicalClearancePolicy === "required_if_risk_flag" ? "required_if_risk_flag" : "not_required";
    await lockQuestionnaireTemplates(tx);
    const templateId = selected[0]?.questionnaireTemplateId;
    if (!templateId) return { ok: true, document: null, history: [], medicalPolicy };
    const template = await loadQuestionnaireTemplate(tx, templateId);
    if (!template || template.status !== "published" || !template.publishedAt) return { ok: false, error: "QUESTIONNAIRE_ASSIGNMENT_INVALID" };
    const rows = await tx.select({ submission: questionnaireSubmissions }).from(questionnaireSubmissions)
      .innerJoin(questionnaireTemplates, eq(questionnaireSubmissions.templateId, questionnaireTemplates.id))
      .where(and(eq(questionnaireSubmissions.subscriptionId, subscription.id), eq(questionnaireTemplates.templateKey, template.templateKey))).orderBy(asc(questionnaireSubmissions.revisionNumber));
    const superseded = new Set(rows.flatMap(({ submission: row }) => row.supersedesSubmissionId ? [row.supersedesSubmissionId] : []));
    const heads = rows.filter(({ submission: row }) => !superseded.has(row.id));
    if (heads.length > 1 || rows.some(({ submission: row }) => row.status !== "submitted" || !row.submittedAt || !["public_link", "coach_assisted"].includes(row.source))) return { ok: false, error: "QUESTIONNAIRE_HISTORY_INVALID" };
    const history: QuestionnaireRevision[] = rows.map(({ submission: row }) => ({ id: row.id, templateId: row.templateId, templateVersion: row.templateVersion,
      revisionNumber: row.revisionNumber, supersedesSubmissionId: row.supersedesSubmissionId, submittedAt: row.submittedAt!.toISOString(),
      source: row.source as QuestionnaireRevision["source"], enteredByUserId: row.enteredByUserId, isCurrent: heads[0]?.submission.id === row.id }));
    await lockConsentDefinitions(tx);
    let healthConsent: QuestionnaireDocument["healthConsent"] = null;
    if (template.category === "health") {
      const evidence = await readConsentEvidence(tx, subscription.id);
      if (!evidence.current) return { ok: false, error: "QUESTIONNAIRE_HISTORY_INVALID" };
      const definition = latestDefinitions(evidence.definitions).find(d => d.consentType === "health_data");
      if (!definition) return { ok: false, error: "QUESTIONNAIRE_HEALTH_DEFINITION_MISSING" };
      healthConsent = { definition, granted: evidence.current.some(r => r.consentType === "health_data" && r.consentDefinitionId === definition.id && r.decision === "granted") };
    }
    return { ok: true, document: { subscriptionReference: subscription.reference, template, expectedHeadId: heads[0]?.submission.id ?? null, healthConsent }, history, medicalPolicy };
  }
  private async detail(tx: ConsentTransaction, subscription: Subscription, assignment: Extract<Assignment, { ok: true }>): Promise<QuestionnaireResult> {
    const [item] = await tx.select().from(onboardingItems).where(and(eq(onboardingItems.subscriptionId, subscription.id), eq(onboardingItems.itemType, "questionnaire")));
    const tokens = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.resourceType, questionnaireTokenScope.resourceType), eq(secureAccessTokens.resourceId, subscription.id), eq(secureAccessTokens.action, questionnaireTokenScope.action)));
    const questionnaire: QuestionnaireDetail = { document: assignment.document, history: assignment.history, waived: item?.status === "waived",
      links: tokens.map(token => publicLinkState(token, assignment.document)) };
    return { ok: true, body: { questionnaire } };
  }
  private async appendHealthDecision(tx: ConsentTransaction, subscription: Subscription, document: QuestionnaireDocument, decision: "granted" | "refused", actor: QuestionnaireActor, tokenId: string): Promise<void> {
    const definition = document.healthConsent!.definition;
    const evidence = await readConsentEvidence(tx, subscription.id);
    if (!evidence.current) throw new RejectedQuestionnaireAccess("QUESTIONNAIRE_HISTORY_INVALID");
    const prior = evidence.current.find(record => record.consentType === "health_data");
    await tx.insert(consentRecords).values({ customerId: subscription.customerId, subscriptionId: subscription.id, consentDefinitionId: definition.id,
      decision, capturedVia: "public_link", capturedByUserId: null, secureAccessTokenId: tokenId, supersedesConsentRecordId: prior?.id ?? null, capturedAt: new Date() });
    await this.audit(tx, actor, subscription.id, "consent.decision_recorded", { consentType: "health_data", definitionId: definition.id,
      definitionVersion: definition.version, decision, capturedVia: "public_link", subscriptionId: subscription.id, secureAccessTokenId: tokenId });
  }
  private async submit(tx: ConsentTransaction, subscription: Subscription, assignment: Extract<Assignment, { ok: true }>, input: QuestionnaireSubmitInput,
    actor: QuestionnaireActor, publicContext: { tokenId: string; healthDataDecision?: "granted" | "refused" } | null): Promise<QuestionnaireResult> {
    const document = assignment.document;
    if (!document) return questionnaireFailure("QUESTIONNAIRE_NOT_ASSIGNED");
    if (input.templateId !== document.template.id || input.templateVersion !== document.template.version || input.schemaHash !== document.template.schemaHash) return questionnaireFailure("QUESTIONNAIRE_STALE_SCHEMA");
    if (input.expectedHeadId !== document.expectedHeadId) return questionnaireFailure("QUESTIONNAIRE_STALE_REVISION");
    const answers = parseQuestionnaireAnswers(input.answers);
    if (!answers || answers.some(a => !document.template.questions.some(q => q.id === a.questionId))) return questionnaireFailure("QUESTIONNAIRE_ANSWERS_INVALID");
    if (document.template.category === "assessment" && publicContext?.healthDataDecision !== undefined) return questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
    if (document.healthConsent && publicContext?.healthDataDecision === "refused") {
      await this.appendHealthDecision(tx, subscription, document, "refused", actor, publicContext.tokenId);
      return { ok: true, body: { result: { outcome: "health_consent_refused", submissionId: null, revisionNumber: null } } };
    }
    if (document.healthConsent && !document.healthConsent.granted && publicContext?.healthDataDecision !== "granted") return questionnaireFailure("QUESTIONNAIRE_HEALTH_CONSENT_REQUIRED");
    if (!validateQuestionnaireAnswers(document.template.questions, answers)) return questionnaireFailure("QUESTIONNAIRE_ANSWERS_INVALID");
    const risk = evaluateQuestionnaireRisk(document.template, answers);
    const activeMedical = risk.riskDetected && assignment.medicalPolicy === "required_if_risk_flag" ? await tx.select().from(medicalClearanceRecords)
      .where(and(eq(medicalClearanceRecords.subscriptionId, subscription.id), inArray(medicalClearanceRecords.status, ["required", "pending", "awaiting_document", "under_review"]))) : [];
    if (activeMedical.length > 1) return questionnaireFailure("QUESTIONNAIRE_HISTORY_INVALID");
    if (document.healthConsent && publicContext?.healthDataDecision === "granted") await this.appendHealthDecision(tx, subscription, document, "granted", actor, publicContext.tokenId);
    const prior = assignment.history.find(row => row.isCurrent); const revisionNumber = (prior?.revisionNumber ?? 0) + 1;
    const [submission] = await tx.insert(questionnaireSubmissions).values({ subscriptionId: subscription.id, templateId: document.template.id,
      templateVersion: document.template.version, revisionNumber, status: "submitted", submittedAt: new Date(), supersedesSubmissionId: prior?.id ?? null,
      enteredByUserId: publicContext ? null : actor.userId, source: publicContext ? "public_link" : "coach_assisted" }).returning();
    if (!submission) throw new Error("Questionnaire submission insert did not return a row");
    if (answers.length) await tx.insert(questionnaireAnswers).values(answers.map(answer => ({ submissionId: submission.id, questionId: answer.questionId,
      answerJson: answer.value === null ? sql`'null'::jsonb` : answer.value })));
    const [item] = await tx.select().from(onboardingItems).where(and(eq(onboardingItems.subscriptionId, subscription.id), eq(onboardingItems.itemType, "questionnaire")));
    if (item?.status !== "waived" && item?.status !== "completed") {
      await tx.insert(onboardingItems).values({ subscriptionId: subscription.id, itemType: "questionnaire", label: "Questionnaire complété", status: "completed", isBlocking: true, completedAt: new Date() })
        .onConflictDoUpdate({ target: [onboardingItems.subscriptionId, onboardingItems.itemType], set: { status: "completed", isBlocking: true, completedAt: new Date(), updatedAt: new Date() } });
      await this.audit(tx, actor, subscription.id, "subscription.onboarding_item_completed", { itemType: "questionnaire", submissionId: submission.id });
    }
    if (risk.riskDetected && assignment.medicalPolicy === "required_if_risk_flag") {
      let medical = activeMedical[0];
      if (!medical) {
        [medical] = await tx.insert(medicalClearanceRecords).values({ subscriptionId: subscription.id, status: "required", triggerSource: `questionnaire:${submission.id}` }).returning();
        if (!medical) throw new Error("Medical requirement insert did not return a row");
        await this.audit(tx, actor, subscription.id, "medical_clearance.required", { submissionId: submission.id, medicalClearanceRecordId: medical.id });
      }
      await tx.insert(onboardingItems).values({ subscriptionId: subscription.id, itemType: "medical_clearance", label: "Validation médicale requise", status: "pending", isBlocking: true })
        .onConflictDoUpdate({ target: [onboardingItems.subscriptionId, onboardingItems.itemType], set: { status: "pending", isBlocking: true, completedAt: null, waivedAt: null, waiverReason: null, updatedAt: new Date() } });
    }
    await this.audit(tx, actor, subscription.id, prior ? "questionnaire.revision_submitted" : "questionnaire.submitted", {
      submissionId: submission.id, templateId: document.template.id, templateVersion: document.template.version, revisionNumber, source: publicContext ? "public_link" : "coach_assisted" });
    if (risk.riskDetected) await this.audit(tx, actor, subscription.id, "questionnaire.risk_flagged", { submissionId: submission.id, riskDetected: true, matchedQuestionCount: risk.matchedQuestionKeys.length });
    return { ok: true, body: { result: { outcome: "submitted", submissionId: submission.id, revisionNumber } } };
  }
  async execute(subscriptionId: string, command: QuestionnaireCommand, actor: QuestionnaireActor): Promise<QuestionnaireResult> {
    return this.database.transaction(async tx => {
      const [subscription] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).for("update");
      if (!subscription) return questionnaireFailure("QUESTIONNAIRE_NOT_FOUND");
      if (command.action !== "read" && command.action !== "revoke_link" && subscription.status !== "onboarding") return questionnaireFailure("QUESTIONNAIRE_INVALID_STATE");
      if (command.action === "revoke_link") {
        const [token] = await tx.select().from(secureAccessTokens).where(and(eq(secureAccessTokens.id, command.tokenId), eq(secureAccessTokens.resourceId, subscriptionId),
          eq(secureAccessTokens.resourceType, questionnaireTokenScope.resourceType), eq(secureAccessTokens.action, questionnaireTokenScope.action))).for("update");
        if (!token) return questionnaireFailure("QUESTIONNAIRE_NOT_FOUND");
        if (!token.revokedAt) { await tx.update(secureAccessTokens).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(secureAccessTokens.id, token.id));
          await this.audit(tx, actor, subscriptionId, "questionnaire.link_revoked", { secureAccessTokenId: token.id }); }
        return { ok: true, body: { revoked: true } };
      }
      const assignment = await this.assignment(tx, subscription); if (!assignment.ok) return assignment;
      if (command.action === "read") return this.detail(tx, subscription, assignment);
      if (!assignment.document) return questionnaireFailure("QUESTIONNAIRE_NOT_ASSIGNED");
      if (command.action === "submit") return this.submit(tx, subscription, assignment, command.input, actor, null);
      if (command.expiresAt.getTime() <= Date.now()) return questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
      const token = randomBytes(32).toString("base64url");
      const [row] = await tx.insert(secureAccessTokens).values({ ...questionnaireTokenScope, resourceId: subscriptionId, tokenHash: hashQuestionnaireToken(token),
        contextJson: contextFor(assignment.document, subscriptionId), maxUses: 1, expiresAt: command.expiresAt }).returning();
      if (!row) throw new Error("Questionnaire token insert did not return a row");
      await this.audit(tx, actor, subscriptionId, "questionnaire.link_created", { secureAccessTokenId: row.id, templateId: assignment.document.template.id, templateVersion: assignment.document.template.version });
      return { ok: true, body: { token, link: publicLinkState(row, assignment.document) } };
    });
  }
  async publicAccess(rawToken: string, input: PublicQuestionnaireSubmitInput | null, actor: QuestionnaireActor, rejectedInput = false): Promise<QuestionnaireResult> {
    let tokenId: string | null = null;
    const event = (target: Pick<ConsentTransaction, "insert">, result: string) => target.insert(externalAccessEvents).values({ secureAccessTokenId: tokenId,
      eventType: input || rejectedInput ? "questionnaire.submit" : "questionnaire.view", result, ipHash: hashAuditContext(actor.ipAddress, this.options.auditHashPepper), userAgentHash: hashAuditContext(actor.userAgent, this.options.auditHashPepper) });
    try { return await this.database.transaction(async tx => {
      const [initial] = /^[A-Za-z0-9_-]{43}$/.test(rawToken) ? await tx.select().from(secureAccessTokens).where(eq(secureAccessTokens.tokenHash, hashQuestionnaireToken(rawToken))) : [];
      tokenId = initial?.id ?? null;
      if (rejectedInput) { await event(tx, "QUESTIONNAIRE_INVALID_INPUT"); return questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT"); }
      if (!initial) { await event(tx, "QUESTIONNAIRE_LINK_INVALID"); return questionnaireFailure("QUESTIONNAIRE_LINK_INVALID"); }
      const [subscription] = await tx.select().from(subscriptions).where(eq(subscriptions.id, initial.resourceId)).for("update");
      const [token] = await tx.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, initial.id)).for("update");
      const invalid = token ? validateQuestionnaireToken(token) : "QUESTIONNAIRE_LINK_INVALID";
      if (!subscription || !token || invalid) { const code = invalid ?? "QUESTIONNAIRE_LINK_INVALID"; await event(tx, code); return questionnaireFailure(code); }
      if (subscription.status !== "onboarding") { await event(tx, "QUESTIONNAIRE_INVALID_STATE"); return questionnaireFailure("QUESTIONNAIRE_INVALID_STATE"); }
      const assignment = await this.assignment(tx, subscription);
      const expired = validateQuestionnaireToken(token); if (expired) { await event(tx, expired); return questionnaireFailure(expired); }
      if (!assignment.ok) { await event(tx, assignment.error); return assignment; }
      const document = assignment.document;
      if (!document || !matchesContext(token.contextJson, contextFor(document, subscription.id))) { await event(tx, "QUESTIONNAIRE_LINK_STALE"); return questionnaireFailure("QUESTIONNAIRE_LINK_STALE"); }
      if (!input) { await event(tx, "success"); return { ok: true, body: { document } }; }
      const result = await this.submit(tx, subscription, assignment, { ...contextFor(document, subscription.id), answers: input.answers }, { ...actor, userId: null },
        { tokenId: token.id, ...(input.healthDataDecision ? { healthDataDecision: input.healthDataDecision } : {}) });
      if (!result.ok) { await event(tx, result.error); return result; }
      const consumed = await tx.update(secureAccessTokens).set({ usedAt: new Date(), useCount: 1, updatedAt: new Date() }).where(and(eq(secureAccessTokens.id, token.id), gt(secureAccessTokens.expiresAt, sql`clock_timestamp()`))).returning({ id: secureAccessTokens.id });
      if (consumed.length !== 1) throw new RejectedQuestionnaireAccess("QUESTIONNAIRE_LINK_EXPIRED");
      await event(tx, "result" in result.body && result.body.result.outcome === "health_consent_refused" ? "health_consent_refused" : "success");
      return result;
    }); } catch (error) {
      await event(this.database, error instanceof RejectedQuestionnaireAccess ? error.code : "QUESTIONNAIRE_ROUTE_UNEXPECTED_FAILURE");
      if (error instanceof RejectedQuestionnaireAccess) return questionnaireFailure(error.code);
      throw error;
    }
  }
}

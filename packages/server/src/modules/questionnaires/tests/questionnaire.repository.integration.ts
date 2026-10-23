import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { questionTypes, type QuestionInput, type QuestionnaireDocument, type QuestionnaireSubmitInput, type QuestionnaireTemplate } from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { users, auditEvents } from "../../../db/schema/auth.js";
import { services, servicePolicies, serviceVariants } from "../../../db/schema/catalogue.js";
import { customers, subscriptions } from "../../../db/schema/customers.js";
import { questionnaireAnswers, questionnaireQuestions, questionnaireSubmissions, questionnaireTemplates } from "../../../db/schema/questionnaires.js";
import { consentDefinitions, consentRecords, medicalClearanceRecords, onboardingItems } from "../../../db/schema/onboarding.js";
import { secureAccessTokens, externalAccessEvents } from "../../../db/schema/documents.js";
import { DrizzleConsentRepository } from "../../consents/repositories/consent.repository.js";
import { DrizzleOnboardingRepository } from "../../onboarding/repositories/onboarding.repository.js";
import { DrizzleQuestionnaireTemplateRepository } from "../repositories/template.repository.js";
import { DrizzleQuestionnaireRepository, hashQuestionnaireToken } from "../repositories/questionnaire.repository.js";
import { syntheticQuestion, syntheticTemplate, syntheticValues } from "./questionnaire.fixtures.js";
const userId = randomUUID(), customerId = randomUUID();
const subscriptionIds: string[] = [], serviceIds: string[] = [], templateIds: string[] = [], definitionIds: string[] = [];
const options = { auditHashPepper: "synthetic-questionnaire-integration-pepper-32-characters" };
const actor = { userId, requestId: randomUUID(), ipAddress: "192.0.2.55", userAgent: "synthetic-questionnaire-integration" };
const anonymous = { ...actor, userId: null };
const repo = new DrizzleQuestionnaireRepository(db, options), templates = new DrizzleQuestionnaireTemplateRepository(db, options);
const consents = new DrizzleConsentRepository(db, options), onboarding = new DrizzleOnboardingRepository(db, options);
let safe = false;
async function healthDefinition() {
  const rows = await db.select().from(consentDefinitions).where(eq(consentDefinitions.consentType, "health_data"));
  const version = (rows.reduce((max, row) => BigInt(row.version) > max ? BigInt(row.version) : max, 0n) + 1n).toString();
  const result = await consents.saveDefinition({ consentType: "health_data", version, title: "SYNTHETIC TEST CONSENT", content: "SYNTHETIC HEALTH CONSENT TEST ONLY. No legal validity.", publish: true });
  assert.ok(result.ok); if (!result.ok) throw new Error("expected synthetic definition"); definitionIds.push(result.definition.id); return result.definition;
}
before(async () => {
  const target = new URL(process.env.DATABASE_URL ?? ""); assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "5433" && target.pathname === "/kfit_dev", "questionnaire integration requires disposable local database"); safe = true;
  await db.insert(users).values({ id: userId, email: `questionnaire-${userId}@example.invalid`, passwordHash: "synthetic", role: "admin", status: "active" });
  await db.insert(customers).values({ id: customerId, fullName: "Synthetic Questionnaire Customer", whatsapp: `+241${String(BigInt("0x" + customerId.replaceAll("-", "").slice(0,12)) % 1000000000000n).padStart(12,"0")}` });
  await healthDefinition();
});
after(async () => {
  try {
    if (!safe) return;
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, userId));
    if (subscriptionIds.length) {
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, subscriptionIds));
      const submissions = await db.select().from(questionnaireSubmissions).where(inArray(questionnaireSubmissions.subscriptionId, subscriptionIds));
      if (submissions.length) await db.delete(questionnaireAnswers).where(inArray(questionnaireAnswers.submissionId, submissions.map(s => s.id)));
      await db.delete(questionnaireSubmissions).where(inArray(questionnaireSubmissions.subscriptionId, subscriptionIds));
      await db.delete(consentRecords).where(inArray(consentRecords.subscriptionId, subscriptionIds));
      const tokens = await db.select().from(secureAccessTokens).where(inArray(secureAccessTokens.resourceId, subscriptionIds));
      if (tokens.length) { await db.delete(externalAccessEvents).where(inArray(externalAccessEvents.secureAccessTokenId, tokens.map(t => t.id))); await db.delete(secureAccessTokens).where(inArray(secureAccessTokens.id, tokens.map(t => t.id))); }
      await db.delete(medicalClearanceRecords).where(inArray(medicalClearanceRecords.subscriptionId, subscriptionIds));
      await db.delete(onboardingItems).where(inArray(onboardingItems.subscriptionId, subscriptionIds)); await db.delete(subscriptions).where(inArray(subscriptions.id, subscriptionIds));
    }
    const { hashAuditContext } = await import("../../auth/services/audit.service.js");
    await db.delete(externalAccessEvents).where(eq(externalAccessEvents.userAgentHash, hashAuditContext(actor.userAgent, options.auditHashPepper)!));
    if (serviceIds.length) { await db.delete(servicePolicies).where(inArray(servicePolicies.serviceId, serviceIds)); await db.delete(serviceVariants).where(inArray(serviceVariants.serviceId, serviceIds)); await db.delete(services).where(inArray(services.id, serviceIds)); }
    if (templateIds.length) { await db.delete(questionnaireQuestions).where(inArray(questionnaireQuestions.templateId, templateIds)); await db.delete(questionnaireTemplates).where(inArray(questionnaireTemplates.id, templateIds)); }
    if (definitionIds.length) await db.delete(consentDefinitions).where(inArray(consentDefinitions.id, definitionIds));
    await db.delete(customers).where(eq(customers.id, customerId)); await db.delete(users).where(eq(users.id, userId));
  } finally { await pool.end(); }
});
async function template(category: "assessment" | "health" = "assessment", questions = [syntheticQuestion()], publish = true) {
  const result = await templates.execute({ action: "create", input: syntheticTemplate(category, questions) }, actor); assert.ok(result.ok);
  if (!result.ok || !("template" in result.body)) throw new Error("expected template"); const draft = result.body.template; templateIds.push(draft.id);
  if (!publish) return draft;
  const published = await templates.execute({ action: "publish", templateId: draft.id }, actor); assert.ok(published.ok);
  if (!published.ok || !("template" in published.body)) throw new Error("expected published template"); return published.body.template;
}
async function nextVersion(source: QuestionnaireTemplate) {
  const input = { templateKey: source.templateKey, name: "SYNTHETIC VERSION TWO", category: source.category, questions: source.questions.map(({ id: _id, sortOrder: _order, ...q }) => q) };
  const result = await templates.execute({ action: "new_version", templateId: source.id, input }, actor); assert.ok(result.ok);
  if (!result.ok || !("template" in result.body)) throw new Error("expected version"); const next = result.body.template; templateIds.push(next.id);
  assert.ok((await templates.execute({ action: "publish", templateId: next.id }, actor)).ok); return next;
}
async function setup(config: { category?: "assessment" | "health"; questions?: QuestionInput[]; medical?: string; assigned?: QuestionnaireTemplate | null } = {}) {
  const selected = config.assigned === undefined ? await template(config.category, config.questions) : config.assigned;
  const serviceId = randomUUID(); serviceIds.push(serviceId);
  await db.insert(services).values({ id: serviceId, name: "Synthetic Questionnaire Service", slug: `questionnaire-${serviceId}`, pricingMode: "quote", deliveryType: "time_based", capacityMode: "unlimited" });
  const [policy] = await db.insert(servicePolicies).values({ serviceId, questionnaireTemplateId: selected?.id ?? null, medicalClearancePolicy: config.medical ?? "required_if_risk_flag" }).returning();
  const id = randomUUID(); subscriptionIds.push(id);
  await db.insert(subscriptions).values({ id, reference: `SUB-QUESTIONNAIRE-${id}`, customerId, serviceId, status: "onboarding", agreedPriceXaf: 45000, currency: "XAF", plannedStartDate: new Date(Date.now() + 86400000), createdByUserId: userId });
  assert.equal((await onboarding.execute(id, { action: "initialize" }, actor)).status, "ok"); return { id, serviceId, policyId: policy!.id, template: selected };
}
async function document(id: string): Promise<QuestionnaireDocument> {
  const result = await repo.execute(id, { action: "read" }, actor); assert.ok(result.ok);
  if (!result.ok || !("questionnaire" in result.body) || !result.body.questionnaire.document) throw new Error("expected assigned document"); return result.body.questionnaire.document;
}
function inputFor(doc: QuestionnaireDocument, safeAnswer = false): QuestionnaireSubmitInput {
  return { templateId: doc.template.id, templateVersion: doc.template.version, schemaHash: doc.template.schemaHash, expectedHeadId: doc.expectedHeadId,
    answers: doc.template.questions.map(q => ({ questionId: q.id, value: safeAnswer && q.questionType === "boolean" ? false : syntheticValues[q.questionType] })) };
}
async function coach(id: string, safeAnswer = false) { return repo.execute(id, { action: "submit", input: inputFor(await document(id), safeAnswer) }, actor); }
async function issue(id: string) {
  const result = await repo.execute(id, { action: "issue", expiresAt: new Date(Date.now() + 3600000) }, actor); assert.ok(result.ok);
  if (!result.ok || !("token" in result.body)) throw new Error("expected questionnaire link"); return result.body;
}
async function records(id: string) { return db.select().from(questionnaireSubmissions).where(eq(questionnaireSubmissions.subscriptionId, id)); }
async function answers(id: string) { const rows = await records(id); return rows.length ? db.select().from(questionnaireAnswers).where(inArray(questionnaireAnswers.submissionId, rows.map(r => r.id))) : []; }
async function item(id: string, type = "questionnaire") { return (await db.select().from(onboardingItems).where(and(eq(onboardingItems.subscriptionId, id), eq(onboardingItems.itemType, type))))[0]; }
async function medical(id: string) { return db.select().from(medicalClearanceRecords).where(eq(medicalClearanceRecords.subscriptionId, id)); }
async function audit(id: string) { return db.select().from(auditEvents).where(eq(auditEvents.entityId, id)); }
const riskQuestion = () => ({ ...syntheticQuestion(), riskFlagRuleJson: { operator: "equals" as const, value: true } });

test("PostgreSQL creates a validated draft template and questions", async () => {
  const draft = await template("assessment", [syntheticQuestion()], false); assert.equal(draft.status, "draft"); assert.equal(draft.version, 1); assert.equal(draft.questions.length, 1);
});
test("PostgreSQL publishes once and rejects mutation/republication of a published version", async () => {
  const published = await template(); const before = await db.select().from(questionnaireTemplates).where(eq(questionnaireTemplates.id, published.id));
  assert.deepEqual(await templates.execute({ action: "publish", templateId: published.id }, actor), { ok: false, error: "QUESTIONNAIRE_TEMPLATE_IMMUTABLE" });
  assert.deepEqual(await db.select().from(questionnaireTemplates).where(eq(questionnaireTemplates.id, published.id)), before);
});
test("PostgreSQL N+1 creates separate questions without altering immutable N", async () => {
  const first = await template(); const questions = await db.select().from(questionnaireQuestions).where(eq(questionnaireQuestions.templateId, first.id)); const next = await nextVersion(first);
  assert.equal(next.version, 2); assert.notEqual(next.id, first.id); assert.deepEqual(await db.select().from(questionnaireQuestions).where(eq(questionnaireQuestions.templateId, first.id)), questions);
});
for (const type of questionTypes) test(`PostgreSQL validates ${type} answers against its exact published schema`, async () => {
  const { id } = await setup({ questions: [syntheticQuestion(type)] }); const input = inputFor(await document(id));
  const invalidValues = { short_text: 123, long_text: true, boolean: "false", single_choice: "other", multi_choice: ["a", "a"], integer: 1.5, decimal: "2.5", date: "2026-02-30" };
  const invalid: QuestionnaireSubmitInput = { ...input, answers: [{ questionId: input.answers[0]!.questionId, value: invalidValues[type] }] };
  assert.deepEqual(await repo.execute(id, { action: "submit", input: invalid }, actor), { ok: false, error: "QUESTIONNAIRE_ANSWERS_INVALID" }); assert.equal((await records(id)).length, 0);
  assert.ok((await repo.execute(id, { action: "submit", input }, actor)).ok); assert.deepEqual((await answers(id))[0]?.answerJson, input.answers[0]?.value);
});
test("PostgreSQL template service rejects unsafe options/validation/risk JSON before any row is inserted", async () => {
  const base = syntheticTemplate(); const before = await db.select().from(questionnaireTemplates).where(eq(questionnaireTemplates.templateKey, base.templateKey));
  const { QuestionnaireTemplateService } = await import("../services/questionnaire.service.js");
  const service = new QuestionnaireTemplateService(templates);
  for (const q of [{ ...syntheticQuestion(), optionsJson: ["wrong"] }, { ...syntheticQuestion(), validationJson: { script: "eval" } }, { ...syntheticQuestion(), riskFlagRuleJson: { expression: "other > 1" } }])
    assert.deepEqual(await service.execute("create", { ...base, questions: [q] }, undefined, actor), { ok: false, error: "QUESTIONNAIRE_TEMPLATE_INVALID" });
  assert.deepEqual(await db.select().from(questionnaireTemplates).where(eq(questionnaireTemplates.templateKey, base.templateKey)), before);
});
test("PostgreSQL persists all eight blank optional answers as explicit JSON null", async () => {
  const { id } = await setup({ questions: questionTypes.map(type => ({ ...syntheticQuestion(type, `optional_${type}`), required: false })) });
  const input = inputFor(await document(id)); input.answers = input.answers.map(answer => ({ ...answer, value: null }));
  assert.ok((await repo.execute(id, { action: "submit", input }, actor)).ok);
  const stored = await answers(id); assert.equal(stored.length, 8); assert.ok(stored.every(answer => answer.answerJson === null));
});
test("PostgreSQL required multi-choice rejects an empty array even with minSelections zero", async () => {
  const { id } = await setup({ questions: [{ ...syntheticQuestion("multi_choice"), validationJson: { minSelections: 0 } }] });
  const input = inputFor(await document(id)); input.answers = input.answers.map(answer => ({ ...answer, value: [] }));
  assert.deepEqual(await repo.execute(id, { action: "submit", input }, actor), { ok: false, error: "QUESTIONNAIRE_ANSWERS_INVALID" });
  assert.equal((await records(id)).length, 0); assert.equal((await item(id))?.status, "pending");
});
test("PostgreSQL assessment submission requires no health consent", async () => {
  const { id } = await setup(); assert.ok((await coach(id)).ok); assert.equal((await db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, id))).length, 0);
});
test("PostgreSQL health coach submission without grant rejects with zero questionnaire writes", async () => {
  const { id } = await setup({ category: "health" }); assert.deepEqual(await coach(id), { ok: false, error: "QUESTIONNAIRE_HEALTH_CONSENT_REQUIRED" }); assert.equal((await records(id)).length, 0); assert.equal((await answers(id)).length, 0);
});
test("PostgreSQL health refusal stores append-only consent and consumes attempt with zero answers", async () => {
  const { id } = await setup({ category: "health" }); const link = await issue(id);
  const result = await repo.publicAccess(link.token, { answers: [], healthDataDecision: "refused" }, anonymous); assert.ok(result.ok);
  if (result.ok && "result" in result.body) assert.equal(result.body.result.outcome, "health_consent_refused");
  assert.equal((await records(id)).length, 0); assert.equal((await answers(id)).length, 0); assert.equal((await item(id))?.status, "pending");
  const consent = await db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, id)); assert.equal(consent[0]?.decision, "refused"); assert.equal(consent[0]?.capturedVia, "public_link");
  const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id)); assert.equal(token?.useCount, 1);
});
test("PostgreSQL explicit health grant plus answers commit atomically with exact definition and template", async () => {
  const { id } = await setup({ category: "health" }); const doc = await document(id); const link = await issue(id);
  assert.ok((await repo.publicAccess(link.token, { answers: inputFor(doc).answers, healthDataDecision: "granted" }, anonymous)).ok);
  const consent = await db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, id)); assert.equal(consent[0]?.consentDefinitionId, doc.healthConsent?.definition.id); assert.equal(consent[0]?.decision, "granted");
  const submission = (await records(id))[0]; assert.equal(submission?.templateId, doc.template.id); assert.equal(submission?.templateVersion, doc.template.version); assert.equal((await answers(id)).length, 1); assert.equal((await item(id))?.status, "completed");
});
test("PostgreSQL correction appends immutable N+1 and leaves historical answers untouched", async () => {
  const { id } = await setup(); assert.ok((await coach(id)).ok); const before = await records(id); const beforeAnswers = await answers(id); assert.ok((await coach(id, true)).ok);
  const rows = await records(id); assert.equal(rows.length, 2); assert.deepEqual(rows.find(r => r.id === before[0]?.id), before[0]);
  const next = rows.find(r => r.id !== before[0]?.id); assert.equal(next?.revisionNumber, 2); assert.equal(next?.supersedesSubmissionId, before[0]?.id);
  assert.deepEqual((await answers(id)).find(r => r.id === beforeAnswers[0]?.id), beforeAnswers[0]);
});
test("PostgreSQL concurrent corrections serialize into one new authoritative head", async () => {
  const { id } = await setup(); await coach(id); const input = inputFor(await document(id));
  const results = await Promise.all([repo.execute(id, { action: "submit", input }, actor), repo.execute(id, { action: "submit", input }, actor)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error === "QUESTIONNAIRE_STALE_REVISION")); assert.equal((await records(id)).length, 2);
});
test("PostgreSQL stale expected initial head rejects with zero duplicate rows", async () => {
  const { id } = await setup(); const input = inputFor(await document(id)); assert.ok((await repo.execute(id, { action: "submit", input }, actor)).ok);
  assert.deepEqual(await repo.execute(id, { action: "submit", input }, actor), { ok: false, error: "QUESTIONNAIRE_STALE_REVISION" }); assert.equal((await records(id)).length, 1);
});
test("PostgreSQL required, unknown, duplicate and foreign-version answer IDs are rejected", async () => {
  const { id } = await setup(); const input = inputFor(await document(id));
  for (const answerList of [[], [{ questionId: randomUUID(), value: true }], [...input.answers, ...input.answers]]) assert.deepEqual(await repo.execute(id, { action: "submit", input: { ...input, answers: answerList } }, actor), { ok: false, error: "QUESTIONNAIRE_ANSWERS_INVALID" });
  assert.equal((await records(id)).length, 0);
});
test("PostgreSQL risk plus policy creates one required medical record and pending blocking item", async () => {
  const { id } = await setup({ questions: [riskQuestion()] }); assert.ok((await coach(id)).ok); const rows = await medical(id); assert.equal(rows.length, 1); assert.equal(rows[0]?.status, "required");
  assert.equal(rows[0]?.triggerSource, `questionnaire:${(await records(id))[0]?.id}`); assert.equal((await item(id, "medical_clearance"))?.status, "pending"); assert.equal((await item(id, "medical_clearance"))?.isBlocking, true);
});
test("PostgreSQL repeated risk revisions preserve one active medical requirement", async () => {
  const { id } = await setup({ questions: [riskQuestion()] }); await coach(id); const before = await medical(id); await coach(id); assert.deepEqual(await medical(id), before);
});
test("PostgreSQL no-risk answers do not create a medical blocker", async () => {
  const { id } = await setup({ questions: [riskQuestion()] }); await coach(id, true); assert.equal((await medical(id)).length, 0); assert.equal(await item(id, "medical_clearance"), undefined);
});
test("PostgreSQL not_required policy never creates a medical blocker despite risk", async () => {
  const { id } = await setup({ questions: [riskQuestion()], medical: "not_required" }); await coach(id); assert.equal((await medical(id)).length, 0); assert.equal(await item(id, "medical_clearance"), undefined);
});
test("PostgreSQL safe later revision does not clear or alter existing medical requirement", async () => {
  const { id } = await setup({ questions: [riskQuestion()] }); await coach(id); const before = await medical(id); const beforeItem = await item(id, "medical_clearance"); await coach(id, true);
  assert.deepEqual(await medical(id), before); assert.deepEqual(await item(id, "medical_clearance"), beforeItem);
});
test("PostgreSQL public GET is non-consuming and returns only the exact schema and safe reference", async () => {
  const { id } = await setup({ category: "health" }); const link = await issue(id); const result = await repo.publicAccess(link.token, null, anonymous); assert.ok(result.ok);
  if (!result.ok || !("document" in result.body)) throw new Error("expected public document");
  assert.deepEqual(Object.keys(result.body.document).sort(), ["expectedHeadId", "healthConsent", "subscriptionReference", "template"]);
  assert.ok(result.body.document.healthConsent?.definition.content.startsWith("SYNTHETIC HEALTH"));
  const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id)); assert.equal(token?.useCount, 0); assert.equal(token?.usedAt, null); assert.equal(token?.tokenHash, hashQuestionnaireToken(link.token)); assert.ok(!JSON.stringify(token).includes(link.token));
});
for (const kind of ["expired", "revoked", "stale"] as const) test(`PostgreSQL ${kind} questionnaire token writes zero submissions/answers`, async () => {
  const owner = await setup(); const doc = await document(owner.id); const link = await issue(owner.id);
  if (kind === "expired") await db.update(secureAccessTokens).set({ expiresAt: new Date(0) }).where(eq(secureAccessTokens.id, link.link.id));
  if (kind === "revoked") assert.ok((await repo.execute(owner.id, { action: "revoke_link", tokenId: link.link.id }, actor)).ok);
  if (kind === "stale") { const next = await nextVersion(doc.template); await db.update(servicePolicies).set({ questionnaireTemplateId: next.id }).where(eq(servicePolicies.id, owner.policyId)); }
  const before = await audit(owner.id);
  assert.deepEqual(await repo.publicAccess(link.token, { answers: inputFor(doc).answers }, anonymous), { ok: false, error: kind === "expired" ? "QUESTIONNAIRE_LINK_EXPIRED" : kind === "revoked" ? "QUESTIONNAIRE_LINK_REVOKED" : "QUESTIONNAIRE_LINK_STALE" });
  assert.equal((await records(owner.id)).length, 0); assert.equal((await answers(owner.id)).length, 0); assert.deepEqual(await audit(owner.id), before);
});
test("PostgreSQL public POST consumes once and replay creates no duplicate evidence", async () => {
  const { id } = await setup(); const link = await issue(id); const input = { answers: inputFor(await document(id)).answers };
  assert.ok((await repo.publicAccess(link.token, input, anonymous)).ok); const before = await records(id); const beforeAnswers = await answers(id);
  assert.deepEqual(await repo.publicAccess(link.token, input, anonymous), { ok: false, error: "QUESTIONNAIRE_LINK_CONSUMED" }); assert.deepEqual(await records(id), before); assert.deepEqual(await answers(id), beforeAnswers);
});
test("PostgreSQL concurrent public submissions create one initial revision and one answer set", async () => {
  const { id } = await setup(); const link = await issue(id); const input = { answers: inputFor(await document(id)).answers };
  const results = await Promise.all([repo.publicAccess(link.token, input, anonymous), repo.publicAccess(link.token, input, anonymous)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await records(id)).length, 1); assert.equal((await answers(id)).length, 1);
});
test("PostgreSQL coach provenance stores the acting user and source", async () => {
  const { id } = await setup(); await coach(id); const [row] = await records(id); assert.equal(row?.source, "coach_assisted"); assert.equal(row?.enteredByUserId, userId);
});
function auditFailureRepository() {
  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const database = new Proxy(db, { get(target, key, receiver) {
    if (key === "transaction") return <T>(work: (tx: Transaction) => Promise<T>, config?: Parameters<typeof db.transaction>[1]) => target.transaction(tx => work(new Proxy(tx, { get(transaction, member, txReceiver) {
      if (member === "insert") return (table: Parameters<Transaction["insert"]>[0]) => {
        const insert = transaction.insert(table); if (table !== auditEvents) return insert;
        return new Proxy(insert, { get(builder, method, builderReceiver) { if (method === "values") return (value: Record<string, unknown>) => Reflect.apply(builder.values, builder, [{ ...value, ...(value.eventType === "questionnaire.submitted" ? { actorUserId: randomUUID() } : {}) }]); return Reflect.get(builder, method, builderReceiver); } });
      }; return Reflect.get(transaction, member, txReceiver);
    } })), config); return Reflect.get(target, key, receiver);
  } }); return new DrizzleQuestionnaireRepository(database, options);
}
test("PostgreSQL final audit failure rolls back health consent, submission, answers, checklist, medical and consumption", async () => {
  const { id } = await setup({ category: "health", questions: [riskQuestion()] }); const link = await issue(id); const beforeItem = await item(id); const beforeAudit = await audit(id);
  await assert.rejects(auditFailureRepository().publicAccess(link.token, { answers: inputFor(await document(id)).answers, healthDataDecision: "granted" }, anonymous), error => error instanceof Error && !!error.cause && typeof error.cause === "object" && "code" in error.cause && error.cause.code === "23503");
  assert.equal((await records(id)).length, 0); assert.equal((await answers(id)).length, 0); assert.equal((await db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, id))).length, 0);
  assert.equal((await medical(id)).length, 0); assert.equal(await item(id, "medical_clearance"), undefined); assert.deepEqual(await item(id), beforeItem); assert.deepEqual(await audit(id), beforeAudit);
  const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id)); assert.equal(token?.useCount, 0); assert.equal(token?.usedAt, null);
});
test("PostgreSQL audits never include health answers, free text, question labels or raw token", async () => {
  const { id } = await setup({ category: "health", questions: [riskQuestion(), syntheticQuestion("long_text", "synthetic_text")] }); const link = await issue(id);
  assert.ok((await repo.publicAccess(link.token, { answers: inputFor(await document(id)).answers, healthDataDecision: "granted" }, anonymous)).ok);
  const serialized = JSON.stringify((await audit(id)).map(e => e.metadataJson));
  for (const secret of [link.token, "SYNTHETIC PRIVATE HEALTH DETAIL", "SYNTHETIC TEST QUESTION", "Synthetic Questionnaire Customer", "synthetic_flag", "synthetic_text"]) assert.ok(!serialized.includes(secret));
});
test("PostgreSQL health revocation preserves past answers and prevents future coach revisions until regrant", async () => {
  const { id } = await setup({ category: "health" }); const link = await issue(id); await repo.publicAccess(link.token, { answers: inputFor(await document(id)).answers, healthDataDecision: "granted" }, anonymous);
  const before = await records(id), beforeAnswers = await answers(id); assert.ok((await consents.execute(id, { action: "revoke", consentType: "health_data" }, actor)).ok);
  assert.deepEqual(await coach(id), { ok: false, error: "QUESTIONNAIRE_HEALTH_CONSENT_REQUIRED" }); assert.deepEqual(await records(id), before); assert.deepEqual(await answers(id), beforeAnswers);
});
test("PostgreSQL newer publication and ordinary reads never reopen the completed questionnaire", async () => {
  const { id } = await setup(); await coach(id); const doc = await document(id); const before = await item(id); await nextVersion(doc.template);
  assert.equal((await document(id)).template.id, doc.template.id); assert.deepEqual(await item(id), before); assert.equal((await item(id))?.status, "completed");
});
test("PostgreSQL questionnaire waiver remains authoritative after a valid submission", async () => {
  const { id } = await setup(); const before = await item(id); assert.ok(before);
  assert.equal((await onboarding.execute(id, { action: "waive", itemId: before.id, reason: "Synthetic controlled waiver" }, actor)).status, "ok");
  const waived = await item(id); await coach(id); assert.deepEqual(await item(id), waived);
});
test("PostgreSQL link revocation succeeds even after its policy assignment becomes invalid", async () => {
  const owner = await setup(); const link = await issue(owner.id);
  await db.update(servicePolicies).set({ questionnaireTemplateId: randomUUID() }).where(eq(servicePolicies.id, owner.policyId));
  assert.deepEqual(await repo.execute(owner.id, { action: "revoke_link", tokenId: link.link.id }, actor), { ok: true, body: { revoked: true } });
  const [token] = await db.select().from(secureAccessTokens).where(eq(secureAccessTokens.id, link.link.id)); assert.ok(token?.revokedAt); assert.equal(token?.useCount, 0);
});
test("PostgreSQL missing assignment returns no schema; draft assignment is rejected", async () => {
  const owner = await setup({ assigned: null }); const result = await repo.execute(owner.id, { action: "read" }, actor); assert.ok(result.ok); if (result.ok && "questionnaire" in result.body) assert.equal(result.body.questionnaire.document, null);
  const draft = await template("assessment", undefined, false); await db.update(servicePolicies).set({ questionnaireTemplateId: draft.id }).where(eq(servicePolicies.id, owner.policyId));
  assert.deepEqual(await repo.execute(owner.id, { action: "read" }, actor), { ok: false, error: "QUESTIONNAIRE_ASSIGNMENT_INVALID" });
});
test("PostgreSQL variant policy overrides service assignment and medical policy as a whole", async () => {
  const owner = await setup({ questions: [riskQuestion()] }); const other = await template("assessment", [riskQuestion()]); const variantId = randomUUID();
  await db.insert(serviceVariants).values({ id: variantId, serviceId: owner.serviceId, name: "Synthetic option", slug: `synthetic-${variantId}` });
  await db.insert(servicePolicies).values({ serviceId: owner.serviceId, variantId, questionnaireTemplateId: other.id, medicalClearancePolicy: "not_required" });
  await db.update(subscriptions).set({ variantId }).where(eq(subscriptions.id, owner.id)); assert.equal((await document(owner.id)).template.id, other.id); await coach(owner.id); assert.equal((await medical(owner.id)).length, 0);
});
test("PostgreSQL changed health definition rejects pinned token without questionnaire or consent writes", async () => {
  const { id } = await setup({ category: "health" }); const link = await issue(id); const doc = await document(id); await healthDefinition();
  assert.deepEqual(await repo.publicAccess(link.token, { answers: inputFor(doc).answers, healthDataDecision: "granted" }, anonymous), { ok: false, error: "QUESTIONNAIRE_LINK_STALE" });
  assert.equal((await records(id)).length, 0); assert.equal((await db.select().from(consentRecords).where(eq(consentRecords.subscriptionId, id))).length, 0);
});
/* UX-14c — reading one revision's answers (Fred 2026-10-23: audited, health answers need a current health-data grant). */
async function grantedHealthSubmission() {
  const { id } = await setup({ category: "health" }); const doc = await document(id); const link = await issue(id);
  assert.ok((await repo.publicAccess(link.token, { answers: inputFor(doc).answers, healthDataDecision: "granted" }, anonymous)).ok);
  const submission = (await records(id))[0]; assert.ok(submission); return { id, submission: submission!, doc };
}
test("PostgreSQL answers view returns the revision answers and audits ids only", async () => {
  const { id, submission, doc } = await grantedHealthSubmission();
  const before = (await audit(id)).filter(e => e.eventType === "questionnaire.answers_viewed").length;
  const result = await repo.execute(id, { action: "view_answers", submissionId: submission.id }, actor);
  assert.ok(result.ok); if (!result.ok || !("answers" in result.body)) throw new Error("expected answers");
  const view = result.body.answers;
  assert.equal(view.revision.id, submission.id); assert.equal(view.template.category, "health"); assert.equal(view.answers.length, inputFor(doc).answers.length);
  assert.deepEqual(view.answers[0]?.value, inputFor(doc).answers[0]?.value); assert.ok(view.questions.some(q => q.id === view.answers[0]?.questionId));
  const events = (await audit(id)).filter(e => e.eventType === "questionnaire.answers_viewed");
  assert.equal(events.length, before + 1);
  const metadata = JSON.stringify(events.at(-1)?.metadataJson ?? {});
  assert.ok(metadata.includes(submission.id)); assert.ok(!metadata.includes(JSON.stringify(inputFor(doc).answers[0]?.value)), "audit must not carry answer content");
});
test("PostgreSQL answers view is refused after the health-data consent is withdrawn, without audit of a view", async () => {
  const { id, submission } = await grantedHealthSubmission();
  assert.ok((await consents.execute(id, { action: "revoke", consentType: "health_data" }, actor)).ok);
  const before = (await audit(id)).filter(e => e.eventType === "questionnaire.answers_viewed").length;
  assert.deepEqual(await repo.execute(id, { action: "view_answers", submissionId: submission.id }, actor), { ok: false, error: "QUESTIONNAIRE_HEALTH_CONSENT_WITHDRAWN" });
  assert.equal((await audit(id)).filter(e => e.eventType === "questionnaire.answers_viewed").length, before);
});
test("PostgreSQL answers view rejects a revision of another subscription", async () => {
  const { submission } = await grantedHealthSubmission(); const other = await setup();
  assert.deepEqual(await repo.execute(other.id, { action: "view_answers", submissionId: submission.id }, actor), { ok: false, error: "QUESTIONNAIRE_NOT_FOUND" });
});
test("PostgreSQL assessment answers need no health consent and stay readable outside preparation", async () => {
  const { id } = await setup(); assert.ok((await coach(id)).ok); const submission = (await records(id))[0]!;
  await db.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.id, id));
  const result = await repo.execute(id, { action: "view_answers", submissionId: submission.id }, actor);
  assert.ok(result.ok);
});

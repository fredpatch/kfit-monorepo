import { createHash } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { parseQuestionnaireTemplate, type QuestionnaireTemplate } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { questionnaireQuestions, questionnaireTemplates } from "../../../db/schema/questionnaires.js";
import { servicePolicies, services, serviceVariants } from "../../../db/schema/catalogue.js";
import { AuditService } from "../../auth/services/audit.service.js";
import type { ConsentTransaction } from "../../consents/repositories/consent.repository.js";
import { questionnaireFailure, type QuestionnaireActor, type QuestionnaireResult, type TemplateCommand, type TemplateRepository } from "../services/questionnaire.service.js";
export async function lockQuestionnaireTemplates(tx: ConsentTransaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('kfit:questionnaire-templates', 0))`);
}
export async function loadQuestionnaireTemplate(tx: ConsentTransaction, id: string): Promise<QuestionnaireTemplate | null> {
  const [row] = await tx.select().from(questionnaireTemplates).where(eq(questionnaireTemplates.id, id)); if (!row) return null;
  const questions = await tx.select().from(questionnaireQuestions).where(eq(questionnaireQuestions.templateId, id)).orderBy(asc(questionnaireQuestions.sortOrder), asc(questionnaireQuestions.questionKey));
  const parsed = parseQuestionnaireTemplate({ templateKey: row.templateKey, name: row.name, category: row.category, questions: questions.map(q => ({
    questionKey: q.questionKey, label: q.label, questionType: q.questionType, required: q.required, optionsJson: q.optionsJson, validationJson: q.validationJson, riskFlagRuleJson: q.riskFlagRuleJson })) });
  if (!parsed || !["draft", "published", "retired"].includes(row.status) || !Number.isInteger(row.version) || row.version < 1) throw new Error("Invalid stored questionnaire schema");
  const schema = { ...parsed, id, version: row.version, questions: parsed.questions.map((q, index) => ({ ...q, id: questions[index]!.id, sortOrder: questions[index]!.sortOrder })) };
  return { ...schema, status: row.status as QuestionnaireTemplate["status"], publishedAt: row.publishedAt?.toISOString() ?? null,
    schemaHash: createHash("sha256").update(JSON.stringify(schema)).digest("hex") };
}
export class DrizzleQuestionnaireTemplateRepository implements TemplateRepository {
  constructor(private readonly database: typeof appDb, private readonly options: { auditHashPepper: string }) {}
  async execute(command: TemplateCommand, actor: QuestionnaireActor): Promise<QuestionnaireResult> {
    return this.database.transaction(async tx => {
      await lockQuestionnaireTemplates(tx);
      if (command.action === "list") {
        const rows = await tx.select().from(questionnaireTemplates).orderBy(asc(questionnaireTemplates.templateKey), asc(questionnaireTemplates.version));
        const templates: QuestionnaireTemplate[] = [];
        for (const row of rows) { const template = await loadQuestionnaireTemplate(tx, row.id); if (template) templates.push(template); }
        return { ok: true, body: { templates } };
      }
      if (command.action === "assignment_list") {
        const serviceRows = await tx.select().from(services).orderBy(asc(services.name));
        const variantRows = await tx.select().from(serviceVariants).orderBy(asc(serviceVariants.serviceId), asc(serviceVariants.sortOrder), asc(serviceVariants.name));
        const policyRows = await tx.select().from(servicePolicies);
        const servicePolicy = new Map(policyRows.filter(p => p.variantId === null).map(p => [p.serviceId, p]));
        const variantPolicy = new Map(policyRows.filter(p => p.variantId !== null).map(p => [p.variantId!, p]));
        const assignments = serviceRows.flatMap(service => {
          const root = servicePolicy.get(service.id);
          const rootScope = { serviceId: service.id, serviceName: service.name, variantId: null, variantName: null,
            questionnaireTemplateId: root?.questionnaireTemplateId ?? null, effectiveQuestionnaireTemplateId: root?.questionnaireTemplateId ?? null };
          const children = variantRows.filter(v => v.serviceId === service.id).map(variant => {
            const specific = variantPolicy.get(variant.id);
            return { serviceId: service.id, serviceName: service.name, variantId: variant.id, variantName: variant.name,
              questionnaireTemplateId: specific?.questionnaireTemplateId ?? null,
              effectiveQuestionnaireTemplateId: specific?.questionnaireTemplateId ?? root?.questionnaireTemplateId ?? null };
          });
          return [rootScope, ...children];
        });
        return { ok: true, body: { assignments } };
      }
      if (command.action === "assignment_set") {
        const { serviceId, variantId, questionnaireTemplateId } = command.input;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`kfit:questionnaire-assignment:${serviceId}:${variantId ?? "service"}`}, 0))`);
        const [service] = await tx.select().from(services).where(eq(services.id, serviceId)).for("update");
        if (!service) return questionnaireFailure("QUESTIONNAIRE_ASSIGNMENT_INVALID");
        if (variantId) {
          const [variant] = await tx.select().from(serviceVariants).where(and(eq(serviceVariants.id, variantId), eq(serviceVariants.serviceId, serviceId))).for("update");
          if (!variant) return questionnaireFailure("QUESTIONNAIRE_ASSIGNMENT_INVALID");
        }
        if (questionnaireTemplateId) {
          const template = await loadQuestionnaireTemplate(tx, questionnaireTemplateId);
          if (!template || template.status !== "published" || !template.publishedAt) return questionnaireFailure("QUESTIONNAIRE_ASSIGNMENT_INVALID");
        }
        const whereScope = variantId
          ? and(eq(servicePolicies.serviceId, serviceId), eq(servicePolicies.variantId, variantId))
          : and(eq(servicePolicies.serviceId, serviceId), isNull(servicePolicies.variantId));
        const [existing] = await tx.select().from(servicePolicies).where(whereScope).for("update");
        let policyId: string;
        if (existing) {
          await tx.update(servicePolicies).set({ questionnaireTemplateId, updatedAt: new Date() }).where(eq(servicePolicies.id, existing.id));
          policyId = existing.id;
        } else {
          const [created] = await tx.insert(servicePolicies).values({ serviceId, variantId, questionnaireTemplateId }).returning({ id: servicePolicies.id });
          if (!created) throw new Error("Questionnaire policy assignment insert did not return a row");
          policyId = created.id;
        }
        const [root] = await tx.select().from(servicePolicies).where(and(eq(servicePolicies.serviceId, serviceId), isNull(servicePolicies.variantId)));
        const [specific] = variantId ? await tx.select().from(servicePolicies).where(and(eq(servicePolicies.serviceId, serviceId), eq(servicePolicies.variantId, variantId))) : [];
        const assignment = { serviceId, serviceName: service.name, variantId, variantName: variantId ? (await tx.select().from(serviceVariants).where(eq(serviceVariants.id, variantId)))[0]?.name ?? null : null,
          questionnaireTemplateId, effectiveQuestionnaireTemplateId: variantId ? specific?.questionnaireTemplateId ?? root?.questionnaireTemplateId ?? null : questionnaireTemplateId };
        await new AuditService(tx, this.options).record({ actorType: "user", actorUserId: actor.userId, requestId: actor.requestId,
          ipAddress: actor.ipAddress, userAgent: actor.userAgent, eventType: "questionnaire.assignment_updated", entityType: "service_policy", entityId: policyId,
          result: "success", metadata: { serviceId, variantId, questionnaireTemplateId, effectiveQuestionnaireTemplateId: assignment.effectiveQuestionnaireTemplateId } });
        return { ok: true, body: { assignment } };
      }
      const audit = (id: string, eventType: string, version: number) => new AuditService(tx, this.options).record({ actorType: "user", actorUserId: actor.userId,
        requestId: actor.requestId, ipAddress: actor.ipAddress, userAgent: actor.userAgent, eventType, entityType: "questionnaire_template", entityId: id, result: "success", metadata: { templateId: id, version } });
      if (command.action === "publish") {
        const template = await loadQuestionnaireTemplate(tx, command.templateId); if (!template) return questionnaireFailure("QUESTIONNAIRE_NOT_FOUND");
        if (template.status !== "draft") return questionnaireFailure("QUESTIONNAIRE_TEMPLATE_IMMUTABLE");
        const family = await tx.select().from(questionnaireTemplates).where(eq(questionnaireTemplates.templateKey, template.templateKey));
        if (family.some(t => t.publishedAt && t.version >= template.version)) return questionnaireFailure("QUESTIONNAIRE_VERSION_CONFLICT");
        await tx.update(questionnaireTemplates).set({ status: "published", publishedAt: new Date() }).where(and(eq(questionnaireTemplates.id, template.id), eq(questionnaireTemplates.status, "draft")));
        await audit(template.id, "questionnaire.template_published", template.version);
        return { ok: true, body: { template: (await loadQuestionnaireTemplate(tx, template.id))! } };
      }
      // Independent validation also protects internal callers; persistence never mass-assigns DTOs.
      const input = parseQuestionnaireTemplate(command.input); if (!input) return questionnaireFailure("QUESTIONNAIRE_TEMPLATE_INVALID");
      const family = await tx.select().from(questionnaireTemplates).where(eq(questionnaireTemplates.templateKey, input.templateKey));
      let version = 1;
      if (command.action === "create") { if (family.length) return questionnaireFailure("QUESTIONNAIRE_VERSION_CONFLICT"); }
      else {
        const source = family.find(t => t.id === command.templateId); if (!source) return questionnaireFailure("QUESTIONNAIRE_NOT_FOUND");
        if (!["published", "retired"].includes(source.status)) return questionnaireFailure("QUESTIONNAIRE_INVALID_STATE");
        version = Math.max(...family.map(t => t.version)) + 1;
        if (version > 2147483647) return questionnaireFailure("QUESTIONNAIRE_VERSION_CONFLICT");
      }
      const [row] = await tx.insert(questionnaireTemplates).values({ templateKey: input.templateKey, name: input.name, category: input.category, version, status: "draft" }).returning();
      if (!row) throw new Error("Questionnaire template insert did not return a row");
      await tx.insert(questionnaireQuestions).values(input.questions.map((q, sortOrder) => ({ templateId: row.id, questionKey: q.questionKey, label: q.label,
        questionType: q.questionType, required: q.required, sortOrder, optionsJson: q.optionsJson, validationJson: q.validationJson, riskFlagRuleJson: q.riskFlagRuleJson })));
      await audit(row.id, "questionnaire.template_created", version);
      return { ok: true, body: { template: (await loadQuestionnaireTemplate(tx, row.id))! } };
    });
  }
}

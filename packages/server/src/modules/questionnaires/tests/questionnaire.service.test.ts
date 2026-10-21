import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { QuestionnaireTemplate, RiskRule } from "@kfit/shared";
import { QuestionnaireService, QuestionnaireTemplateService, type QuestionnaireRepository, type TemplateRepository } from "../services/questionnaire.service.js";
import { evaluateQuestionnaireRisk } from "../services/risk-evaluator.js";
import { syntheticQuestion, syntheticTemplate } from "./questionnaire.fixtures.js";
const id = randomUUID(); const actor = { userId: id, requestId: id, ipAddress: null, userAgent: null };
const repository: QuestionnaireRepository = { async execute() { assert.fail("invalid input reached repository"); }, async publicAccess(_token, input, _actor, rejected) { assert.equal(input, null); assert.equal(rejected, true); return { ok: false, error: "QUESTIONNAIRE_INVALID_INPUT" }; } };
test("questionnaire coach cannot supply health decisions or template authority overrides", async () => {
  const service = new QuestionnaireService(repository);
  assert.deepEqual(await service.execute(id, "submit", { templateId: id, templateVersion: 1, schemaHash: "0".repeat(64), expectedHeadId: null, answers: [], healthDataDecision: "granted" }, undefined, actor), { ok: false, error: "QUESTIONNAIRE_INVALID_INPUT" });
});
test("questionnaire public input rejects definition, schema and revision overrides through failure-event path", async () => {
  const service = new QuestionnaireService(repository);
  for (const override of ["templateId", "templateVersion", "schemaHash", "expectedHeadId", "healthDefinitionId"])
    assert.deepEqual(await service.publicAccess("synthetic", { answers: [], [override]: id }, true, actor), { ok: false, error: "QUESTIONNAIRE_INVALID_INPUT" });
});
test("questionnaire links require explicit valid future expiry", async () => {
  const service = new QuestionnaireService(repository);
  for (const body of [{}, { expiresAt: "invalid" }, { expiresAt: "2000-01-01T00:00:00Z" }, { expiresAt: "2030-01-01T00:00:00" }])
    assert.deepEqual(await service.execute(id, "issue", body, undefined, actor), { ok: false, error: "QUESTIONNAIRE_INVALID_INPUT" });
});
test("template service rejects malformed nested schema before persistence", async () => {
  const repo: TemplateRepository = { async execute() { assert.fail("invalid schema reached repository"); } };
  assert.deepEqual(await new QuestionnaireTemplateService(repo).execute("create", { ...syntheticTemplate(), script: "eval" }, undefined, actor), { ok: false, error: "QUESTIONNAIRE_TEMPLATE_INVALID" });
});
const riskCases: [RiskRule["operator"], RiskRule["value"], boolean | number, boolean][] = [["equals", true, true, true], ["equals", true, false, false], ["in", [1, 3], 3, true], ["gt", 3, 4, true], ["gte", 3, 3, true], ["lt", 3, 2, true], ["lte", 3, 3, true]];
for (const [operator, value, answer, expected] of riskCases) {
  test(`risk evaluator ${operator} remains limited to its own declared answer`, () => {
    const question = { ...syntheticQuestion(typeof answer === "boolean" ? "boolean" : "integer"), id, sortOrder: 0, riskFlagRuleJson: { operator, value } };
    const template: QuestionnaireTemplate = { ...syntheticTemplate(), id, version: 1, status: "published", publishedAt: new Date().toISOString(), schemaHash: "hash", questions: [question] };
    const result = evaluateQuestionnaireRisk(template, [{ questionId: id, value: answer }, { questionId: randomUUID(), value: 100 }]);
    assert.equal(result.riskDetected, expected); assert.deepEqual(result.matchedQuestionKeys, expected ? [question.questionKey] : []);
  });
}

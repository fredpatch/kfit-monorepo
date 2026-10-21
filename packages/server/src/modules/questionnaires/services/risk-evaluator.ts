import type { QuestionnaireAnswer, QuestionnaireTemplate } from "@kfit/shared";
export function evaluateQuestionnaireRisk(template: QuestionnaireTemplate, answers: QuestionnaireAnswer[]): { riskDetected: boolean; matchedQuestionKeys: string[] } {
  const matchedQuestionKeys = template.questions.flatMap(question => {
    const rule = question.riskFlagRuleJson; const value = answers.find(answer => answer.questionId === question.id)?.value;
    if (!rule || value === null || value === undefined) return [];
    let matches = false;
    if (rule.operator === "equals") matches = value === rule.value;
    else if (rule.operator === "in" && Array.isArray(rule.value)) { const choices = rule.value; matches = Array.isArray(value) ? value.some(item => choices.includes(item)) : choices.includes(value); }
    else if (!Array.isArray(value) && !Array.isArray(rule.value) && ((typeof value === "number" && typeof rule.value === "number") || (typeof value === "string" && typeof rule.value === "string"))) {
      switch (rule.operator) { case "gt": matches = value > rule.value; break; case "gte": matches = value >= rule.value; break; case "lt": matches = value < rule.value; break; case "lte": matches = value <= rule.value; break; }
    }
    return matches ? [question.questionKey] : [];
  });
  return { riskDetected: matchedQuestionKeys.length > 0, matchedQuestionKeys };
}

import {
  questionTypes,
  type QuestionInput,
  type QuestionnaireAnswer,
  type QuestionnaireTemplateInput,
  type QuestionValue,
  type RiskRule,
} from "./contracts.js";
export function questionnaireObject(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function exactKeys(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const numeric = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export function validQuestionnaireDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function parseQuestion(value: unknown): QuestionInput | null {
  if (
    !questionnaireObject(value) ||
    !exactKeys(value, [
      "questionKey",
      "label",
      "questionType",
      "required",
      "optionsJson",
      "validationJson",
      "riskFlagRuleJson",
    ])
  )
    return null;
  if (
    !text(value.questionKey, 80) ||
    !/^[a-z][a-z0-9_]*$/.test(value.questionKey) ||
    !text(value.label, 1000) ||
    typeof value.required !== "boolean"
  )
    return null;
  const questionType = questionTypes.find(
    (type) => type === value.questionType,
  );
  if (!questionType) return null;
  const choice =
    questionType === "single_choice" || questionType === "multi_choice";
  let options: QuestionInput["optionsJson"] = null;
  if (choice) {
    if (
      !Array.isArray(value.optionsJson) ||
      value.optionsJson.length < 1 ||
      value.optionsJson.length > 100
    )
      return null;
    options = [];
    for (const option of value.optionsJson) {
      if (
        !questionnaireObject(option) ||
        !exactKeys(option, ["value", "label"]) ||
        !text(option.value, 100) ||
        !text(option.label, 300)
      )
        return null;
      options.push({ value: option.value, label: option.label });
    }
    if (new Set(options.map((option) => option.value)).size !== options.length)
      return null;
  } else if (value.optionsJson !== null) return null;
  const constraints = value.validationJson;
  const stringType =
    questionType === "short_text" || questionType === "long_text";
  const numericType = questionType === "integer" || questionType === "decimal";
  if (constraints !== null) {
    if (!questionnaireObject(constraints)) return null;
    const keys = stringType
      ? ["minLength", "maxLength"]
      : numericType || questionType === "date"
        ? ["min", "max"]
        : questionType === "multi_choice"
          ? ["minSelections", "maxSelections"]
          : [];
    if (!exactKeys(constraints, keys)) return null;
    for (const [key, item] of Object.entries(constraints)) {
      if (
        questionType === "date" ? !validQuestionnaireDate(item) : !numeric(item)
      )
        return null;
      if (
        (stringType ||
          questionType === "multi_choice" ||
          questionType === "integer") &&
        (!Number.isSafeInteger(item) ||
          Number(item) < (numericType ? -Number.MAX_SAFE_INTEGER : 0))
      )
        return null;
      if ((key === "minLength" || key === "maxLength") && Number(item) > 20000)
        return null;
      if (
        (key === "minSelections" || key === "maxSelections") &&
        Number(item) > (options?.length ?? 0)
      )
        return null;
    }
    const minimum =
      constraints.minLength ?? constraints.minSelections ?? constraints.min;
    const maximum =
      constraints.maxLength ?? constraints.maxSelections ?? constraints.max;
    if (
      (typeof minimum === "number" &&
        typeof maximum === "number" &&
        minimum > maximum) ||
      (typeof minimum === "string" &&
        typeof maximum === "string" &&
        minimum > maximum)
    )
      return null;
    if (
      value.required &&
      ((stringType && constraints.maxLength === 0) ||
        (questionType === "multi_choice" && constraints.maxSelections === 0))
    )
      return null;
  }
  let rule: RiskRule | null = null;
  if (value.riskFlagRuleJson !== null) {
    const candidate = value.riskFlagRuleJson;
    if (
      !questionnaireObject(candidate) ||
      !exactKeys(candidate, ["operator", "value"])
    )
      return null;
    const operator = (["equals", "in", "gt", "gte", "lt", "lte"] as const).find(
      (op) => op === candidate.operator,
    );
    if (!operator) return null;
    const scalar = (item: unknown): item is string | number | boolean =>
      questionType === "boolean"
        ? typeof item === "boolean"
        : numericType
          ? numeric(item) &&
            (questionType !== "integer" || Number.isSafeInteger(item))
          : questionType === "date"
            ? validQuestionnaireDate(item)
            : choice
              ? typeof item === "string" &&
                !!options?.some((o) => o.value === item)
              : typeof item === "string" && item.length <= 20000;
    if (operator === "in") {
      if (
        !Array.isArray(candidate.value) ||
        candidate.value.length === 0 ||
        candidate.value.length > 100 ||
        !candidate.value.every(scalar)
      )
        return null;
      rule = { operator, value: candidate.value };
    } else {
      if (
        questionType === "multi_choice" ||
        !scalar(candidate.value) ||
        (operator !== "equals" && !numericType && questionType !== "date")
      )
        return null;
      rule = { operator, value: candidate.value };
    }
  }
  return {
    questionKey: value.questionKey,
    label: value.label,
    questionType,
    required: value.required,
    optionsJson: options,
    validationJson:
      constraints === null
        ? null
        : (constraints as QuestionInput["validationJson"]),
    riskFlagRuleJson: rule,
  };
}
export function parseQuestionnaireTemplate(
  value: unknown,
): QuestionnaireTemplateInput | null {
  if (
    !questionnaireObject(value) ||
    !exactKeys(value, ["templateKey", "name", "category", "questions"]) ||
    !text(value.templateKey, 80) ||
    !/^[a-z][a-z0-9_]*$/.test(value.templateKey) ||
    !text(value.name, 300) ||
    (value.category !== "assessment" && value.category !== "health") ||
    !Array.isArray(value.questions) ||
    value.questions.length < 1 ||
    value.questions.length > 100
  )
    return null;
  const questions: QuestionInput[] = [];
  for (const item of value.questions) {
    const question = parseQuestion(item);
    if (!question) return null;
    questions.push(question);
  }
  if (new Set(questions.map((q) => q.questionKey)).size !== questions.length)
    return null;
  return {
    templateKey: value.templateKey,
    name: value.name,
    category: value.category,
    questions,
  };
}
export function parseQuestionnaireAnswers(
  value: unknown,
): QuestionnaireAnswer[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const answers: QuestionnaireAnswer[] = [];
  for (const item of value) {
    if (
      !questionnaireObject(item) ||
      !exactKeys(item, ["questionId", "value"]) ||
      typeof item.questionId !== "string" ||
      !("value" in item)
    )
      return null;
    const answer = item.value;
    if (
      answer !== null &&
      typeof answer !== "boolean" &&
      !numeric(answer) &&
      !(typeof answer === "string" && answer.length <= 20000) &&
      !(
        Array.isArray(answer) &&
        answer.length <= 100 &&
        answer.every((v) => typeof v === "string" && v.length <= 100)
      )
    )
      return null;
    answers.push({
      questionId: item.questionId,
      value: answer as QuestionValue,
    });
  }
  return new Set(answers.map((answer) => answer.questionId)).size ===
    answers.length
    ? answers
    : null;
}
export function validateQuestionnaireAnswers(
  questions: (QuestionInput & { id: string })[],
  answers: QuestionnaireAnswer[],
): boolean {
  if (
    new Set(answers.map((a) => a.questionId)).size !== answers.length ||
    answers.some((answer) => !questions.some((q) => q.id === answer.questionId))
  )
    return false;
  return questions.every((question) => {
    const value =
      answers.find((answer) => answer.questionId === question.id)?.value ??
      null;
    if (value === null) return !question.required;
    const constraints = question.validationJson;
    switch (question.questionType) {
      case "short_text":
      case "long_text":
        return (
          typeof value === "string" &&
          value.length <= 20000 &&
          (!question.required || !!value.trim()) &&
          value.length >= (constraints?.minLength ?? 0) &&
          value.length <= (constraints?.maxLength ?? 20000)
        );
      case "boolean":
        return typeof value === "boolean";
      case "single_choice":
        return (
          typeof value === "string" &&
          !!question.optionsJson?.some((option) => option.value === value)
        );
      case "multi_choice":
        return (
          Array.isArray(value) &&
          new Set(value).size === value.length &&
          value.length >=
            Math.max(
              question.required ? 1 : 0,
              constraints?.minSelections ?? 0,
            ) &&
          value.length <= (constraints?.maxSelections ?? 100) &&
          value.every((item) =>
            question.optionsJson?.some((option) => option.value === item),
          )
        );
      case "integer":
      case "decimal":
        return (
          numeric(value) &&
          (question.questionType !== "integer" ||
            Number.isSafeInteger(value)) &&
          (constraints?.min === undefined ||
            value >= Number(constraints.min)) &&
          (constraints?.max === undefined || value <= Number(constraints.max))
        );
      case "date":
        return (
          validQuestionnaireDate(value) &&
          (constraints?.min === undefined ||
            value >= String(constraints.min)) &&
          (constraints?.max === undefined || value <= String(constraints.max))
        );
    }
  });
}

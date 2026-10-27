import assert from "node:assert/strict";
import test from "node:test";
import {
  questionTypes,
  questionnaireApiRoutes,
  type QuestionInput,
} from "./contracts.js";
import {
  parseQuestionnaireAnswers,
  parseQuestionnaireTemplate,
  validateQuestionnaireAnswers,
} from "./schema.js";
const base = (questionType: QuestionInput["questionType"]): QuestionInput => ({
  questionKey: "synthetic",
  label: "Synthetic test question",
  questionType,
  required: true,
  optionsJson: questionType.endsWith("choice")
    ? [
        { value: "a", label: "Synthetic A" },
        { value: "b", label: "Synthetic B" },
      ]
    : null,
  validationJson: null,
  riskFlagRuleJson: null,
});
const values = {
  short_text: "Short",
  long_text: "Long\ntext",
  boolean: false,
  single_choice: "a",
  multi_choice: ["a"],
  integer: 0,
  decimal: 1.25,
  date: "2026-10-21",
};
for (const type of questionTypes)
  test(`questionnaire schema round-trips ${type} without stripping its answer`, () => {
    const input = {
      templateKey: "synthetic",
      name: "Synthetic test",
      category: "assessment",
      questions: [base(type)],
    };
    const parsed = parseQuestionnaireTemplate(input);
    assert.deepEqual(parsed, input);
    const answers = parseQuestionnaireAnswers([
      { questionId: "question-1", value: values[type] },
    ]);
    assert.ok(answers);
    assert.deepEqual(answers[0]?.value, values[type]);
    assert.equal(
      validateQuestionnaireAnswers(
        [{ ...base(type), id: "question-1" }],
        answers,
      ),
      true,
    );
  });
test("questionnaire rejects unknown fields, duplicate answer IDs and unknown question IDs", () => {
  assert.equal(
    parseQuestionnaireAnswers([
      { questionId: "x", value: "a" },
      { questionId: "x", value: "b" },
    ]),
    null,
  );
  assert.equal(
    parseQuestionnaireAnswers([
      { questionId: "x", value: "a", templateId: "override" },
    ]),
    null,
  );
  assert.equal(
    validateQuestionnaireAnswers(
      [{ ...base("short_text"), id: "x" }],
      [{ questionId: "other", value: "value" }],
    ),
    false,
  );
});
test("questionnaire allowlists metadata and prohibits executable/cross-question expressions", () => {
  const input = (question: unknown) => ({
    templateKey: "synthetic",
    name: "Synthetic",
    category: "health",
    questions: [question],
  });
  for (const metadata of [
    { expression: "eval(answer)" },
    { operator: "equals", value: true, otherQuestion: "x" },
    { operator: "script", value: "x" },
  ])
    assert.equal(
      parseQuestionnaireTemplate(
        input({ ...base("boolean"), riskFlagRuleJson: metadata }),
      ),
      null,
    );
  assert.equal(
    parseQuestionnaireTemplate(
      input({ ...base("boolean"), validationJson: { minLength: 2 } }),
    ),
    null,
  );
  assert.equal(
    parseQuestionnaireTemplate({
      ...input(base("boolean")),
      customerId: "overridden",
    }),
    null,
  );
});
test("questionnaire required and numeric/date/string/choice constraints reject invalid values", () => {
  const check = (question: QuestionInput, value: unknown) => {
    const answers = parseQuestionnaireAnswers([{ questionId: "x", value }]);
    return (
      !!answers &&
      validateQuestionnaireAnswers([{ ...question, id: "x" }], answers)
    );
  };
  assert.equal(check(base("boolean"), null), false);
  assert.equal(check(base("boolean"), "false"), false);
  assert.equal(
    check({ ...base("integer"), validationJson: { min: 1, max: 3 } }, 0),
    false,
  );
  assert.equal(check(base("integer"), 1.5), false);
  assert.equal(check(base("date"), "2026-02-30"), false);
  assert.equal(
    check(
      { ...base("date"), validationJson: { min: "2026-01-01" } },
      "2025-01-01",
    ),
    false,
  );
  assert.equal(
    check(
      { ...base("short_text"), validationJson: { maxLength: 3 } },
      "longer",
    ),
    false,
  );
  assert.equal(check(base("single_choice"), "unknown"), false);
  assert.equal(check(base("multi_choice"), ["a", "a"]), false);
});
test("questionnaire optional null is retained explicitly; no value is silently omitted", () => {
  const answer = [{ questionId: "x", value: null }];
  assert.deepEqual(parseQuestionnaireAnswers(answer), answer);
  assert.equal(
    validateQuestionnaireAnswers(
      [{ ...base("boolean"), id: "x", required: false }],
      answer,
    ),
    true,
  );
});
test("required multi-choice cannot weaken its required flag using a zero selection limit", () => {
  const question = {
    ...base("multi_choice"),
    id: "x",
    validationJson: { minSelections: 0 },
  };
  assert.equal(
    validateQuestionnaireAnswers([question], [{ questionId: "x", value: [] }]),
    false,
  );
  assert.equal(
    parseQuestionnaireTemplate({
      templateKey: "synthetic",
      name: "Synthetic",
      category: "assessment",
      questions: [
        { ...base("multi_choice"), validationJson: { maxSelections: 0 } },
      ],
    }),
    null,
  );
});
test("questionnaire contracts keep public questionnaire and consent token routes separate", () => {
  assert.equal(questionnaireApiRoutes.public, "/public/questionnaires/:token");
  assert.equal(questionTypes.length, 8);
});

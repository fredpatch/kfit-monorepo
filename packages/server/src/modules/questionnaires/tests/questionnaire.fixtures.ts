import { randomUUID } from "node:crypto";
import {
  questionTypes,
  type QuestionInput,
  type QuestionnaireTemplateInput,
} from "@kfit/shared";
export function syntheticQuestion(
  type: QuestionInput["questionType"] = "boolean",
  key = "synthetic_flag",
): QuestionInput {
  return {
    questionKey: key,
    label: "SYNTHETIC TEST QUESTION",
    questionType: type,
    required: true,
    optionsJson: type.endsWith("choice")
      ? [
          { value: "a", label: "Synthetic A" },
          { value: "b", label: "Synthetic B" },
        ]
      : null,
    validationJson: null,
    riskFlagRuleJson: null,
  };
}
export function syntheticTemplate(
  category: "assessment" | "health" = "assessment",
  questions = [syntheticQuestion()],
): QuestionnaireTemplateInput {
  return {
    templateKey: `synthetic_${randomUUID().replaceAll("-", "")}`,
    name: "SYNTHETIC TEST TEMPLATE",
    category,
    questions,
  };
}
export const allTypeQuestions = () =>
  questionTypes.map((type) => syntheticQuestion(type, `synthetic_${type}`));
export const syntheticValues = {
  short_text: "SYNTHETIC PRIVATE TEXT",
  long_text: "SYNTHETIC PRIVATE HEALTH DETAIL",
  boolean: true,
  single_choice: "a",
  multi_choice: ["a"],
  integer: 10,
  decimal: 2.5,
  date: "2026-10-21",
};

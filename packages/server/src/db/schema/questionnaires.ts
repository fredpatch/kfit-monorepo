import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn } from "./_helpers.js";
import { users } from "./auth.js";
import { services, serviceVariants } from "./catalogue.js";
import { subscriptions } from "./customers.js";

export const questionnaireTemplates = pgTable("questionnaire_templates", {
  id: idColumn(),
  templateKey: text("template_key").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "restrict" }),
  variantId: uuid("variant_id").references(() => serviceVariants.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
}, (t) => [uniqueIndex("questionnaire_templates_key_version_uq").on(t.templateKey, t.version)]);

export const questionnaireQuestions = pgTable("questionnaire_questions", {
  id: idColumn(),
  templateId: uuid("template_id").notNull().references(() => questionnaireTemplates.id, { onDelete: "restrict" }),
  questionKey: text("question_key").notNull(),
  label: text("label").notNull(),
  questionType: text("question_type").notNull(),
  required: text("required").notNull().default("false"),
  sortOrder: integer("sort_order").notNull().default(0),
  optionsJson: jsonb("options_json"),
  validationJson: jsonb("validation_json"),
  riskFlagRuleJson: jsonb("risk_flag_rule_json"),
}, (t) => [uniqueIndex("questionnaire_questions_key_uq").on(t.templateId, t.questionKey)]);

export const questionnaireSubmissions = pgTable("questionnaire_submissions", {
  id: idColumn(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "restrict" }),
  templateId: uuid("template_id").notNull().references(() => questionnaireTemplates.id, { onDelete: "restrict" }),
  templateVersion: integer("template_version").notNull(),
  revisionNumber: integer("revision_number").notNull(),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  supersedesSubmissionId: uuid("supersedes_submission_id"),
  enteredByUserId: uuid("entered_by_user_id").references(() => users.id, { onDelete: "set null" }),
  source: text("source").notNull(),
}, (t) => [
  uniqueIndex("questionnaire_submission_revision_uq").on(t.subscriptionId, t.templateId, t.revisionNumber),
  index("questionnaire_submission_subscription_idx").on(t.subscriptionId, t.submittedAt),
]);

export const questionnaireAnswers = pgTable("questionnaire_answers", {
  id: idColumn(),
  submissionId: uuid("submission_id").notNull().references(() => questionnaireSubmissions.id, { onDelete: "restrict" }),
  questionId: uuid("question_id").notNull().references(() => questionnaireQuestions.id, { onDelete: "restrict" }),
  answerJson: jsonb("answer_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("questionnaire_answers_submission_question_uq").on(t.submissionId, t.questionId)]);

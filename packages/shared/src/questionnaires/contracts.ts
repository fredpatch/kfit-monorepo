import type {
  ConsentDefinition,
  ConsentLinkState,
} from "../consents/contracts.js";
export const questionTypes = [
  "short_text",
  "long_text",
  "boolean",
  "single_choice",
  "multi_choice",
  "integer",
  "decimal",
  "date",
] as const;
export type QuestionType = (typeof questionTypes)[number];
export type QuestionValue = string | number | boolean | string[] | null;
export type RiskRule = {
  operator: "equals" | "in" | "gt" | "gte" | "lt" | "lte";
  value: string | number | boolean | (string | number | boolean)[];
};
export type QuestionInput = {
  questionKey: string;
  label: string;
  questionType: QuestionType;
  required: boolean;
  optionsJson: { value: string; label: string }[] | null;
  validationJson: {
    minLength?: number;
    maxLength?: number;
    min?: number | string;
    max?: number | string;
    minSelections?: number;
    maxSelections?: number;
  } | null;
  riskFlagRuleJson: RiskRule | null;
};
export type QuestionnaireTemplateInput = {
  templateKey: string;
  name: string;
  category: "assessment" | "health";
  questions: QuestionInput[];
};
export type QuestionnaireTemplate = Omit<
  QuestionnaireTemplateInput,
  "questions"
> & {
  id: string;
  version: number;
  status: "draft" | "published" | "retired";
  publishedAt: string | null;
  questions: (QuestionInput & { id: string; sortOrder: number })[];
  schemaHash: string;
};
export type QuestionnaireAnswer = { questionId: string; value: QuestionValue };
export type QuestionnaireSubmitInput = {
  templateId: string;
  templateVersion: number;
  schemaHash: string;
  expectedHeadId: string | null;
  answers: QuestionnaireAnswer[];
};
export type PublicQuestionnaireSubmitInput = {
  answers: QuestionnaireAnswer[];
  healthDataDecision?: "granted" | "refused";
};
export type QuestionnaireRevision = {
  id: string;
  templateId: string;
  templateVersion: number;
  revisionNumber: number;
  supersedesSubmissionId: string | null;
  submittedAt: string;
  source: "public_link" | "coach_assisted";
  enteredByUserId: string | null;
  isCurrent: boolean;
};
export type QuestionnaireDocument = {
  subscriptionReference: string;
  template: QuestionnaireTemplate;
  expectedHeadId: string | null;
  healthConsent: { definition: ConsentDefinition; granted: boolean } | null;
};
/** UX-14c read-only view of one revision. Values are returned as submitted; labels come from the template version answered. */
export type QuestionnaireRevisionAnswers = {
  revision: {
    id: string;
    revisionNumber: number;
    templateVersion: number;
    submittedAt: string;
    source: "public_link" | "coach_assisted";
  };
  template: {
    id: string;
    name: string;
    version: number;
    category: "assessment" | "health";
  };
  questions: Array<{
    id: string;
    label: string;
    questionType: QuestionType;
    optionsJson: { value: string; label: string }[] | null;
    sortOrder: number;
  }>;
  answers: QuestionnaireAnswer[];
  viewedAt: string;
};
export type QuestionnaireDetail = {
  document: QuestionnaireDocument | null;
  history: QuestionnaireRevision[];
  links: ConsentLinkState[];
  waived: boolean;
};
export type QuestionnaireSubmitResult = {
  outcome: "submitted" | "health_consent_refused";
  submissionId: string | null;
  revisionNumber: number | null;
};
export type QuestionnaireAssignmentScope = {
  serviceId: string;
  serviceName: string;
  variantId: string | null;
  variantName: string | null;
  questionnaireTemplateId: string | null;
  effectiveQuestionnaireTemplateId: string | null;
};
export type QuestionnaireAssignmentInput = {
  serviceId: string;
  variantId: string | null;
  questionnaireTemplateId: string | null;
};
export const questionnaireApiRoutes = {
  templates: "/admin/questionnaire-templates",
  publish: "/admin/questionnaire-templates/:templateId/publish",
  newVersion: "/admin/questionnaire-templates/:templateId/new-version",
  assignments: "/admin/questionnaire-assignments",
  detail: "/admin/subscriptions/:subscriptionId/questionnaire",
  coachSubmit:
    "/admin/subscriptions/:subscriptionId/questionnaire/coach-submit",
  link: "/admin/subscriptions/:subscriptionId/questionnaire-link",
  revokeLink:
    "/admin/subscriptions/:subscriptionId/questionnaire-link/:tokenId/revoke",
  /** UX-14c: one revision with its answers. Audited, fresh OTP required, health answers need a current health-data consent. */
  revisionAnswers:
    "/admin/subscriptions/:subscriptionId/questionnaire/revisions/:submissionId",
  public: "/public/questionnaires/:token",
} as const;
export const questionnaireErrorCodes = [
  "QUESTIONNAIRE_INVALID_INPUT",
  "QUESTIONNAIRE_TEMPLATE_INVALID",
  "QUESTIONNAIRE_ANSWERS_INVALID",
  "QUESTIONNAIRE_NOT_FOUND",
  "QUESTIONNAIRE_ADMIN_FORBIDDEN",
  "QUESTIONNAIRE_INVALID_STATE",
  "QUESTIONNAIRE_TEMPLATE_IMMUTABLE",
  "QUESTIONNAIRE_VERSION_CONFLICT",
  "QUESTIONNAIRE_ASSIGNMENT_INVALID",
  "QUESTIONNAIRE_NOT_ASSIGNED",
  "QUESTIONNAIRE_STALE_REVISION",
  "QUESTIONNAIRE_STALE_SCHEMA",
  "QUESTIONNAIRE_HISTORY_INVALID",
  "QUESTIONNAIRE_HEALTH_CONSENT_REQUIRED",
  "QUESTIONNAIRE_HEALTH_CONSENT_WITHDRAWN",
  "QUESTIONNAIRE_HEALTH_DEFINITION_MISSING",
  "QUESTIONNAIRE_LINK_INVALID",
  "QUESTIONNAIRE_LINK_EXPIRED",
  "QUESTIONNAIRE_LINK_REVOKED",
  "QUESTIONNAIRE_LINK_CONSUMED",
  "QUESTIONNAIRE_LINK_STALE",
  "QUESTIONNAIRE_RATE_LIMITED",
  "QUESTIONNAIRE_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type QuestionnaireErrorCode = (typeof questionnaireErrorCodes)[number];

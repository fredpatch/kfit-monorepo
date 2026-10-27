import {
  exactKeys,
  parseQuestionnaireAnswers,
  parseQuestionnaireTemplate,
  questionnaireObject,
  type PublicQuestionnaireSubmitInput,
  type QuestionnaireDetail,
  type QuestionnaireDocument,
  type QuestionnaireErrorCode,
  type QuestionnaireSubmitInput,
  type QuestionnaireSubmitResult,
  type QuestionnaireTemplate,
  type QuestionnaireTemplateInput,
  type QuestionnaireAssignmentInput,
  type QuestionnaireAssignmentScope,
} from "@kfit/shared";
import {
  uuidPattern,
  type ConsentActor,
} from "../../consents/services/consent.service.js";
export type QuestionnaireActor = ConsentActor;
export type QuestionnaireBody =
  | { templates: QuestionnaireTemplate[] }
  | { template: QuestionnaireTemplate }
  | { assignments: QuestionnaireAssignmentScope[] }
  | { assignment: QuestionnaireAssignmentScope }
  | { questionnaire: QuestionnaireDetail }
  | { revoked: true }
  | { document: QuestionnaireDocument }
  | { result: QuestionnaireSubmitResult }
  | { token: string; link: import("@kfit/shared").ConsentLinkState }
  | { answers: import("@kfit/shared").QuestionnaireRevisionAnswers };
export type QuestionnaireResult =
  | { ok: true; body: QuestionnaireBody }
  | { ok: false; error: QuestionnaireErrorCode };
export const questionnaireFailure = (
  error: QuestionnaireErrorCode,
): QuestionnaireResult => ({ ok: false, error });
export type TemplateCommand =
  | { action: "list" }
  | { action: "create"; input: QuestionnaireTemplateInput }
  | { action: "publish"; templateId: string }
  | {
      action: "new_version";
      templateId: string;
      input: QuestionnaireTemplateInput;
    }
  | { action: "assignment_list" }
  | { action: "assignment_set"; input: QuestionnaireAssignmentInput };
export interface TemplateRepository {
  execute(
    command: TemplateCommand,
    actor: QuestionnaireActor,
  ): Promise<QuestionnaireResult>;
}
export type QuestionnaireCommand =
  | { action: "read" }
  | { action: "issue"; expiresAt: Date }
  | { action: "revoke_link"; tokenId: string }
  | { action: "submit"; input: QuestionnaireSubmitInput }
  | { action: "view_answers"; submissionId: string };
export interface QuestionnaireRepository {
  execute(
    subscriptionId: string,
    command: QuestionnaireCommand,
    actor: QuestionnaireActor,
  ): Promise<QuestionnaireResult>;
  publicAccess(
    token: string,
    input: PublicQuestionnaireSubmitInput | null,
    actor: QuestionnaireActor,
    rejectedInput?: boolean,
  ): Promise<QuestionnaireResult>;
}
export class QuestionnaireTemplateService {
  constructor(private readonly repository: TemplateRepository) {}
  async execute(
    action: TemplateCommand["action"],
    body: unknown,
    templateId: string | undefined,
    actor: QuestionnaireActor,
  ): Promise<QuestionnaireResult> {
    if (action === "list" || action === "assignment_list")
      return this.repository.execute({ action }, actor);
    if (action === "assignment_set") {
      if (
        !questionnaireObject(body) ||
        !exactKeys(body, ["serviceId", "variantId", "questionnaireTemplateId"])
      )
        return questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
      const input = body as Record<string, unknown>;
      if (
        typeof input.serviceId !== "string" ||
        !uuidPattern.test(input.serviceId)
      )
        return questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
      if (
        !(
          input.variantId === null ||
          (typeof input.variantId === "string" &&
            uuidPattern.test(input.variantId))
        )
      )
        return questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
      if (
        !(
          input.questionnaireTemplateId === null ||
          (typeof input.questionnaireTemplateId === "string" &&
            uuidPattern.test(input.questionnaireTemplateId))
        )
      )
        return questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
      return this.repository.execute(
        {
          action,
          input: {
            serviceId: input.serviceId,
            variantId: input.variantId as string | null,
            questionnaireTemplateId: input.questionnaireTemplateId as
              | string
              | null,
          },
        },
        actor,
      );
    }
    if (action !== "create" && (!templateId || !uuidPattern.test(templateId)))
      return questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
    if (action === "publish")
      return questionnaireObject(body) && Object.keys(body).length === 0
        ? this.repository.execute({ action, templateId: templateId! }, actor)
        : questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
    const input = parseQuestionnaireTemplate(body);
    if (!input) return questionnaireFailure("QUESTIONNAIRE_TEMPLATE_INVALID");
    return this.repository.execute(
      action === "create"
        ? { action, input }
        : { action, input, templateId: templateId! },
      actor,
    );
  }
}
export class QuestionnaireService {
  constructor(private readonly repository: QuestionnaireRepository) {}
  async execute(
    id: string,
    action: QuestionnaireCommand["action"],
    body: unknown,
    selector: string | undefined,
    actor: QuestionnaireActor,
  ): Promise<QuestionnaireResult> {
    const invalid = () => questionnaireFailure("QUESTIONNAIRE_INVALID_INPUT");
    if (!uuidPattern.test(id) || !questionnaireObject(body)) return invalid();
    if (action === "read")
      return this.repository.execute(id, { action }, actor);
    // UX-14c: the controller has already checked the admin role and a fresh OTP.
    if (action === "view_answers")
      return selector &&
        uuidPattern.test(selector) &&
        Object.keys(body).length === 0
        ? this.repository.execute(id, { action, submissionId: selector }, actor)
        : invalid();
    if (action === "revoke_link")
      return selector &&
        uuidPattern.test(selector) &&
        Object.keys(body).length === 0
        ? this.repository.execute(id, { action, tokenId: selector }, actor)
        : invalid();
    if (action === "issue") {
      if (
        !exactKeys(body, ["expiresAt"]) ||
        typeof body.expiresAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.expiresAt)
      )
        return invalid();
      const expiresAt = new Date(body.expiresAt);
      return Number.isFinite(expiresAt.getTime()) &&
        expiresAt.getTime() > Date.now()
        ? this.repository.execute(id, { action, expiresAt }, actor)
        : invalid();
    }
    if (
      !exactKeys(body, [
        "templateId",
        "templateVersion",
        "schemaHash",
        "expectedHeadId",
        "answers",
      ]) ||
      typeof body.templateId !== "string" ||
      !uuidPattern.test(body.templateId) ||
      typeof body.templateVersion !== "number" ||
      !Number.isSafeInteger(body.templateVersion) ||
      body.templateVersion < 1 ||
      typeof body.schemaHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.schemaHash) ||
      !(
        body.expectedHeadId === null ||
        (typeof body.expectedHeadId === "string" &&
          uuidPattern.test(body.expectedHeadId))
      )
    )
      return invalid();
    const answers = parseQuestionnaireAnswers(body.answers);
    if (!answers) return questionnaireFailure("QUESTIONNAIRE_ANSWERS_INVALID");
    return this.repository.execute(
      id,
      {
        action,
        input: {
          templateId: body.templateId,
          templateVersion: body.templateVersion,
          schemaHash: body.schemaHash,
          expectedHeadId: body.expectedHeadId,
          answers,
        },
      },
      actor,
    );
  }
  async publicAccess(
    token: string,
    body: unknown,
    submit: boolean,
    actor: QuestionnaireActor,
  ): Promise<QuestionnaireResult> {
    if (!submit) return this.repository.publicAccess(token, null, actor);
    if (
      !questionnaireObject(body) ||
      !exactKeys(body, ["answers", "healthDataDecision"]) ||
      (body.healthDataDecision !== undefined &&
        !["granted", "refused"].includes(String(body.healthDataDecision)))
    )
      return this.repository.publicAccess(token, null, actor, true);
    const answers = parseQuestionnaireAnswers(body.answers);
    if (!answers) return this.repository.publicAccess(token, null, actor, true);
    return this.repository.publicAccess(
      token,
      {
        answers,
        ...(body.healthDataDecision === "granted" ||
        body.healthDataDecision === "refused"
          ? { healthDataDecision: body.healthDataDecision }
          : {}),
      },
      actor,
    );
  }
}

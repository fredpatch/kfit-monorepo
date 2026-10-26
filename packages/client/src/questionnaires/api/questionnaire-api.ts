import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, questionnaireApiRoutes, type QuestionnaireDetail, type QuestionnaireDocument, type QuestionnaireSubmitInput, type QuestionnaireSubmitResult,
  type QuestionnaireTemplate, type QuestionnaireTemplateInput, type QuestionnaireAssignmentInput, type QuestionnaireAssignmentScope, type PublicQuestionnaireSubmitInput, type ConsentLinkState, type QuestionnaireRevisionAnswers } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import { commonApiErrorMessage, type ApiErrorAudience } from "../../lib/api-error-messages.js";
const admin = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
admin.interceptors.request.use(config => {
  if (requiresCsrfHeader(config.method)) { const headers = AxiosHeaders.from(config.headers); const token = buildCsrfHeaders(config.method)[authCsrfHeaderName]; if (token) headers.set(authCsrfHeaderName, token); config.headers = headers; }
  return config;
});
const publicHttp = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: false, headers: { accept: "application/json" } });
const route = (path: string, id: string) => path.replace(":subscriptionId", encodeURIComponent(id)).replace(":templateId", encodeURIComponent(id));
export const questionnaireApi = {
  async templates() { return (await admin.get<{ templates: QuestionnaireTemplate[] }>(questionnaireApiRoutes.templates)).data; },
  async create(input: QuestionnaireTemplateInput) { return (await admin.post<{ template: QuestionnaireTemplate }>(questionnaireApiRoutes.templates, input)).data; },
  async publish(id: string) { return (await admin.post<{ template: QuestionnaireTemplate }>(route(questionnaireApiRoutes.publish, id), {})).data; },
  async assignments() { return (await admin.get<{ assignments: QuestionnaireAssignmentScope[] }>(questionnaireApiRoutes.assignments)).data; },
  async assign(input: QuestionnaireAssignmentInput) { return (await admin.post<{ assignment: QuestionnaireAssignmentScope }>(questionnaireApiRoutes.assignments, input)).data; },
  async newVersion(id: string, input: QuestionnaireTemplateInput) { return (await admin.post<{ template: QuestionnaireTemplate }>(route(questionnaireApiRoutes.newVersion, id), input)).data; },
  /** UX-14c: answers of one revision. Audited server-side; 403 AUTH_FRESH_OTP_REQUIRED asks for the e-mailed code first. */
  async answers(id: string, submissionId: string) { return (await admin.get<{ answers: QuestionnaireRevisionAnswers }>(route(questionnaireApiRoutes.revisionAnswers, id).replace(":submissionId", encodeURIComponent(submissionId)))).data; },
  async get(id: string) { return (await admin.get<{ questionnaire: QuestionnaireDetail }>(route(questionnaireApiRoutes.detail, id))).data; },
  async submit(id: string, input: QuestionnaireSubmitInput) { return (await admin.post<{ result: QuestionnaireSubmitResult }>(route(questionnaireApiRoutes.coachSubmit, id), input)).data; },
  async issue(id: string, expiresAt: string) { return (await admin.post<{ token: string; link: ConsentLinkState }>(route(questionnaireApiRoutes.link, id), { expiresAt })).data; },
  async revoke(id: string, tokenId: string) { return (await admin.post<{ revoked: true }>(route(questionnaireApiRoutes.revokeLink, id).replace(":tokenId", encodeURIComponent(tokenId)), {})).data; },
  async publicGet(token: string) { return (await publicHttp.get<{ document: QuestionnaireDocument }>(questionnaireApiRoutes.public.replace(":token", encodeURIComponent(token)))).data; },
  async publicSubmit(token: string, input: PublicQuestionnaireSubmitInput) { return (await publicHttp.post<{ result: QuestionnaireSubmitResult }>(questionnaireApiRoutes.public.replace(":token", encodeURIComponent(token)), input)).data; },
};
export function questionnaireErrorMessage(error: unknown, audience: ApiErrorAudience = "admin"): string {
  const code: unknown = axios.isAxiosError(error) ? error.response?.data?.error : null;
  const common = commonApiErrorMessage(code, audience);
  if (common) return common;
  const messages: Record<string, string> = {
    QUESTIONNAIRE_INVALID_INPUT: "Vérifie les informations saisies et la date d’expiration.", QUESTIONNAIRE_TEMPLATE_INVALID: "Vérifie les questions, les choix, les limites et les règles de signalement.",
    QUESTIONNAIRE_ANSWERS_INVALID: "Vérifie les réponses obligatoires et les limites de chaque question.", QUESTIONNAIRE_NOT_FOUND: "Modèle, abonnement ou lien introuvable.",
    QUESTIONNAIRE_INVALID_STATE: "Ce questionnaire ne peut pas être modifié dans l’état actuel de l’abonnement.", QUESTIONNAIRE_TEMPLATE_IMMUTABLE: "Cette version est déjà publiée. Crée une nouvelle version pour la modifier.",
    QUESTIONNAIRE_VERSION_CONFLICT: "Cette référence ou version existe déjà. Actualise la liste des modèles.", QUESTIONNAIRE_ASSIGNMENT_INVALID: "La configuration doit désigner un modèle publié valide.",
    QUESTIONNAIRE_NOT_ASSIGNED: "Aucun questionnaire n’est prévu pour cet abonnement.", QUESTIONNAIRE_STALE_REVISION: "Une autre révision a été enregistrée. Actualise avant de corriger les réponses.",
    QUESTIONNAIRE_STALE_SCHEMA: "Le questionnaire a changé. Actualise avant de saisir les réponses.", QUESTIONNAIRE_HEALTH_CONSENT_REQUIRED: "L’accord actuel au traitement des données de santé est nécessaire. Recueille-le avec le lien client.", QUESTIONNAIRE_HEALTH_CONSENT_WITHDRAWN: "La cliente a retiré son accord au traitement des données de santé : ses réponses ne sont plus consultables.",
    QUESTIONNAIRE_HEALTH_DEFINITION_MISSING: "Un document de consentement aux données de santé doit être publié avant ce recueil.",
    QUESTIONNAIRE_LINK_INVALID: "Ce lien est invalide. Demande un nouveau lien au coach.", QUESTIONNAIRE_LINK_EXPIRED: "Ce lien a expiré. Demande un nouveau lien au coach.",
    QUESTIONNAIRE_LINK_REVOKED: "Ce lien a été révoqué. Demande un nouveau lien au coach.", QUESTIONNAIRE_LINK_CONSUMED: "Ce lien a déjà été utilisé. Aucun nouvel envoi n’est possible avec ce lien.",
    QUESTIONNAIRE_LINK_STALE: "Le questionnaire ou le consentement a changé, ou une réponse a déjà été enregistrée. Demande un nouveau lien au coach.",
    QUESTIONNAIRE_RATE_LIMITED: "Trop de tentatives. Réessaie dans une minute.",
  };
  return typeof code === "string" && messages[code] ? messages[code] : "Impossible de traiter le questionnaire. Actualise et vérifie l’état avant de réessayer.";
}

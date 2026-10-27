import axios, { AxiosHeaders } from "axios";
import {
  authCsrfHeaderName,
  consentApiRoutes,
  consentDefinitionApiRoutes,
  type ConsentDecisions,
  type ConsentDefinitionDraftInput,
  type ConsentDefinitionDraftUpdate,
  type ConsentDefinitionListResponse,
  type ConsentDefinitionResponse,
  type ConsentLinkResponse,
  type ConsentPublicResponse,
  type ConsentPublishImpactResponse,
  type ConsentResponse,
  type ConsentType,
  type OptionalConsentType,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import {
  commonApiErrorMessage,
  type ApiErrorAudience,
} from "../../lib/api-error-messages.js";
const admin = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: { accept: "application/json" },
});
admin.interceptors.request.use((config) => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers);
    const token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});
const publicHttp = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: false,
  headers: { accept: "application/json" },
});
function route(path: string, id: string) {
  return path.replace(":subscriptionId", encodeURIComponent(id));
}
export const consentApi = {
  async get(id: string) {
    return (
      await admin.get<ConsentResponse>(route(consentApiRoutes.detail, id))
    ).data;
  },
  async issue(id: string, expiresAt: string) {
    return (
      await admin.post<ConsentLinkResponse>(route(consentApiRoutes.link, id), {
        expiresAt,
      })
    ).data;
  },
  async revokeLink(id: string, tokenId: string) {
    return (
      await admin.post<ConsentResponse>(
        route(consentApiRoutes.revokeLink, id).replace(
          ":tokenId",
          encodeURIComponent(tokenId),
        ),
        {},
      )
    ).data;
  },
  async capture(
    id: string,
    decisions: ConsentDecisions,
    expectedDefinitionIds: string[],
  ) {
    return (
      await admin.post<ConsentResponse>(route(consentApiRoutes.capture, id), {
        decisions,
        expectedDefinitionIds,
      })
    ).data;
  },
  async requestOptional(
    id: string,
    types: OptionalConsentType[],
    expiresAt: string,
  ) {
    return (
      await admin.post<ConsentLinkResponse>(
        route(consentApiRoutes.optionalLink, id),
        { types, expiresAt },
      )
    ).data;
  },
  async captureOptional(
    id: string,
    decisions: ConsentDecisions,
    expectedDefinitionIds: string[],
  ) {
    return (
      await admin.post<ConsentResponse>(
        route(consentApiRoutes.optionalCapture, id),
        { decisions, expectedDefinitionIds },
      )
    ).data;
  },
  async revoke(id: string, type: ConsentType) {
    return (
      await admin.post<ConsentResponse>(
        route(consentApiRoutes.revoke, id).replace(":consentType", type),
        {},
      )
    ).data;
  },
  async publicGet(token: string) {
    return (
      await publicHttp.get<ConsentPublicResponse>(
        consentApiRoutes.public.replace(":token", encodeURIComponent(token)),
      )
    ).data;
  },
  async publicSubmit(token: string, decisions: ConsentDecisions) {
    return (
      await publicHttp.post<{ accepted: true }>(
        consentApiRoutes.public.replace(":token", encodeURIComponent(token)),
        { decisions },
      )
    ).data;
  },
};
const definition = (id: string) =>
  consentDefinitionApiRoutes.detail.replace(
    ":definitionId",
    encodeURIComponent(id),
  );
export const consentDefinitionsApi = {
  async list() {
    return (
      await admin.get<ConsentDefinitionListResponse>(
        consentDefinitionApiRoutes.list,
      )
    ).data;
  },
  async get(id: string) {
    return (await admin.get<ConsentDefinitionResponse>(definition(id))).data;
  },
  async create(input: ConsentDefinitionDraftInput) {
    return (
      await admin.post<ConsentDefinitionResponse>(
        consentDefinitionApiRoutes.list,
        input,
      )
    ).data;
  },
  async update(id: string, input: ConsentDefinitionDraftUpdate) {
    return (await admin.patch<ConsentDefinitionResponse>(definition(id), input))
      .data;
  },
  async remove(id: string) {
    return (await admin.delete<{ deleted: true }>(definition(id))).data;
  },
  async impact(id: string) {
    return (
      await admin.get<ConsentPublishImpactResponse>(
        consentDefinitionApiRoutes.publishImpact.replace(
          ":definitionId",
          encodeURIComponent(id),
        ),
      )
    ).data;
  },
  /** 403 AUTH_FRESH_OTP_REQUIRED asks for the e-mailed code first. */
  async publish(id: string) {
    return (
      await admin.post<ConsentDefinitionResponse>(
        consentDefinitionApiRoutes.publish.replace(
          ":definitionId",
          encodeURIComponent(id),
        ),
        {},
      )
    ).data;
  },
};
export function consentErrorCode(error: unknown): string | null {
  const code: unknown = axios.isAxiosError(error)
    ? error.response?.data?.error
    : null;
  return typeof code === "string" ? code : null;
}
export function consentErrorMessage(
  error: unknown,
  audience: ApiErrorAudience = "admin",
): string {
  const code: unknown = axios.isAxiosError(error)
    ? error.response?.data?.error
    : null;
  const common = commonApiErrorMessage(code, audience);
  if (common) return common;
  const messages: Record<string, string> = {
    CONSENT_INVALID_INPUT: "Vérifie les choix et la date d’expiration.",
    CONSENT_DEFINITIONS_MISSING:
      "Chaque texte demandé doit être publié avant tout recueil (Configuration › Textes de consentement).",
    CONSENT_TYPE_NOT_REQUESTED:
      "Ce lien ne concerne pas ce consentement. Demande un nouveau lien au coach.",
    CONSENT_DEFINITION_IMMUTABLE:
      "Ce texte est publié : il ne peut plus être modifié ni supprimé. Crée une nouvelle version.",
    CONSENT_VERSION_CONFLICT:
      "Une version plus récente de ce texte a déjà été publiée. Actualise la page.",
    AUTH_FRESH_OTP_REQUIRED:
      "Confirme d’abord ton identité avec le code envoyé par e-mail.",
    CONSENT_DEFINITIONS_CHANGED:
      "Les documents ont changé. Relis les nouvelles versions avec le client avant de recueillir ses décisions.",
    CONSENT_NOT_FOUND: "Abonnement ou lien introuvable.",
    CONSENT_INVALID_STATE:
      "Ce recueil n’est plus disponible dans l’état actuel de l’abonnement.",
    CONSENT_LINK_INVALID:
      "Ce lien est invalide. Demande un nouveau lien au coach.",
    CONSENT_LINK_EXPIRED: "Ce lien a expiré. Demande un nouveau lien au coach.",
    CONSENT_LINK_REVOKED:
      "Ce lien a été révoqué. Demande un nouveau lien au coach.",
    CONSENT_LINK_CONSUMED:
      "Ce lien a déjà été utilisé. Tes choix ne peuvent pas être renvoyés avec ce lien.",
    CONSENT_LINK_STALE:
      "Les documents de ce lien ont changé. Demande un nouveau lien au coach.",
    CONSENT_RATE_LIMITED: "Trop de tentatives. Réessaie dans une minute.",
    CONSENT_REVOCATION_FORBIDDEN:
      "Ce type d’acceptation ne peut pas être révoqué ici.",
    CONSENT_DECISION_MISSING:
      "Aucun accord actuel ne peut être retiré pour ce consentement.",
    CONSENT_ROUTE_UNEXPECTED_FAILURE:
      "Impossible de traiter les consentements. Actualise la page et réessaie.",
  };
  return typeof code === "string" && messages[code]
    ? messages[code]
    : "Impossible de traiter les consentements. Actualise la page et vérifie l’état avant de réessayer.";
}

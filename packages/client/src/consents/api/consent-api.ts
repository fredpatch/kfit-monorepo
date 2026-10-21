import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, consentApiRoutes, type ConsentDecisions, type ConsentLinkResponse, type ConsentPublicResponse, type ConsentResponse, type ConsentType } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
const admin = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
admin.interceptors.request.use(config => {
  if (requiresCsrfHeader(config.method)) { const headers = AxiosHeaders.from(config.headers); const token = buildCsrfHeaders(config.method)[authCsrfHeaderName]; if (token) headers.set(authCsrfHeaderName, token); config.headers = headers; }
  return config;
});
const publicHttp = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: false, headers: { accept: "application/json" } });
function route(path: string, id: string) { return path.replace(":subscriptionId", encodeURIComponent(id)); }
export const consentApi = {
  async get(id: string) { return (await admin.get<ConsentResponse>(route(consentApiRoutes.detail, id))).data; },
  async issue(id: string, expiresAt: string) { return (await admin.post<ConsentLinkResponse>(route(consentApiRoutes.link, id), { expiresAt })).data; },
  async revokeLink(id: string, tokenId: string) { return (await admin.post<ConsentResponse>(route(consentApiRoutes.revokeLink, id).replace(":tokenId", encodeURIComponent(tokenId)), {})).data; },
  async capture(id: string, decisions: ConsentDecisions, expectedDefinitionIds: string[]) { return (await admin.post<ConsentResponse>(route(consentApiRoutes.capture, id), { decisions, expectedDefinitionIds })).data; },
  async revoke(id: string, type: ConsentType) { return (await admin.post<ConsentResponse>(route(consentApiRoutes.revoke, id).replace(":consentType", type), {})).data; },
  async publicGet(token: string) { return (await publicHttp.get<ConsentPublicResponse>(consentApiRoutes.public.replace(":token", encodeURIComponent(token)))).data; },
  async publicSubmit(token: string, decisions: ConsentDecisions) { return (await publicHttp.post<{ accepted: true }>(consentApiRoutes.public.replace(":token", encodeURIComponent(token)), { decisions })).data; },
};
export function consentErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError(error) ? error.response?.data?.error : null;
  const messages: Record<string, string> = {
    CONSENT_INVALID_INPUT: "Vérifie les choix et la date d’expiration.", CONSENT_DEFINITIONS_MISSING: "Les conditions de service et la notice de confidentialité doivent être publiées avant tout recueil.",
    CONSENT_DEFINITIONS_CHANGED: "Les documents ont changé. Relis les nouvelles versions avec le client avant de recueillir ses décisions.",
    CONSENT_NOT_FOUND: "Abonnement ou lien introuvable.", CONSENT_INVALID_STATE: "Ce recueil n’est plus disponible dans l’état actuel de l’abonnement.",
    CONSENT_LINK_INVALID: "Ce lien est invalide. Demande un nouveau lien au coach.", CONSENT_LINK_EXPIRED: "Ce lien a expiré. Demande un nouveau lien au coach.",
    CONSENT_LINK_REVOKED: "Ce lien a été révoqué. Demande un nouveau lien au coach.", CONSENT_LINK_CONSUMED: "Ce lien a déjà été utilisé. Tes choix ne peuvent pas être renvoyés avec ce lien.",
    CONSENT_LINK_STALE: "Les documents de ce lien ont changé. Demande un nouveau lien au coach.", CONSENT_RATE_LIMITED: "Trop de tentatives. Réessaie dans une minute.",
    CONSENT_REVOCATION_FORBIDDEN: "Ce type d’acceptation ne peut pas être révoqué ici.", CONSENT_DECISION_MISSING: "Aucun accord actuel ne peut être retiré pour ce consentement.",
    AUTH_SESSION_REQUIRED: "Reconnecte-toi pour gérer les consentements.", AUTH_CSRF_INVALID: "Actualise la page puis réessaie.", AUTH_ORIGIN_INVALID: "Cette action doit être envoyée depuis le site K’FIT.",
  };
  return typeof code === "string" && messages[code] ? messages[code] : "Impossible de traiter les consentements. Actualise la page et vérifie l’état avant de réessayer.";
}

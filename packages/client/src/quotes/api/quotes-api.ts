import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, quoteApiRoutes, type QuoteDraftInput, type QuoteDecision, type QuoteErrorCode, type QuoteResponse, type QuotesResponse, type PublicQuoteResponse } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
http.interceptors.request.use(config => {
  if (requiresCsrfHeader(config.method) && !config.url?.startsWith("/public/")) {
    const headers = AxiosHeaders.from(config.headers), token = buildCsrfHeaders(config.method)[authCsrfHeaderName]; if (token) headers.set(authCsrfHeaderName, token); config.headers = headers;
  }
  return config;
});
const path = (route: string, id: string) => route.replace(/:[A-Za-z]+/, encodeURIComponent(id));
export const quotesApi = {
  async list(id: string) { return (await http.get<QuotesResponse>(path(quoteApiRoutes.list, id))).data; },
  async create(id: string, input: QuoteDraftInput) { return (await http.post<QuoteResponse>(path(quoteApiRoutes.create, id), input)).data; },
  async version(id: string, input: QuoteDraftInput) { return (await http.post<QuoteResponse>(path(quoteApiRoutes.version, id), input)).data; },
  async edit(id: string, input: QuoteDraftInput) { return (await http.post<QuoteResponse>(path(quoteApiRoutes.edit, id), input)).data; },
  async issue(id: string) { return (await http.post<QuoteResponse>(path(quoteApiRoutes.issue, id), {})).data; },
  async share(id: string, expiresAt: string) { return (await http.post<QuoteResponse>(path(quoteApiRoutes.share, id), { expiresAt })).data; },
  async revoke(id: string) { return (await http.post<QuoteResponse>(path(quoteApiRoutes.revoke, id), {})).data; },
  async synchronize(id: string) { return (await http.post<QuoteResponse>(path(quoteApiRoutes.synchronize, id), {})).data; },
  async cancel(id: string) { return (await http.post<QuoteResponse>(path(quoteApiRoutes.cancel, id), {})).data; },
  async pdf(id: string) { return (await http.get<Blob>(path(quoteApiRoutes.pdf, id), { responseType: "blob" })).data; },
  async publicDetail(token: string) { return (await http.get<PublicQuoteResponse>(path(quoteApiRoutes.publicDetail, token))).data; },
  async publicPdf(token: string) { return (await http.get<Blob>(path(quoteApiRoutes.publicPdf, token), { responseType: "blob" })).data; },
  async respond(token: string, decision: QuoteDecision) { return (await http.post<PublicQuoteResponse>(path(quoteApiRoutes.respond, token), { decision })).data; },
};
const messages: Record<QuoteErrorCode, string> = {
  QUOTE_NOT_FOUND: "Ce devis ou cet abonnement est introuvable.", QUOTE_INVALID_INPUT: "Vérifie le montant entier, les conditions et les dates explicites en heure de Libreville.",
  QUOTE_INVALID_STATE: "Cette action n’est plus disponible. Actualise le devis.", QUOTE_VERSION_IMMUTABLE: "Cette version est émise et ne peut plus être modifiée. Crée une nouvelle version.",
  QUOTE_NUMBER_CONFLICT: "Le numéro n’a pas pu être attribué. Actualise avant de réessayer.", QUOTE_VERSION_CONFLICT: "Une autre opération a modifié les versions. Actualise le devis.",
  QUOTE_LINK_INVALID: "Ce lien de devis est invalide.", QUOTE_LINK_EXPIRED: "Le lien ou le devis a expiré. Contacte ton coach.", QUOTE_LINK_REVOKED: "Ce lien a été révoqué. Contacte ton coach.",
  QUOTE_LINK_CONSUMED: "Ce lien a déjà enregistré une réponse. Aucune autre décision ne peut être envoyée.", QUOTE_RESPONSE_CONFLICT: "Une réponse est déjà enregistrée pour cette version. Actualise le devis.",
  QUOTE_SYNC_REQUIRES_ACCEPTANCE: "La version courante doit être acceptée avant la synchronisation.", QUOTE_SYNC_FINANCE_CONFLICT: "Le montant diffère et une activité financière existe déjà. La synchronisation est bloquée ; l’historique financier est conservé.",
  QUOTE_RATE_LIMITED: "Trop de tentatives. Patiente avant de réessayer.", QUOTE_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.",
  QUOTE_ROUTE_UNEXPECTED_FAILURE: "L’opération n’a pas pu être confirmée. Actualise le devis avant de réessayer.",
};
export function quoteErrorMessage(error: unknown): string {
  const data: unknown = axios.isAxiosError(error) ? error.response?.data : null;
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    const key = Object.keys(messages).find(key => key === data.error) as QuoteErrorCode | undefined;
    if (key) return messages[key];
  }
  return "Le devis est indisponible. Actualise la page ou contacte ton coach.";
}
export function downloadQuote(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

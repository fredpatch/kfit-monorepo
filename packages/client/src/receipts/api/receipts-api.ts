import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, receiptApiRoutes, type ReceiptsResponse, type ReceiptResponse, type ReceiptShareInput, type ReceiptShareResponse, type PublicReceiptMetadata, type ReceiptErrorCode } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import { commonApiErrorMessage, type ApiErrorAudience } from "../../lib/api-error-messages.js";
const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
http.interceptors.request.use(config => { if (config.url?.startsWith("/admin/") && requiresCsrfHeader(config.method)) { const headers = AxiosHeaders.from(config.headers), token = buildCsrfHeaders(config.method)[authCsrfHeaderName]; if (token) headers.set(authCsrfHeaderName, token); config.headers = headers; } return config; });
http.interceptors.response.use(response => response, async (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    const body = error.response.data;
    if (body.size <= 16384 && body.type.includes("application/json")) {
      try {
        const parsed: unknown = JSON.parse(await body.text());
        if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string") error.response.data = parsed;
      } catch { /* Keep malformed responses on the generic error path. */ }
    }
  }
  throw error;
});
const path = (route: string, id: string) => route.replace(/:(subscriptionId|paymentEventId|receiptId|tokenId|token)\b/, encodeURIComponent(id));
export const receiptsApi = {
  async list(id: string) { return (await http.get<ReceiptsResponse>(path(receiptApiRoutes.list, id))).data; },
  async issue(id: string) { return (await http.post<ReceiptResponse>(path(receiptApiRoutes.issue, id), {})).data; },
  async pdf(id: string) { return (await http.get<Blob>(path(receiptApiRoutes.pdf, id), { responseType: "blob" })).data; },
  async share(id: string, input: ReceiptShareInput) { return (await http.post<ReceiptShareResponse>(path(receiptApiRoutes.share, id), input)).data; },
  async revoke(id: string) { await http.post(path(receiptApiRoutes.revoke, id), {}); },
  async void(id: string, voidReason: string) { return (await http.post<ReceiptResponse>(path(receiptApiRoutes.void, id), { voidReason })).data; },
  async publicMetadata(token: string) { return (await http.get<PublicReceiptMetadata>(path(receiptApiRoutes.publicMetadata, token))).data; },
  async publicPdf(token: string) { return (await http.get<Blob>(path(receiptApiRoutes.publicPdf, token), { responseType: "blob" })).data; },
};
export function downloadReceipt(blob: Blob, number: string) { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `${number}.pdf`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const messages: Record<ReceiptErrorCode, string> = {
  RECEIPT_NOT_FOUND: "Ce reçu ou cet abonnement est introuvable.", RECEIPT_INVALID_INPUT: "Vérifie les champs saisis, la date et le motif d’annulation.",
  RECEIPT_INVALID_PAYMENT: "Ce paiement n’est pas éligible à un reçu. Il doit être confirmé et rattaché à cet abonnement.",
  RECEIPT_ALREADY_EXISTS: "Un reçu existe déjà pour ce paiement. Actualise la liste.", RECEIPT_NUMBER_CONFLICT: "Le numéro n’a pas pu être attribué. Aucun nouveau reçu n’a été émis ; actualise avant de réessayer.",
  RECEIPT_ISSUE_CONFLICT: "L’historique ne permet pas d’établir ce reçu sans ambiguïté. Aucun reçu n’a été émis ; contacte l’administrateur.",
  RECEIPT_PDF_FAILURE: "Le PDF est momentanément indisponible. Vérifie l’état du reçu avant de réessayer.",
  RECEIPT_LINK_INVALID: "Ce lien est invalide. Demande un nouveau lien à ton coach.", RECEIPT_LINK_EXPIRED: "Ce lien a expiré. Demande un nouveau lien à ton coach.",
  RECEIPT_LINK_REVOKED: "Ce lien a été révoqué. Demande un nouveau lien à ton coach.", RECEIPT_LINK_CONSUMED: "La limite de téléchargements est atteinte. Demande un nouveau lien à ton coach.",
  RECEIPT_VOID_NOT_ALLOWED: "Le reçu ne peut être annulé que lorsque son paiement est entièrement corrigé.", RECEIPT_ALREADY_VOIDED: "Ce reçu est déjà annulé. Son numéro et son PDF historique restent conservés.",
  RECEIPT_CONCURRENCY_CONFLICT: "Une autre opération a modifié ces informations. Actualise avant de réessayer.", RECEIPT_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.",
  RECEIPT_RATE_LIMITED: "Trop de tentatives. Patiente une minute avant de réessayer.", RECEIPT_ROUTE_UNEXPECTED_FAILURE: "L’opération n’a pas pu être confirmée. Vérifie l’état du reçu avant de réessayer.",
};
export function receiptErrorMessage(error: unknown, audience: ApiErrorAudience = "admin") {
  const data: unknown = axios.isAxiosError(error) ? error.response?.data : undefined;
  const code = data && typeof data === "object" && "error" in data ? data.error : undefined;
  const common = commonApiErrorMessage(code, audience);
  if (common) return common;
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code as ReceiptErrorCode] : "Impossible de confirmer l’opération. Vérifie son état avant de réessayer.";
}

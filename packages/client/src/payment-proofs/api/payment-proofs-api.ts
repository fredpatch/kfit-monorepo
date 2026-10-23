import axios, { AxiosHeaders } from "axios";
import { authCsrfHeaderName, paymentProofApiRoutes, paymentProofClaimsHeader, type PaymentProofClaims, type PaymentProofConfirmInput, type PaymentProofReviewInput, type PaymentProofLinkInput, type PaymentProofLinkResponse, type PaymentProofResponse, type PaymentProofsResponse, type PublicPaymentProofMetadata, type PaymentProofErrorCode } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
http.interceptors.request.use(config => {
  if (config.url?.startsWith("/admin/") && requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers), token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});
const path = (route: string, id: string) => route.replace(/:(subscriptionId|proofId|tokenId|token)\b/, encodeURIComponent(id));
export type ProofReviewAction = "confirm" | "partiallyConfirm" | "requestCorrection" | "reject" | "markDuplicate";
export const paymentProofsApi = {
  async list(id: string) { return (await http.get<PaymentProofsResponse>(path(paymentProofApiRoutes.list, id))).data; },
  async issue(id: string, input: PaymentProofLinkInput) { return (await http.post<PaymentProofLinkResponse>(path(paymentProofApiRoutes.issueLink, id), input)).data; },
  async revoke(id: string) { await http.post(path(paymentProofApiRoutes.revokeLink, id), {}); },
  async review(id: string, action: ProofReviewAction, input: PaymentProofConfirmInput | PaymentProofReviewInput) { return (await http.post<PaymentProofResponse>(path(paymentProofApiRoutes[action], id), input)).data; },
  async document(id: string) { return (await http.get<Blob>(path(paymentProofApiRoutes.document, id), { responseType: "blob" })).data; },
  async metadata(token: string) { return (await http.get<PublicPaymentProofMetadata>(path(paymentProofApiRoutes.publicMetadata, token))).data; },
  async upload(token: string, file: File, claims: PaymentProofClaims) {
    await http.post(path(paymentProofApiRoutes.upload, token), file, { headers: { "Content-Type": file.type, "x-file-name": encodeURIComponent(file.name), [paymentProofClaimsHeader]: encodeURIComponent(JSON.stringify(claims)) } });
  },
};
const messages: Record<PaymentProofErrorCode, string> = {
  PAYMENT_PROOF_NOT_FOUND: "Ce justificatif ou cet abonnement est introuvable.",
  PAYMENT_PROOF_INVALID_INPUT: "Vérifie les champs saisis, les montants entiers et les dates.",
  PAYMENT_PROOF_INVALID_STATE: "Ce justificatif a déjà été traité. Actualise son état.",
  PAYMENT_PROOF_LINK_INVALID: "Ce lien est invalide. Demande un nouveau lien à ton coach.",
  PAYMENT_PROOF_LINK_EXPIRED: "Ce lien a expiré. Demande un nouveau lien à ton coach.",
  PAYMENT_PROOF_LINK_REVOKED: "Ce lien a été révoqué. Demande un nouveau lien à ton coach.",
  PAYMENT_PROOF_LINK_CONSUMED: "Ce lien a déjà servi à envoyer un justificatif. Contacte ton coach avant un nouvel envoi.",
  PAYMENT_PROOF_UPLOAD_INVALID: "Choisis un fichier PDF, JPEG, PNG ou WebP valide, non vide, de 10 Mo maximum.",
  PAYMENT_PROOF_DUPLICATE_UPLOAD: "Ce fichier figure déjà dans cette demande de correction. Choisis le justificatif corrigé.",
  PAYMENT_PROOF_MALWARE_DETECTED: "Ce fichier a été refusé par le contrôle antivirus. Choisis un autre fichier.",
  PAYMENT_PROOF_REVIEW_CONFLICT: "Une autre opération a modifié ces informations. Actualise avant de réessayer.",
  PAYMENT_PROOF_AMOUNT_INVALID: "La confirmation complète doit égaler le montant déclaré ; une confirmation partielle doit être positive et inférieure.",
  PAYMENT_PROOF_FINANCE_CONFLICT: "Le paiement ne peut pas être enregistré. Vérifie le reste à payer et l’échéancier actif dans Paiements.",
  PAYMENT_PROOF_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.",
  PAYMENT_PROOF_RATE_LIMITED: "Trop de tentatives. Patiente une minute avant de réessayer.",
  PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE: "L’opération n’a pas pu être confirmée. Vérifie son état avant de réessayer.",
};
export function paymentProofErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data.error : undefined;
  if (code === "AUTH_SESSION_REQUIRED") return "Ta session a expiré. Reconnecte-toi.";
  if (code === "AUTH_CSRF_INVALID" || code === "AUTH_ORIGIN_INVALID") return "La vérification de sécurité a échoué. Recharge la page.";
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code as PaymentProofErrorCode] : "Impossible de confirmer l’opération. Vérifie son état avant de réessayer.";
}

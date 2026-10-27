import axios, { AxiosHeaders } from "axios";
import {
  authCsrfHeaderName,
  financeApiRoutes,
  type FinanceResponse,
  type FinanceErrorCode,
  type CreateFinancePlanInput,
  type RecordFinancePaymentInput,
  type CorrectFinancePaymentInput,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import { commonApiErrorMessage } from "../../lib/api-error-messages.js";
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: { accept: "application/json" },
});
http.interceptors.request.use((config) => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers),
      token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});
const path = (route: string, id: string) =>
  route
    .replace(":subscriptionId", encodeURIComponent(id))
    .replace(":paymentPlanId", encodeURIComponent(id))
    .replace(":paymentEventId", encodeURIComponent(id));
export const financeApi = {
  async get(id: string) {
    return (await http.get<FinanceResponse>(path(financeApiRoutes.detail, id)))
      .data;
  },
  async create(id: string, input: CreateFinancePlanInput) {
    return (
      await http.post<FinanceResponse>(path(financeApiRoutes.plans, id), input)
    ).data;
  },
  async revise(id: string, input: CreateFinancePlanInput) {
    return (
      await http.post<FinanceResponse>(path(financeApiRoutes.revise, id), input)
    ).data;
  },
  async activate(id: string) {
    return (
      await http.post<FinanceResponse>(path(financeApiRoutes.activate, id), {})
    ).data;
  },
  async cancel(id: string) {
    return (
      await http.post<FinanceResponse>(path(financeApiRoutes.cancel, id), {})
    ).data;
  },
  async record(id: string, input: RecordFinancePaymentInput) {
    return (
      await http.post<FinanceResponse>(
        path(financeApiRoutes.payments, id),
        input,
      )
    ).data;
  },
  async correct(id: string, input: CorrectFinancePaymentInput) {
    return (
      await http.post<FinanceResponse>(
        path(financeApiRoutes.correct, id),
        input,
      )
    ).data;
  },
};
const messages: Record<FinanceErrorCode, string> = {
  FINANCE_NOT_FOUND: "Cet abonnement, échéancier ou paiement est introuvable.",
  FINANCE_INVALID_INPUT:
    "Vérifie les montants entiers en XAF, les dates et les champs saisis.",
  FINANCE_PLAN_ALREADY_ACTIVE:
    "Un échéancier est déjà actif. Révise cet échéancier pour le remplacer.",
  FINANCE_PLAN_TOTAL_MISMATCH:
    "L’échéancier ne couvre plus le reste à payer. Actualise puis révise les montants et dates.",
  FINANCE_INSTALLMENTS_TOTAL_MISMATCH:
    "La somme des échéances doit correspondre exactement au reste à payer indiqué par le serveur.",
  FINANCE_INVALID_STATE:
    "Cette action n’est pas disponible dans l’état actuel. Actualise la finance et vérifie l’échéancier.",
  FINANCE_PAYMENT_EXCEEDS_OUTSTANDING:
    "Le paiement dépasse le reste à payer. Aucun trop-perçu n’est enregistré.",
  FINANCE_DUPLICATE_PAYMENT:
    "Cette demande de paiement a déjà été utilisée. Vérifie l’historique avant une nouvelle saisie.",
  FINANCE_CORRECTION_INVALID:
    "La correction doit viser un paiement confirmé et ne peut pas dépasser son montant encore corrigeable.",
  FINANCE_CONCURRENCY_CONFLICT:
    "Une autre opération a modifié la finance. Actualise les informations puis réessaie.",
  FINANCE_ADMIN_FORBIDDEN: "Cet espace est réservé à l’administrateur.",
  FINANCE_ROUTE_UNEXPECTED_FAILURE:
    "L’opération n’a pas pu être confirmée. Vérifie l’historique avant une nouvelle saisie.",
};
export function financeErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error)
    ? error.response?.data.error
    : undefined;
  const common = commonApiErrorMessage(code);
  if (common) return common;
  return typeof code === "string" && Object.hasOwn(messages, code)
    ? messages[code as FinanceErrorCode]
    : "Impossible de confirmer l’opération. Vérifie l’historique et réessaie.";
}

import axios, { AxiosHeaders } from "axios";
import { adminCustomersApiRoutes, authCsrfHeaderName, type AdminArchivedCustomersResponse, type AdminCustomerDetailResponse, type AdminCustomerOverviewResponse, type AdminCustomersResponse, type CreateCustomerInput, type CreateCustomerResponse,
  type CustomerAnalyticsPeriod, type CustomerAnalyticsResponse } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import { commonApiErrorMessage } from "../../lib/api-error-messages.js";

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });
http.interceptors.request.use(config => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers);
    const csrf = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (csrf) headers.set(authCsrfHeaderName, csrf);
    config.headers = headers;
  }
  return config;
});

export const customersApi = {
  async list(): Promise<AdminCustomersResponse> {
    return (await http.get<AdminCustomersResponse>(adminCustomersApiRoutes.list)).data;
  },
  /** Enriched list with view counts (UX-5). */
  async overview(): Promise<AdminCustomerOverviewResponse> {
    return (await http.get<AdminCustomerOverviewResponse>(adminCustomersApiRoutes.overview)).data;
  },
  async search(whatsapp: string): Promise<AdminCustomersResponse> {
    return (await http.get<AdminCustomersResponse>(adminCustomersApiRoutes.search, { params: { whatsapp } })).data;
  },
  /** Archived and anonymized customers (S7.3b-1 D2), archivedAt desc. */
  async archived(): Promise<AdminArchivedCustomersResponse> {
    return (await http.get<AdminArchivedCustomersResponse>(adminCustomersApiRoutes.archived)).data;
  },
  async detail(customerId: string): Promise<AdminCustomerDetailResponse> {
    return (await http.get<AdminCustomerDetailResponse>(adminCustomersApiRoutes.detail.replace(":customerId", encodeURIComponent(customerId)))).data;
  },
  /** Client analytics (UX-4c). `subscriptionId` selects the subscription used for cadence and pace. */
  async analytics(customerId: string, period: CustomerAnalyticsPeriod, subscriptionId?: string): Promise<CustomerAnalyticsResponse> {
    const route = adminCustomersApiRoutes.analytics.replace(":customerId", encodeURIComponent(customerId));
    return (await http.get<CustomerAnalyticsResponse>(route, { params: { periode: period, ...(subscriptionId ? { abonnement: subscriptionId } : {}) } })).data;
  },
  async create(input: CreateCustomerInput): Promise<CreateCustomerResponse> {
    return (await http.post<CreateCustomerResponse>(adminCustomersApiRoutes.create, input)).data;
  },
};

export function customerErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data.error : undefined;
  const common = commonApiErrorMessage(code);
  if (common) return common;
  switch (code) {
    case "CUSTOMER_DUPLICATE_WHATSAPP": return "Un client actif utilise déjà ce numéro WhatsApp. Relance la recherche pour retrouver sa fiche.";
    case "CUSTOMER_INVALID_INPUT": return "Vérifie les champs saisis et le numéro WhatsApp.";
    case "CUSTOMER_ADMIN_FORBIDDEN": return "Cet espace est réservé à l’administrateur.";
    default: return "Impossible de joindre le service clients. Réessaie dans un instant.";
  }
}

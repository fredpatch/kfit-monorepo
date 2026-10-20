import axios, { AxiosHeaders } from "axios";
import { adminCustomersApiRoutes, authCsrfHeaderName, type AdminCustomersResponse, type CreateCustomerInput, type CreateCustomerResponse } from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";

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
  async search(whatsapp: string): Promise<AdminCustomersResponse> {
    return (await http.get<AdminCustomersResponse>(adminCustomersApiRoutes.search, { params: { whatsapp } })).data;
  },
  async create(input: CreateCustomerInput): Promise<CreateCustomerResponse> {
    return (await http.post<CreateCustomerResponse>(adminCustomersApiRoutes.create, input)).data;
  },
};

export function customerErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data.error : undefined;
  switch (code) {
    case "CUSTOMER_DUPLICATE_WHATSAPP": return "Un client actif utilise déjà ce numéro WhatsApp. Relance la recherche pour retrouver sa fiche.";
    case "CUSTOMER_INVALID_INPUT": return "Vérifie les champs saisis et le numéro WhatsApp.";
    case "CUSTOMER_ADMIN_FORBIDDEN": return "Cet espace est réservé à l’administrateur.";
    case "AUTH_SESSION_REQUIRED": return "Ta session a expiré. Reconnecte-toi pour continuer.";
    case "AUTH_CSRF_INVALID":
    case "AUTH_ORIGIN_INVALID": return "La vérification de sécurité a échoué. Recharge la page puis réessaie.";
    default: return "Impossible de joindre le service clients. Réessaie dans un instant.";
  }
}

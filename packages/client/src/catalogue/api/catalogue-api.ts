import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import {
  authCsrfHeaderName,
  catalogueApiRoutes,
  type CatalogueAdminServiceResponse,
  type CatalogueAdminServicesResponse,
  type CatalogueAdminServicesOverviewResponse,
  type CatalogueServiceMutationInput,
  type CataloguePublicServicesResponse,
  type CatalogueServiceCapacityInput,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";

export type CatalogueApiClientOptions = {
  baseUrl?: string;
  http?: AxiosInstance;
  adminHttp?: AxiosInstance;
};

export type CatalogueApiClient = {
  listPublicServices(): Promise<CataloguePublicServicesResponse>;
  listAdminServices(): Promise<CatalogueAdminServicesResponse>;
  updateAdminServiceCapacity(serviceId: string, input: CatalogueServiceCapacityInput): Promise<CatalogueAdminServiceResponse>;
  /* UX-7 — endpoints that already existed on the server, now wired in the client. */
  listAdminOverview(): Promise<CatalogueAdminServicesOverviewResponse>;
  createAdminService(input: CatalogueServiceMutationInput): Promise<CatalogueAdminServiceResponse>;
  updateAdminService(serviceId: string, input: CatalogueServiceMutationInput): Promise<CatalogueAdminServiceResponse>;
  publishAdminService(serviceId: string): Promise<CatalogueAdminServiceResponse>;
  archiveAdminService(serviceId: string): Promise<CatalogueAdminServiceResponse>;
  reorderAdminServices(items: Array<{ serviceId: string; sortOrder: number }>): Promise<CatalogueAdminServicesResponse>;
};

function resolveBaseUrl(baseUrl: string | undefined): string {
  return baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "";
}

function createDefaultHttpClient(baseUrl: string | undefined): AxiosInstance {
  return axios.create({
    baseURL: resolveBaseUrl(baseUrl),
    headers: { accept: "application/json" },
  });
}

function createDefaultAdminHttpClient(baseUrl: string | undefined): AxiosInstance {
  const client = axios.create({
    baseURL: resolveBaseUrl(baseUrl),
    withCredentials: true,
    headers: { accept: "application/json" },
  });

  client.interceptors.request.use((config) => {
    if (!requiresCsrfHeader(config.method)) return config;

    const headers = AxiosHeaders.from(config.headers);
    const csrf = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (csrf) headers.set(authCsrfHeaderName, csrf);
    config.headers = headers;
    return config;
  });

  return client;
}

function serviceRoute(template: string, serviceId: string): string {
  return template.replace(":serviceId", encodeURIComponent(serviceId));
}

export function createCatalogueApiClient(options: CatalogueApiClientOptions = {}): CatalogueApiClient {
  const http = options.http ?? createDefaultHttpClient(options.baseUrl);
  const adminHttp = options.adminHttp ?? createDefaultAdminHttpClient(options.baseUrl);

  return {
    async listPublicServices() {
      const response = await http.get<CataloguePublicServicesResponse>(catalogueApiRoutes.publicServices);
      return response.data;
    },
    async listAdminServices() {
      const response = await adminHttp.get<CatalogueAdminServicesResponse>(catalogueApiRoutes.adminServices);
      return response.data;
    },
    async updateAdminServiceCapacity(serviceId, input) {
      const response = await adminHttp.patch<CatalogueAdminServiceResponse>(
        serviceRoute(catalogueApiRoutes.adminServiceCapacity, serviceId),
        input,
      );
      return response.data;
    },
    async listAdminOverview() {
      return (await adminHttp.get<CatalogueAdminServicesOverviewResponse>(catalogueApiRoutes.adminServicesOverview)).data;
    },
    async createAdminService(input) {
      return (await adminHttp.post<CatalogueAdminServiceResponse>(catalogueApiRoutes.adminServices, input)).data;
    },
    async updateAdminService(serviceId, input) {
      return (await adminHttp.patch<CatalogueAdminServiceResponse>(serviceRoute(catalogueApiRoutes.adminService, serviceId), input)).data;
    },
    async publishAdminService(serviceId) {
      return (await adminHttp.post<CatalogueAdminServiceResponse>(serviceRoute(catalogueApiRoutes.adminServicePublish, serviceId), {})).data;
    },
    async archiveAdminService(serviceId) {
      return (await adminHttp.post<CatalogueAdminServiceResponse>(serviceRoute(catalogueApiRoutes.adminServiceArchive, serviceId), {})).data;
    },
    async reorderAdminServices(items) {
      return (await adminHttp.patch<CatalogueAdminServicesResponse>(catalogueApiRoutes.adminServiceOrder, { items })).data;
    },
  };
}

const catalogueMessages: Record<string, string> = {
  CATALOGUE_ADMIN_FORBIDDEN: "Cet espace est réservé à l'administrateur.",
  CATALOGUE_SERVICE_NOT_FOUND: "Cette offre est introuvable. Actualise la liste.",
  CATALOGUE_SERVICE_INVALID_INPUT: "Vérifie les champs saisis.",
  CATALOGUE_SERVICE_SLUG_CONFLICT: "Cette adresse (slug) est déjà utilisée par une autre offre.",
  CATALOGUE_SERVICE_ARCHIVED: "Cette offre est archivée et ne peut plus être modifiée.",
  CATALOGUE_SERVICE_PUBLISH_INVALID: "L'offre ne peut pas être publiée : vérifie le nom, l'adresse, le prix (offre à prix fixe) et la capacité (si limitée).",
  AUTH_SESSION_REQUIRED: "Ta session a expiré. Reconnecte-toi.",
  AUTH_CSRF_INVALID: "La vérification de sécurité a échoué. Recharge la page.",
  AUTH_ORIGIN_INVALID: "La vérification de sécurité a échoué. Recharge la page.",
};
const reasonMessages: Record<string, string> = {
  name_required: "Renseigne le nom de l'offre.",
  slug_invalid: "Adresse invalide : lettres minuscules, chiffres et tirets uniquement.",
  base_price_invalid: "Le prix doit être un entier positif.",
  duration_invalid: "La durée doit être un entier positif.",
  capacity_limit_invalid: "La capacité doit être un entier strictement positif.",
  fixed_price_required: "Une offre à prix fixe doit avoir un prix avant publication.",
  capacity_limit_required: "Une capacité limitée doit avoir un nombre de places.",
  waitlist_required: "Active la liste d'attente pour utiliser l'état « Liste d'attente uniquement ».",
};

/** French message for a catalogue API failure; never shows a raw code. */
export function catalogueErrorMessage(error: unknown): string {
  const data: unknown = axios.isAxiosError<{ error?: unknown; reason?: unknown }>(error) ? error.response?.data : undefined;
  const { error: code, reason } = (data ?? {}) as { error?: unknown; reason?: unknown };
  if (typeof reason === "string" && reasonMessages[reason]) return reasonMessages[reason] as string;
  if (typeof code === "string" && catalogueMessages[code]) return catalogueMessages[code] as string;
  return "L'action n'a pas pu être enregistrée. Réessaie dans un instant.";
}

export const catalogueApiClient = createCatalogueApiClient();

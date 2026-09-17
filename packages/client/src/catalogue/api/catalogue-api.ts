import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import {
  authCsrfHeaderName,
  catalogueApiRoutes,
  type CatalogueAdminServiceResponse,
  type CatalogueAdminServicesResponse,
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
  };
}

export const catalogueApiClient = createCatalogueApiClient();

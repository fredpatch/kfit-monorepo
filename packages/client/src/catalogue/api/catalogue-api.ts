import axios, { type AxiosInstance } from "axios";
import {
  catalogueApiRoutes,
  type CataloguePublicServicesResponse,
} from "@kfit/shared";

export type CatalogueApiClientOptions = {
  baseUrl?: string;
  http?: AxiosInstance;
};

export type CatalogueApiClient = {
  listPublicServices(): Promise<CataloguePublicServicesResponse>;
};

function createDefaultHttpClient(baseUrl: string | undefined): AxiosInstance {
  return axios.create({
    baseURL: baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "",
    headers: { accept: "application/json" },
  });
}

export function createCatalogueApiClient(options: CatalogueApiClientOptions = {}): CatalogueApiClient {
  const http = options.http ?? createDefaultHttpClient(options.baseUrl);

  return {
    async listPublicServices() {
      const response = await http.get<CataloguePublicServicesResponse>(catalogueApiRoutes.publicServices);
      return response.data;
    },
  };
}

export const catalogueApiClient = createCatalogueApiClient();

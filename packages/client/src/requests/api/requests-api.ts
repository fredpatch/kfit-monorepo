import axios, { type AxiosInstance } from "axios";
import { requestsApiRoutes, type RequestSubmissionInput, type RequestSubmissionResponse } from "@kfit/shared";

export type RequestsApiClientOptions = {
  baseUrl?: string;
  http?: AxiosInstance;
};

export type RequestsApiClient = {
  submit(input: RequestSubmissionInput): Promise<RequestSubmissionResponse>;
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

export function createRequestsApiClient(options: RequestsApiClientOptions = {}): RequestsApiClient {
  const http = options.http ?? createDefaultHttpClient(options.baseUrl);

  return {
    async submit(input) {
      const response = await http.post<RequestSubmissionResponse>(requestsApiRoutes.publicSubmit, input);
      return response.data;
    },
  };
}

export const requestsApiClient = createRequestsApiClient();

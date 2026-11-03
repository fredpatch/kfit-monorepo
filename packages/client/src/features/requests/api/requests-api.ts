import type { AxiosInstance } from "axios";
import {
  requestsApiRoutes,
  type RequestSubmissionInput,
  type RequestSubmissionResponse,
} from "@kfit/shared";
import { createApiHttpClient } from "../../../shared/api/http-client.js";

export type RequestsApiClientOptions = {
  baseUrl?: string;
  http?: AxiosInstance;
};

export type RequestsApiClient = {
  submit(input: RequestSubmissionInput): Promise<RequestSubmissionResponse>;
};

function createDefaultHttpClient(baseUrl: string | undefined): AxiosInstance {
  return createApiHttpClient({
    ...(baseUrl === undefined ? {} : { baseUrl }),
    withCsrf: false,
    config: { withCredentials: false },
  });
}

export function createRequestsApiClient(
  options: RequestsApiClientOptions = {},
): RequestsApiClient {
  const http = options.http ?? createDefaultHttpClient(options.baseUrl);

  return {
    async submit(input) {
      const response = await http.post<RequestSubmissionResponse>(
        requestsApiRoutes.publicSubmit,
        input,
      );
      return response.data;
    },
  };
}

export const requestsApiClient = createRequestsApiClient();

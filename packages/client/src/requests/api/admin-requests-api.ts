import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import {
  adminRequestsApiRoutes,
  authCsrfHeaderName,
  type AdminRequestDetailResponse,
  type AdminRequestsQueueResponse,
  type CreateContactAttemptInput,
  type CreateContactAttemptResponse,
  type CreateQualificationReviewInput,
  type CreateQualificationReviewResponse,
  type RequestStatusTransitionResponse,
  type ServiceRequestStatus,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";

export type AdminRequestsApiClientOptions = {
  baseUrl?: string;
  http?: AxiosInstance;
};

export type AdminRequestsApiClient = {
  listQueue(status?: ServiceRequestStatus): Promise<AdminRequestsQueueResponse>;
  getDetail(requestId: string): Promise<AdminRequestDetailResponse>;
  logContactAttempt(requestId: string, input: CreateContactAttemptInput): Promise<CreateContactAttemptResponse>;
  transitionStatus(requestId: string, toStatus: ServiceRequestStatus): Promise<RequestStatusTransitionResponse>;
  recordQualificationReview(requestId: string, input: CreateQualificationReviewInput): Promise<CreateQualificationReviewResponse>;
};

function resolveBaseUrl(baseUrl: string | undefined): string {
  return baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "";
}

function createDefaultHttpClient(baseUrl: string | undefined): AxiosInstance {
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

function detailRoute(requestId: string): string {
  return adminRequestsApiRoutes.detail.replace(":requestId", encodeURIComponent(requestId));
}

function contactAttemptsRoute(requestId: string): string {
  return adminRequestsApiRoutes.contactAttempts.replace(":requestId", encodeURIComponent(requestId));
}

function statusRoute(requestId: string): string {
  return adminRequestsApiRoutes.status.replace(":requestId", encodeURIComponent(requestId));
}

function qualificationReviewRoute(requestId: string): string {
  return adminRequestsApiRoutes.qualificationReview.replace(":requestId", encodeURIComponent(requestId));
}

export function createAdminRequestsApiClient(options: AdminRequestsApiClientOptions = {}): AdminRequestsApiClient {
  const http = options.http ?? createDefaultHttpClient(options.baseUrl);

  return {
    async listQueue(status) {
      const response = await http.get<AdminRequestsQueueResponse>(adminRequestsApiRoutes.queue, {
        params: status ? { status } : undefined,
      });
      return response.data;
    },
    async getDetail(requestId) {
      const response = await http.get<AdminRequestDetailResponse>(detailRoute(requestId));
      return response.data;
    },
    async logContactAttempt(requestId, input) {
      const response = await http.post<CreateContactAttemptResponse>(contactAttemptsRoute(requestId), input);
      return response.data;
    },
    async transitionStatus(requestId, toStatus) {
      const response = await http.post<RequestStatusTransitionResponse>(statusRoute(requestId), { toStatus });
      return response.data;
    },
    async recordQualificationReview(requestId, input) {
      const response = await http.post<CreateQualificationReviewResponse>(qualificationReviewRoute(requestId), input);
      return response.data;
    },
  };
}

export const adminRequestsApiClient = createAdminRequestsApiClient();

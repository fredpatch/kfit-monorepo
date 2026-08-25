import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import {
  authApiRoutes,
  authCsrfHeaderName,
  type BootstrapRequest,
  type BootstrapResponse,
  type BootstrapStatusResponse,
  type CurrentSessionResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutResponse,
  type RefreshResponse,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "./csrf.js";

export type AuthApiClientOptions = {
  baseUrl?: string;
  http?: AxiosInstance;
};

export type AuthSession = CurrentSessionResponse;

export type AuthApiClient = {
  bootstrapStatus(): Promise<BootstrapStatusResponse>;
  bootstrap(input: BootstrapRequest): Promise<BootstrapResponse>;
  login(input: LoginRequest): Promise<LoginResponse>;
  currentSession(): Promise<AuthSession | null>;
  refresh(): Promise<RefreshResponse>;
  logout(): Promise<LogoutResponse>;
};

function createDefaultHttpClient(baseUrl: string | undefined): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "",
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

export function createAuthApiClient(options: AuthApiClientOptions = {}): AuthApiClient {
  const http = options.http ?? createDefaultHttpClient(options.baseUrl);

  return {
    async bootstrapStatus() {
      const response = await http.get<BootstrapStatusResponse>(authApiRoutes.bootstrapStatus);
      return response.data;
    },
    async bootstrap(input) {
      const response = await http.post<BootstrapResponse>(authApiRoutes.bootstrap, input);
      return response.data;
    },
    async login(input) {
      const response = await http.post<LoginResponse>(authApiRoutes.login, input);
      return response.data;
    },
    async currentSession() {
      try {
        const response = await http.get<CurrentSessionResponse>(authApiRoutes.currentSession);
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) return null;
        throw error;
      }
    },
    async refresh() {
      const response = await http.post<RefreshResponse>(authApiRoutes.refresh);
      return response.data;
    },
    async logout() {
      const response = await http.post<LogoutResponse>(authApiRoutes.logout);
      return response.data;
    },
  };
}

export const authApiClient = createAuthApiClient();

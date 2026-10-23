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
  type PasswordRecoveryRequestResponse,
  type PasswordRecoveryResetResponse,
  type PasswordRecoveryVerifyResponse,
  type RefreshResponse,
  type SensitiveActionOtpRequestResponse,
  type SensitiveActionOtpVerifyResponse,
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
  requestPasswordRecovery(email: string): Promise<PasswordRecoveryRequestResponse>;
  verifyPasswordRecovery(email: string, code: string): Promise<PasswordRecoveryVerifyResponse>;
  resetPassword(resetToken: string, password: string): Promise<PasswordRecoveryResetResponse>;
  /** Step-up for sensitive reads (UX-14c): a code is e-mailed to the signed-in coach. */
  requestSensitiveActionOtp(): Promise<SensitiveActionOtpRequestResponse>;
  verifySensitiveActionOtp(code: string): Promise<SensitiveActionOtpVerifyResponse>;
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
    async requestPasswordRecovery(email) {
      const response = await http.post<PasswordRecoveryRequestResponse>(authApiRoutes.requestPasswordRecovery, { email });
      return response.data;
    },
    async verifyPasswordRecovery(email, code) {
      const response = await http.post<PasswordRecoveryVerifyResponse>(authApiRoutes.verifyPasswordRecovery, { email, code });
      return response.data;
    },
    async resetPassword(resetToken, password) {
      const response = await http.post<PasswordRecoveryResetResponse>(authApiRoutes.resetPassword, { resetToken, password });
      return response.data;
    },
    async requestSensitiveActionOtp() {
      const response = await http.post<SensitiveActionOtpRequestResponse>(authApiRoutes.requestSensitiveActionOtp, {});
      return response.data;
    },
    async verifySensitiveActionOtp(code) {
      const response = await http.post<SensitiveActionOtpVerifyResponse>(authApiRoutes.verifySensitiveActionOtp, { code });
      return response.data;
    },
  };
}

export const authApiClient = createAuthApiClient();

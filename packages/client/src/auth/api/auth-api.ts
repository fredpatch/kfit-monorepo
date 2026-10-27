import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import {
  authApiRoutes,
  authCsrfHeaderName,
  bootstrapTokenHeaderName,
  type AuthenticatedSessionResponse,
  type BootstrapRequest,
  type BootstrapResponse,
  type BootstrapStatusResponse,
  type CurrentSessionResponse,
  type LoginRequest,
  type LoginOtpRequiredResponse,
  type LoginResponse,
  type LogoutResponse,
  type PasswordRecoveryRequestResponse,
  type PasswordRecoveryResetResponse,
  type PasswordRecoveryVerifyResponse,
  type RefreshResponse,
  type SensitiveActionOtpRequestResponse,
  type SensitiveActionOtpVerifyResponse,
  type RevokeAllTrustedDevicesResponse,
  type RevokeTrustedDeviceResponse,
  type TrustedDevicesResponse,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "./csrf.js";

export type AuthApiClientOptions = {
  baseUrl?: string;
  http?: AxiosInstance;
};

export type AuthSession = CurrentSessionResponse;

export type AuthApiClient = {
  bootstrapStatus(): Promise<BootstrapStatusResponse>;
  /** BOOT-01 B4: `token` goes in the header only when production asks for it. */
  bootstrap(input: BootstrapRequest, token?: string): Promise<BootstrapResponse>;
  /** SEC-02: 200 session, or 202 « otp_required » on an untrusted device. */
  login(input: LoginRequest): Promise<LoginResponse>;
  verifyLogin(input: { challengeId: string; code: string; trustDevice: boolean }): Promise<AuthenticatedSessionResponse>;
  resendLogin(challengeId: string): Promise<LoginOtpRequiredResponse>;
  listTrustedDevices(): Promise<TrustedDevicesResponse>;
  revokeTrustedDevice(deviceId: string): Promise<RevokeTrustedDeviceResponse>;
  revokeAllTrustedDevices(): Promise<RevokeAllTrustedDevicesResponse>;
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
    async bootstrap(input, token) {
      const response = await http.post<BootstrapResponse>(authApiRoutes.bootstrap, input, token ? { headers: { [bootstrapTokenHeaderName]: token } } : undefined);
      return response.data;
    },
    async login(input) {
      const response = await http.post<LoginResponse>(authApiRoutes.login, input);
      return response.data;
    },
    async verifyLogin(input) {
      const response = await http.post<AuthenticatedSessionResponse>(authApiRoutes.verifyLogin, input);
      return response.data;
    },
    async resendLogin(challengeId) {
      const response = await http.post<LoginOtpRequiredResponse>(authApiRoutes.resendLoginOtp, { challengeId });
      return response.data;
    },
    async listTrustedDevices() {
      const response = await http.get<TrustedDevicesResponse>(authApiRoutes.trustedDevices);
      return response.data;
    },
    async revokeTrustedDevice(deviceId) {
      const response = await http.delete<RevokeTrustedDeviceResponse>(authApiRoutes.trustedDevice.replace(":id", encodeURIComponent(deviceId)));
      return response.data;
    },
    async revokeAllTrustedDevices() {
      const response = await http.post<RevokeAllTrustedDevicesResponse>(authApiRoutes.revokeAllTrustedDevices, {});
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

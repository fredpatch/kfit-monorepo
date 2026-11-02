import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";
import { authCookieNames, authCsrfHeaderName } from "@kfit/shared";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ApiHttpClientOptions = {
  baseUrl?: string;
  withCsrf?: boolean;
  config?: AxiosRequestConfig;
};

export function readCookie(
  cookieName: string,
  cookieSource: string = globalThis.document?.cookie ?? "",
): string | null {
  const prefix = `${cookieName}=`;
  const found = cookieSource
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

export function requiresCsrfHeader(method: string | undefined): boolean {
  return mutatingMethods.has((method ?? "GET").toUpperCase());
}

export function buildCsrfHeaders(
  method: string | undefined,
  cookieSource?: string,
): Record<string, string> {
  if (!requiresCsrfHeader(method)) return {};
  const token = readCookie(authCookieNames.csrfToken, cookieSource);
  return token ? { [authCsrfHeaderName]: token } : {};
}

export function createApiHttpClient(
  options: ApiHttpClientOptions = {},
): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "",
    withCredentials: true,
    headers: { accept: "application/json" },
    ...options.config,
  });

  if (options.withCsrf !== false) {
    client.interceptors.request.use((config) => {
      if (!requiresCsrfHeader(config.method)) return config;

      const headers = AxiosHeaders.from(config.headers);
      const csrf = buildCsrfHeaders(config.method)[authCsrfHeaderName];
      if (csrf) headers.set(authCsrfHeaderName, csrf);
      config.headers = headers;
      return config;
    });
  }

  return client;
}

export const apiHttpClient = createApiHttpClient();

export function apiErrorData<T = { error?: unknown }>(
  error: unknown,
): T | undefined {
  return axios.isAxiosError<T>(error) ? error.response?.data : undefined;
}

export function apiErrorCode(error: unknown): unknown {
  return apiErrorData<{ error?: unknown }>(error)?.error;
}

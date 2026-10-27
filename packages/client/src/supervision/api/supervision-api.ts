import axios, { AxiosHeaders } from "axios";
import {
  authCsrfHeaderName,
  supervisionApiRoutes,
  type SupervisionErrorCode,
  type SupervisionJobRunResponse,
  type SupervisionOverviewResponse,
  type SupervisionPurgeSimulationResponse,
  type SupervisionSecurityPeriod,
  type SupervisionSecurityResponse,
  type SupervisionStatusResponse,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";
import { commonApiErrorMessage } from "../../lib/api-error-messages.js";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: { accept: "application/json" },
});
http.interceptors.request.use((config) => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers),
      token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});

/** OPS-01b: superadmin only; the server answers 403 SUPERVISION_SUPERADMIN_FORBIDDEN to anyone else. */
export const supervisionApi = {
  async overview(): Promise<SupervisionOverviewResponse> {
    return (
      await http.get<SupervisionOverviewResponse>(supervisionApiRoutes.overview)
    ).data;
  },
  async status(): Promise<SupervisionStatusResponse> {
    return (
      await http.get<SupervisionStatusResponse>(supervisionApiRoutes.status)
    ).data;
  },
  async security(
    days: SupervisionSecurityPeriod,
  ): Promise<SupervisionSecurityResponse> {
    return (
      await http.get<SupervisionSecurityResponse>(
        supervisionApiRoutes.security,
        {
          params: { days },
        },
      )
    ).data;
  },
  async runJob(jobKey: string): Promise<SupervisionJobRunResponse> {
    return (
      await http.post<SupervisionJobRunResponse>(
        supervisionApiRoutes.runJob.replace(
          ":jobKey",
          encodeURIComponent(jobKey),
        ),
        {},
      )
    ).data;
  },
  async simulatePurge(): Promise<SupervisionPurgeSimulationResponse> {
    return (
      await http.post<SupervisionPurgeSimulationResponse>(
        supervisionApiRoutes.simulatePurge,
        {},
      )
    ).data;
  },
};

export const supervisionKeys = {
  overview: ["supervision", "overview"] as const,
  status: ["supervision", "status"] as const,
  security: (days: SupervisionSecurityPeriod) =>
    ["supervision", "security", days] as const,
};

const codeOf = (error: unknown): unknown =>
  axios.isAxiosError<{ error?: unknown }>(error)
    ? error.response?.data?.error
    : undefined;

/** S7: a non-superadmin session gets the not-found page, never a message. */
export const isSupervisionForbidden = (error: unknown) =>
  codeOf(error) === "SUPERVISION_SUPERADMIN_FORBIDDEN";

const messages: Partial<Record<SupervisionErrorCode, string>> = {
  SUPERVISION_JOB_BUSY: "Ce job est déjà en cours.",
  SUPERVISION_RATE_LIMITED: "Patiente une minute avant de relancer ce job.",
  SUPERVISION_JOB_NOT_RUNNABLE: "Ce job ne se lance pas depuis cette page.",
  SUPERVISION_INVALID_INPUT: "Période invalide. Actualise la page.",
  SUPERVISION_ROUTE_UNEXPECTED_FAILURE:
    "Impossible de charger la supervision. Réessaie.",
};

export function supervisionErrorMessage(error: unknown): string {
  const code = codeOf(error);
  const common = commonApiErrorMessage(code);
  if (common) return common;
  return (
    (typeof code === "string" && messages[code as SupervisionErrorCode]) ||
    "Impossible de charger la supervision. Réessaie."
  );
}

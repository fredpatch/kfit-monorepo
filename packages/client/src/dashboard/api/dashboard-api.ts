import axios from "axios";
import { dashboardApiRoutes, type AgendaResponse, type TodayResponse, type DashboardAnalyticsResponse, type DashboardAlertsResponse, type DashboardPeriod } from "@kfit/shared";
import { commonApiErrorMessage } from "../../lib/api-error-messages.js";

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });

/** Read-only dashboard endpoints (UX-9). GET only: no CSRF header needed. */
export const dashboardApi = {
  async analytics(periode: DashboardPeriod): Promise<DashboardAnalyticsResponse> {
    return (await http.get<DashboardAnalyticsResponse>(dashboardApiRoutes.analytics, { params: { periode } })).data;
  },
  async alerts(): Promise<DashboardAlertsResponse> {
    return (await http.get<DashboardAlertsResponse>(dashboardApiRoutes.alerts)).data;
  },
  async today(): Promise<TodayResponse> {
    return (await http.get<TodayResponse>(dashboardApiRoutes.today)).data;
  },
  async agenda(from: string, to: string, statuses?: string[]): Promise<AgendaResponse> {
    return (await http.get<AgendaResponse>(dashboardApiRoutes.appointments, { params: { du: from, au: to, ...(statuses?.length ? { statut: statuses.join(",") } : {}) } })).data;
  },
};

export function dashboardErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data?.error : undefined;
  const common = commonApiErrorMessage(code);
  if (common) return common;
  if (code === "DASHBOARD_ADMIN_FORBIDDEN") return "Cet espace est réservé à l'administrateur.";
  if (code === "DASHBOARD_INVALID_INPUT") return "La période demandée est invalide.";
  return "Impossible de charger le tableau de bord. Réessaie dans un instant.";
}

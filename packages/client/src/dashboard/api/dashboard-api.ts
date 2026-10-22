import axios from "axios";
import { dashboardApiRoutes, type AgendaResponse, type TodayResponse } from "@kfit/shared";

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "", withCredentials: true, headers: { accept: "application/json" } });

/** Read-only dashboard endpoints (UX-9). GET only: no CSRF header needed. */
export const dashboardApi = {
  async today(): Promise<TodayResponse> {
    return (await http.get<TodayResponse>(dashboardApiRoutes.today)).data;
  },
  async agenda(from: string, to: string, statuses?: string[]): Promise<AgendaResponse> {
    return (await http.get<AgendaResponse>(dashboardApiRoutes.appointments, { params: { du: from, au: to, ...(statuses?.length ? { statut: statuses.join(",") } : {}) } })).data;
  },
};

export function dashboardErrorMessage(error: unknown): string {
  const code: unknown = axios.isAxiosError<{ error?: unknown }>(error) ? error.response?.data?.error : undefined;
  if (code === "AUTH_SESSION_REQUIRED") return "Ta session a expiré. Reconnecte-toi.";
  if (code === "DASHBOARD_ADMIN_FORBIDDEN") return "Cet espace est réservé à l'administrateur.";
  return "Impossible de charger le tableau de bord. Réessaie dans un instant.";
}

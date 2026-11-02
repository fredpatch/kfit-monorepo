import {
  dashboardApiRoutes,
  type AgendaResponse,
  type TodayResponse,
  type DashboardAnalyticsResponse,
  type DashboardAlertsResponse,
  type DashboardPeriod,
} from "@kfit/shared";
import { commonApiErrorMessage } from "../../lib/api-error-messages.js";
import { apiErrorCode, apiHttpClient } from "../../shared/api/http-client.js";

/** Read-only dashboard endpoints (UX-9). GET only: no CSRF header needed. */
export const dashboardApi = {
  async analytics(
    periode: DashboardPeriod,
  ): Promise<DashboardAnalyticsResponse> {
    return (
      await apiHttpClient.get<DashboardAnalyticsResponse>(dashboardApiRoutes.analytics, {
        params: { periode },
      })
    ).data;
  },
  async alerts(): Promise<DashboardAlertsResponse> {
    return (await apiHttpClient.get<DashboardAlertsResponse>(dashboardApiRoutes.alerts))
      .data;
  },
  async today(): Promise<TodayResponse> {
    return (await apiHttpClient.get<TodayResponse>(dashboardApiRoutes.today)).data;
  },
  async agenda(
    from: string,
    to: string,
    statuses?: string[],
  ): Promise<AgendaResponse> {
    return (
      await apiHttpClient.get<AgendaResponse>(dashboardApiRoutes.appointments, {
        params: {
          du: from,
          au: to,
          ...(statuses?.length ? { statut: statuses.join(",") } : {}),
        },
      })
    ).data;
  },
};

export function dashboardErrorMessage(error: unknown): string {
  const code = apiErrorCode(error);
  const common = commonApiErrorMessage(code);
  if (common) return common;
  return typeof code === "string" && Object.hasOwn(dashboardMessages, code)
    ? dashboardMessages[code]!
    : dashboardMessages.DASHBOARD_ROUTE_UNEXPECTED_FAILURE!;
}

const dashboardMessages: Record<string, string> = {
  DASHBOARD_ADMIN_FORBIDDEN: "Cet espace est réservé à l'administrateur.",
  DASHBOARD_INVALID_INPUT: "La période demandée est invalide.",
  DASHBOARD_ROUTE_UNEXPECTED_FAILURE:
    "Impossible de charger le tableau de bord. Réessaie dans un instant.",
};

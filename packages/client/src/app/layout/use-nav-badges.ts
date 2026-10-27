import { useQuery } from "@tanstack/react-query";
import { followUpsApi } from "../../follow-ups/api/follow-ups-api.js";
import { dashboardApi } from "../../dashboard/api/dashboard-api.js";
import { adminRequestsApiClient } from "../../requests/api/admin-requests-api.js";
import type { NavBadgeSource } from "./nav-config.js";

/**
 * Sidebar counters. Query keys match the screens' own keys, so the data is shared
 * and refreshed whenever those screens invalidate it - no extra polling logic here.
 */
export function useNavBadges(): Record<NavBadgeSource, number | null> {
  const followUps = useQuery({
    queryKey: ["follow-up-queue"],
    queryFn: () => followUpsApi.queue(),
    refetchInterval: 60_000,
  });
  const newRequests = useQuery({
    queryKey: ["requests", "admin-queue", "submitted"],
    queryFn: () => adminRequestsApiClient.listQueue("submitted"),
    refetchInterval: 60_000,
  });

  // Same key as the « Aujourd'hui » screen: one request shared by the badge and the page.
  const today = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: () => dashboardApi.today(),
    refetchInterval: 60_000,
  });

  return {
    todayTasks: today.data ? today.data.tasks.length : null,
    followUpsOverdue: followUps.data
      ? followUps.data.items.filter((item) => item.cadenceState === "overdue")
          .length
      : null,
    requestsNew: newRequests.data ? newRequests.data.requests.length : null,
  };
}

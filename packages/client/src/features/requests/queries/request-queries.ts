import { useQuery } from "@tanstack/react-query";
import { adminRequestsApiClient } from "../api/admin-requests-api.js";
import { requestKeys } from "./request-keys.js";

export function useAdminRequestsQueue() {
  return useQuery({
    queryKey: requestKeys.adminQueueAll(),
    queryFn: () => adminRequestsApiClient.listQueue(),
    refetchInterval: 60_000,
  });
}

export function useAdminRequestDetail(requestId: string) {
  return useQuery({
    queryKey: requestKeys.adminDetail(requestId),
    queryFn: () => adminRequestsApiClient.getDetail(requestId),
  });
}

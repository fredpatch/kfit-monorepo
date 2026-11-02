import { useQuery } from "@tanstack/react-query";
import { catalogueApiClient } from "../api/catalogue-api.js";
import { catalogueKeys } from "./catalogue-keys.js";

export function useCatalogueAdminOverview() {
  return useQuery({
    queryKey: catalogueKeys.adminOverview(),
    queryFn: () => catalogueApiClient.listAdminOverview(),
  });
}

export function useCataloguePublicServices() {
  return useQuery({
    queryKey: catalogueKeys.publicServices(),
    queryFn: () => catalogueApiClient.listPublicServices(),
  });
}

export function useCatalogueDeliverability(
  serviceId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: catalogueKeys.deliverability(serviceId ?? ""),
    queryFn: () => catalogueApiClient.deliverability(serviceId!),
    ...options,
  });
}

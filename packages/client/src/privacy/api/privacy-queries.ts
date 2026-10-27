import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "../../customers/api/customers-api.js";
import { privacyApi } from "./privacy-api.js";

export const privacyKeys = {
  archivedCustomers: ["customers", "archived"] as const,
  customerHolds: (customerId: string) =>
    ["privacy", "holds", "customer", customerId] as const,
};

export const useArchivedCustomers = () =>
  useQuery({
    queryKey: privacyKeys.archivedCustomers,
    queryFn: () => customersApi.archived(),
  });

export const useCustomerHolds = (customerId: string) =>
  useQuery({
    queryKey: privacyKeys.customerHolds(customerId),
    queryFn: () => privacyApi.customerHolds(customerId),
    select: (data) => data.holds.filter((hold) => hold.status === "active"),
  });

/**
 * S7.3b-2 D11: every privacy mutation refreshes the customer reads (detail, overview, archived list), the holds and the
 * request reads (detail, queue), since archive, unarchive and anonymize change what each of them shows.
 */
export function usePrivacyRefresh() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["customers"] }),
      client.invalidateQueries({ queryKey: ["privacy", "holds"] }),
      client.invalidateQueries({ queryKey: ["requests"] }),
    ]);
}

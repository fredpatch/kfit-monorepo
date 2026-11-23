import { useQuery } from "@tanstack/react-query";
import { consentDefinitionsApi } from "../api/consent-api.js";
import { consentKeys } from "./consent-keys.js";

export function useConsentDefinitions() {
  return useQuery({
    queryKey: consentKeys.definitions,
    queryFn: () => consentDefinitionsApi.list(),
  });
}

export function useConsentDefinition(id: string | null) {
  return useQuery({
    queryKey: consentKeys.definition(id),
    queryFn: () => consentDefinitionsApi.get(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
}

/** Always refetched when the publish dialog opens: the affected-subscription count must be current. */
export function useConsentDefinitionImpact(id: string) {
  return useQuery({
    queryKey: consentKeys.definitionImpact(id),
    queryFn: () => consentDefinitionsApi.impact(id),
    staleTime: 0,
  });
}

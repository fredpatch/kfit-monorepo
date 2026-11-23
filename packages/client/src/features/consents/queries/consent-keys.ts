export const consentKeys = {
  definitions: ["consent-definitions"] as const,
  definition: (id: string | null) => ["consent-definition", id] as const,
  definitionImpact: (id: string) => ["consent-definition-impact", id] as const,
  publicLink: (queryId: string) => ["public-consent", queryId] as const,
};

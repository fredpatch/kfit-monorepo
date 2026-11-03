export const catalogueKeys = {
  all: ["catalogue"] as const,
  adminOverview: () => [...catalogueKeys.all, "admin-overview"] as const,
  publicServices: () => [...catalogueKeys.all, "public-services"] as const,
  deliverability: (serviceId: string) =>
    [...catalogueKeys.all, "deliverability", serviceId] as const,
};

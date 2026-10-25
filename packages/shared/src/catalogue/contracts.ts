export const catalogueApiRoutes = {
  publicServices: "/catalogue/services",
  adminServices: "/admin/catalogue/services",
  adminService: "/admin/catalogue/services/:serviceId",
  adminServicePublish: "/admin/catalogue/services/:serviceId/publish",
  adminServiceArchive: "/admin/catalogue/services/:serviceId/archive",
  adminServiceCapacity: "/admin/catalogue/services/:serviceId/capacity",
  adminServiceOrder: "/admin/catalogue/services/order",
  /** Enriched admin list (UX-7): occupancy, waitlist, variants, rules. Read-only. */
  adminServicesOverview: "/admin/catalogue/services/overview",
  /* CAT-03 (REG-F2): offer content editing. Archive only, never delete. */
  adminVariants: "/admin/catalogue/services/:serviceId/variants",
  adminVariant: "/admin/catalogue/services/:serviceId/variants/:variantId",
  adminVariantArchive: "/admin/catalogue/services/:serviceId/variants/:variantId/archive",
  adminComponents: "/admin/catalogue/services/:serviceId/components",
  adminComponent: "/admin/catalogue/services/:serviceId/components/:componentId",
  adminComponentArchive: "/admin/catalogue/services/:serviceId/components/:componentId/archive",
  adminServiceRules: "/admin/catalogue/services/:serviceId/rules",
  adminVariantRules: "/admin/catalogue/services/:serviceId/variants/:variantId/rules",
  adminServiceDeliverability: "/admin/catalogue/services/:serviceId/deliverability",
} as const;

export type CatalogueApiRoute = (typeof catalogueApiRoutes)[keyof typeof catalogueApiRoutes];

export const catalogueErrorCodes = [
  "CATALOGUE_ROUTE_UNEXPECTED_FAILURE",
  "CATALOGUE_ADMIN_FORBIDDEN",
  "CATALOGUE_SERVICE_NOT_FOUND",
  "CATALOGUE_SERVICE_INVALID_INPUT",
  "CATALOGUE_SERVICE_SLUG_CONFLICT",
  "CATALOGUE_SERVICE_ARCHIVED",
  "CATALOGUE_SERVICE_PUBLISH_INVALID",
  "CATALOGUE_SERVICE_NOT_DELIVERABLE",
  "CATALOGUE_VARIANT_NOT_FOUND",
  "CATALOGUE_VARIANT_SLUG_CONFLICT",
  "CATALOGUE_VARIANT_ARCHIVED",
  "CATALOGUE_COMPONENT_NOT_FOUND",
  "CATALOGUE_COMPONENT_ARCHIVED",
  "CATALOGUE_RULES_OVERRIDE_NOT_FOUND",
  "CATALOGUE_RULES_OVERRIDE_HAS_QUESTIONNAIRE",
] as const;

export type CatalogueErrorCode = (typeof catalogueErrorCodes)[number];

/* CAT-03 closed vocabularies (Fred 2026-10-25). */
export const catalogueComponentTypes = ["appointment", "follow_up", "program"] as const;
export type CatalogueComponentType = (typeof catalogueComponentTypes)[number];
export const catalogueConsumptionPolicies = ["manual"] as const;
export type CatalogueConsumptionPolicy = (typeof catalogueConsumptionPolicies)[number];
export const catalogueMedicalClearancePolicies = ["not_required", "required_if_risk_flag", "required"] as const;
export type CatalogueMedicalClearancePolicy = (typeof catalogueMedicalClearancePolicies)[number];
/** D3 bounds. At service level a null cadence means « no follow-up cadence »; on a variant override null means « same as the offer ». */
export const catalogueRuleLimits = { followUpFrequencyDays: { min: 1, max: 90 }, lateCancelNoticeHours: { min: 1, max: 168 } } as const;
/** D6 rule keys reported by the deliverability check and the publish guard. */
export const catalogueDeliverabilityRules = [
  "service_component_missing",
  "variant_component_missing",
  "service_rules_missing",
  "medical_policy_missing",
  "price_missing",
  "duration_missing",
] as const;
export type CatalogueDeliverabilityRule = (typeof catalogueDeliverabilityRules)[number];
export type CatalogueDeliverabilityFailure = { rule: CatalogueDeliverabilityRule; variantId: string | null };
export type CatalogueDeliverabilityResponse = { serviceId: string; deliverable: boolean; failures: CatalogueDeliverabilityFailure[] };

export type CatalogueAdminVariant = {
  id: string;
  serviceId: string;
  name: string;
  slug: string;
  priceXaf: number | null;
  durationValue: number | null;
  durationUnit: CatalogueDurationUnit | null;
  capacityLimit: number | null;
  availabilityStatus: CatalogueAvailabilityStatus;
  sortOrder: number;
  archivedAt: string | null;
};
export type CatalogueVariantInput = {
  name?: unknown; slug?: unknown; priceXaf?: unknown; durationValue?: unknown; durationUnit?: unknown;
  capacityLimit?: unknown; availabilityStatus?: unknown; sortOrder?: unknown;
};
export type CatalogueAdminVariantResponse = { variant: CatalogueAdminVariant };

export type CatalogueAdminComponent = {
  id: string;
  serviceId: string;
  variantId: string | null;
  componentType: CatalogueComponentType;
  label: string;
  quantity: number;
  isMandatory: boolean;
  consumptionPolicy: CatalogueConsumptionPolicy;
  archivedAt: string | null;
};
export type CatalogueComponentInput = { variantId?: unknown; componentType?: unknown; label?: unknown; quantity?: unknown; isMandatory?: unknown; consumptionPolicy?: unknown };
export type CatalogueAdminComponentResponse = { component: CatalogueAdminComponent };

export type CatalogueRulesInput = {
  followUpFrequencyDays?: unknown; lateCancelNoticeHours?: unknown; lateCancelConsumesComponent?: unknown;
  missedConsumesComponent?: unknown; medicalClearancePolicy?: unknown;
};
export type CatalogueAdminRules = {
  serviceId: string;
  variantId: string | null;
  followUpFrequencyDays: number | null;
  lateCancelNoticeHours: number | null;
  lateCancelConsumesComponent: boolean;
  missedConsumesComponent: boolean;
  medicalClearancePolicy: CatalogueMedicalClearancePolicy | null;
};
/** D5: onboarding subscriptions whose live medical requirement was re-derived by this write. */
export type CatalogueAdminRulesResponse = { rules: CatalogueAdminRules; onboardingSubscriptionsAffected: number };
export type CatalogueRulesOverrideRemovedResponse = { removed: true; onboardingSubscriptionsAffected: number };

export type CatalogueAvailabilityStatus =
  | "open"
  | "temporarily_closed"
  | "waitlist_only"
  | "archived";

export type CataloguePricingMode = "fixed" | "quote";
export type CatalogueDeliveryType = "one_time" | "time_based";
export type CatalogueDurationUnit = "day" | "week" | "month";
export type CatalogueCapacityMode = "unlimited" | "limited";

export type CatalogueServiceComponent = {
  id: string;
  variantId: string | null;
  componentType: string;
  label: string;
  quantity: number;
  isMandatory: boolean;
  consumptionPolicy: string;
};

export type CatalogueServicePolicy = {
  followUpFrequencyDays: number | null;
  lateCancelNoticeHours: number | null;
  lateCancelConsumesComponent: boolean;
  missedConsumesComponent: boolean;
  medicalClearancePolicy: string | null;
};

export type CatalogueServiceVariant = {
  id: string;
  name: string;
  slug: string;
  priceXaf: number | null;
  durationValue: number | null;
  durationUnit: CatalogueDurationUnit | null;
  capacityLimit: number | null;
  availabilityStatus: CatalogueAvailabilityStatus;
  components: CatalogueServiceComponent[];
  policy: CatalogueServicePolicy | null;
};

export type CataloguePublicService = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricingMode: CataloguePricingMode;
  basePriceXaf: number | null;
  deliveryType: CatalogueDeliveryType;
  defaultDurationValue: number | null;
  defaultDurationUnit: CatalogueDurationUnit | null;
  availabilityStatus: CatalogueAvailabilityStatus;
  capacityMode: CatalogueCapacityMode;
  capacityLimit: number | null;
  waitlistEnabled: boolean;
  publishedAt: string;
  components: CatalogueServiceComponent[];
  policy: CatalogueServicePolicy | null;
  variants: CatalogueServiceVariant[];
};

export type CataloguePublicServicesResponse = {
  services: CataloguePublicService[];
};

export type CatalogueAdminService = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricingMode: CataloguePricingMode;
  basePriceXaf: number | null;
  deliveryType: CatalogueDeliveryType;
  defaultDurationValue: number | null;
  defaultDurationUnit: CatalogueDurationUnit | null;
  availabilityStatus: CatalogueAvailabilityStatus;
  capacityMode: CatalogueCapacityMode;
  capacityLimit: number | null;
  waitlistEnabled: boolean;
  isPublic: boolean;
  sortOrder: number;
  publishedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

export type CatalogueAdminServicesResponse = {
  services: CatalogueAdminService[];
};

export type CatalogueServiceMutationInput = {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  pricingMode?: unknown;
  basePriceXaf?: unknown;
  deliveryType?: unknown;
  defaultDurationValue?: unknown;
  defaultDurationUnit?: unknown;
  availabilityStatus?: unknown;
  capacityMode?: unknown;
  capacityLimit?: unknown;
  waitlistEnabled?: unknown;
  isPublic?: unknown;
  sortOrder?: unknown;
};

export type CatalogueServiceOrderInput = {
  items?: unknown;
};

export type CatalogueServiceCapacityInput = {
  availabilityStatus?: unknown;
  capacityMode?: unknown;
  capacityLimit?: unknown;
  waitlistEnabled?: unknown;
};

export type CatalogueAdminServiceResponse = {
  service: CatalogueAdminService;
};

export type CatalogueErrorResponse = {
  error: CatalogueErrorCode | string;
  reason?: string;
};

export type CatalogueApiResponse =
  | CataloguePublicServicesResponse
  | CatalogueAdminServicesResponse
  | CatalogueAdminServiceResponse
  | CatalogueErrorResponse;

/* ------------------------------------------------------------------ */
/* Catalogue overview (UX-7, board 06). Read-only. Decisions by Fred   */
/* on 2026-10-22: occupancy = S4 capacity-claim rule; a capacity limit */
/* below the occupied places is allowed with a warning (no block).     */
/* ------------------------------------------------------------------ */

export type CatalogueOccupancy = {
  /** Places held under the S4 rule (ready to start, active, paused, end review, onboarding with a valid reservation). */
  occupied: number;
  /** Of which onboarding subscriptions holding a reservation. */
  reservedOnboarding: number;
};

export type CatalogueAdminServiceOverview = CatalogueAdminService & {
  occupancy: CatalogueOccupancy & { byVariant: Array<CatalogueOccupancy & { variantId: string }> };
  waitlist: { active: number; oldestEnteredAt: string | null };
  /** Lowest price among the service base price and non-archived variants; null when none. */
  minPriceXaf: number | null;
  components: CatalogueServiceComponent[];
  policy: CatalogueServicePolicy | null;
  variants: CatalogueServiceVariant[];
};
export type CatalogueAdminServicesOverviewResponse = { asOf: string; services: CatalogueAdminServiceOverview[] };

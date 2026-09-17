export const catalogueApiRoutes = {
  publicServices: "/catalogue/services",
  adminServices: "/admin/catalogue/services",
  adminService: "/admin/catalogue/services/:serviceId",
  adminServicePublish: "/admin/catalogue/services/:serviceId/publish",
  adminServiceArchive: "/admin/catalogue/services/:serviceId/archive",
  adminServiceCapacity: "/admin/catalogue/services/:serviceId/capacity",
  adminServiceOrder: "/admin/catalogue/services/order",
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
] as const;

export type CatalogueErrorCode = (typeof catalogueErrorCodes)[number];

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

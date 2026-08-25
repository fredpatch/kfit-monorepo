export const catalogueApiRoutes = {
  publicServices: "/catalogue/services",
} as const;

export type CatalogueApiRoute = (typeof catalogueApiRoutes)[keyof typeof catalogueApiRoutes];

export const catalogueErrorCodes = [
  "CATALOGUE_ROUTE_UNEXPECTED_FAILURE",
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

export type CatalogueErrorResponse = {
  error: CatalogueErrorCode;
};

export type CatalogueApiResponse =
  | CataloguePublicServicesResponse
  | CatalogueErrorResponse;

export const adminCustomersApiRoutes = {
  list: "/admin/customers",
  search: "/admin/customers/search",
  create: "/admin/customers",
  detail: "/admin/customers/:customerId",
} as const;

export const customerErrorCodes = [
  "CUSTOMER_INVALID_INPUT",
  "CUSTOMER_DUPLICATE_WHATSAPP",
  "CUSTOMER_ADMIN_FORBIDDEN",
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_ROUTE_UNEXPECTED_FAILURE",
] as const;
export type CustomerErrorCode = (typeof customerErrorCodes)[number];

export type AdminCustomer = {
  id: string;
  fullName: string;
  whatsapp: string;
  email: string | null;
  city: string | null;
  country: string | null;
  preferredContactChannel: string;
  prospectId: string | null;
  createdAt: string;
};

export type CreateCustomerInput = {
  fullName?: unknown;
  whatsapp?: unknown;
  email?: unknown;
  city?: unknown;
  country?: unknown;
  preferredContactChannel?: unknown;
};
export type AdminCustomersResponse = { customers: AdminCustomer[] };
export type CreateCustomerResponse = { customer: AdminCustomer };
export type CustomerErrorResponse = { error: CustomerErrorCode; reason?: string };

/** Subscription line on the client profile (UX-4). Read-only summary; details come from the per-subscription endpoints. */
export type AdminCustomerSubscriptionSummary = {
  id: string;
  reference: string;
  status: string;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  variantId: string | null;
  variantName: string | null;
  agreedPriceXaf: number;
  plannedStartDate: string | null;
  actualStartDate: string | null;
  plannedEndDate: string | null;
  actualEndDate: string | null;
  renewedFromSubscriptionId: string | null;
  createdAt: string;
};
export type AdminCustomerDetailResponse = { customer: AdminCustomer; subscriptions: AdminCustomerSubscriptionSummary[] };

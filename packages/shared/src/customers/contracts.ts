export const adminCustomersApiRoutes = {
  list: "/admin/customers",
  search: "/admin/customers/search",
  create: "/admin/customers",
} as const;

export const customerErrorCodes = [
  "CUSTOMER_INVALID_INPUT",
  "CUSTOMER_DUPLICATE_WHATSAPP",
  "CUSTOMER_ADMIN_FORBIDDEN",
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

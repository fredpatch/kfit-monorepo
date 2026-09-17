export const requestsApiRoutes = {
  publicSubmit: "/requests",
} as const;

export type RequestsApiRoute = (typeof requestsApiRoutes)[keyof typeof requestsApiRoutes];

export const requestErrorCodes = [
  "REQUEST_ROUTE_UNEXPECTED_FAILURE",
  "REQUEST_INVALID_INPUT",
  "REQUEST_SERVICE_NOT_FOUND",
  "REQUEST_SERVICE_NOT_PUBLIC",
  "REQUEST_SERVICE_UNAVAILABLE",
  "REQUEST_SERVICE_ARCHIVED",
  "REQUEST_WAITLIST_REQUIRED",
  "REQUEST_VARIANT_INVALID",
  "REQUEST_RATE_LIMITED",
] as const;

export type RequestErrorCode = (typeof requestErrorCodes)[number];

export type RequestSubmissionInput = {
  fullName?: unknown;
  whatsapp?: unknown;
  email?: unknown;
  serviceId?: unknown;
  requestedVariantId?: unknown;
  objective?: unknown;
  preferredStartDate?: unknown;
  message?: unknown;
  submissionToken?: unknown;
  /** Honeypot field. Must stay empty; a filled value marks the submission as automated. */
  website?: unknown;
  /** ISO timestamp captured when the form instance was rendered, used for a minimum-completion-time check. */
  formRenderedAt?: unknown;
};

export type RequestSubmissionRecord = {
  id: string;
  reference: string;
  status: "submitted";
  submittedAt: string;
};

export type RequestSubmissionResponse = {
  request: RequestSubmissionRecord;
};

export type RequestErrorResponse = {
  error: RequestErrorCode | string;
  reason?: string;
};

export type RequestsApiResponse = RequestSubmissionResponse | RequestErrorResponse;

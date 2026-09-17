export const requestsApiRoutes = {
  publicSubmit: "/requests",
} as const;

export type RequestsApiRoute = (typeof requestsApiRoutes)[keyof typeof requestsApiRoutes];

export const adminRequestsApiRoutes = {
  queue: "/admin/requests",
  detail: "/admin/requests/:requestId",
  contactAttempts: "/admin/requests/:requestId/contact-attempts",
  status: "/admin/requests/:requestId/status",
} as const;

export type AdminRequestsApiRoute = (typeof adminRequestsApiRoutes)[keyof typeof adminRequestsApiRoutes];

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
  "REQUEST_ADMIN_FORBIDDEN",
  "REQUEST_NOT_FOUND",
  "REQUEST_INVALID_TRANSITION",
  "REQUEST_CONTACT_ATTEMPT_INVALID_INPUT",
  "REQUEST_STATUS_INVALID_INPUT",
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

// --- Admin request queue + contact attempts (S3.3) ---

/**
 * Full request lifecycle vocabulary (state-machines.md §2). S3.3 only exposes a
 * safe subset of transitions between these statuses — see adminRequestAllowedTransitions.
 */
export type ServiceRequestStatus =
  | "submitted"
  | "contacting"
  | "qualification_in_progress"
  | "qualified"
  | "qualified_with_conditions"
  | "waitlisted"
  | "rejected"
  | "abandoned"
  | "converted"
  | "closed_duplicate";

export const serviceRequestStatuses: readonly ServiceRequestStatus[] = [
  "submitted",
  "contacting",
  "qualification_in_progress",
  "qualified",
  "qualified_with_conditions",
  "waitlisted",
  "rejected",
  "abandoned",
  "converted",
  "closed_duplicate",
];

/**
 * S3.3-approved transition allow-list. Every other combination (including all
 * qualification/waitlist/conversion/duplicate outcomes owned by S3.4/S3.5) must
 * be rejected as REQUEST_INVALID_TRANSITION.
 */
export const adminRequestAllowedTransitions: Readonly<Record<string, readonly ServiceRequestStatus[]>> = {
  submitted: ["contacting"],
  contacting: ["qualification_in_progress", "abandoned"],
  qualification_in_progress: ["abandoned"],
  abandoned: ["qualification_in_progress"],
} as const;

export type ContactAttemptChannel = "whatsapp" | "phone_call" | "sms" | "email" | "other";
export const contactAttemptChannels: readonly ContactAttemptChannel[] = ["whatsapp", "phone_call", "sms", "email", "other"];

export type ContactAttemptDirection = "outbound" | "inbound";
export const contactAttemptDirections: readonly ContactAttemptDirection[] = ["outbound", "inbound"];

export type ContactAttemptOutcome = "reached" | "no_answer" | "invalid_contact" | "callback_requested" | "not_interested" | "other";
export const contactAttemptOutcomes: readonly ContactAttemptOutcome[] = [
  "reached",
  "no_answer",
  "invalid_contact",
  "callback_requested",
  "not_interested",
  "other",
];

/** contact_attempts has no created_at column — occurredAt is the only timestamp of record. */
export type AdminContactAttempt = {
  id: string;
  channel: ContactAttemptChannel;
  direction: ContactAttemptDirection;
  outcome: ContactAttemptOutcome;
  note: string | null;
  occurredAt: string;
  nextActionAt: string | null;
  createdByUserId: string | null;
};

export type AdminServiceRequestProspect = {
  id: string;
  fullName: string;
  whatsapp: string;
  email: string | null;
};

export type AdminServiceRequestService = {
  id: string;
  name: string;
};

export type AdminServiceRequestVariant = {
  id: string;
  name: string;
};

export type AdminServiceRequestSummary = {
  id: string;
  reference: string;
  status: ServiceRequestStatus;
  submittedAt: string;
  prospect: AdminServiceRequestProspect;
  service: AdminServiceRequestService;
  requestedVariant: AdminServiceRequestVariant | null;
  lastContactAttemptAt: string | null;
  nextActionAt: string | null;
};

export type AdminServiceRequestDetail = AdminServiceRequestSummary & {
  objective: string | null;
  preferredStartDate: string | null;
  message: string | null;
  duplicateOfRequestId: string | null;
  contactAttempts: AdminContactAttempt[];
};

export type AdminRequestsQueueResponse = {
  requests: AdminServiceRequestSummary[];
};

export type AdminRequestDetailResponse = {
  request: AdminServiceRequestDetail;
};

export type AdminRequestsQueueQuery = {
  status?: ServiceRequestStatus;
};

export type CreateContactAttemptInput = {
  channel?: unknown;
  direction?: unknown;
  outcome?: unknown;
  note?: unknown;
  occurredAt?: unknown;
  nextActionAt?: unknown;
};

export type CreateContactAttemptResponse = {
  contactAttempt: AdminContactAttempt;
  request: AdminServiceRequestSummary;
};

export type RequestStatusTransitionInput = {
  toStatus?: unknown;
};

export type RequestStatusTransitionResponse = {
  request: AdminServiceRequestSummary;
};

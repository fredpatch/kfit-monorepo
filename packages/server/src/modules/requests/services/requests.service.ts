import type { RequestSubmissionInput, RequestSubmissionResponse } from "@kfit/shared";
import type { AuditService } from "../../auth/services/audit.service.js";

export type ServiceAvailabilityStatus = "open" | "temporarily_closed" | "waitlist_only" | "archived";

export type ServiceAvailabilityRecord = {
  id: string;
  availabilityStatus: ServiceAvailabilityStatus;
  archivedAt: Date | null;
  isPublic: boolean;
  publishedAt: Date | null;
};

export type CreatedServiceRequestRecord = {
  id: string;
  reference: string;
  submittedAt: Date;
};

export type CreateServiceRequestInput = {
  submissionToken: string;
  fullName: string;
  whatsapp: string;
  email: string | null;
  serviceId: string;
  requestedVariantId: string | null;
  objective: string | null;
  preferredStartDate: Date | null;
  message: string | null;
};

export type CreateServiceRequestResult =
  | { outcome: "created"; request: CreatedServiceRequestRecord }
  | { outcome: "replayed"; request: CreatedServiceRequestRecord };

export type RequestsRepository = {
  findServiceAvailability(serviceId: string): Promise<ServiceAvailabilityRecord | null>;
  /** Returns the owning serviceId for a variant, or null if the variant does not exist. */
  findVariantOwnerServiceId(variantId: string): Promise<string | null>;
  createServiceRequest(input: CreateServiceRequestInput): Promise<CreateServiceRequestResult>;
};

export type SubmitRequestContext = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  now: Date;
};

export type SubmitRequestResult =
  | { status: "ok"; response: RequestSubmissionResponse }
  | { status: "invalid"; reason: string }
  | { status: "service_not_found" }
  | { status: "service_not_public" }
  | { status: "service_unavailable" }
  | { status: "service_archived" }
  | { status: "waitlist_required" }
  | { status: "variant_invalid" };

type NormalizedSubmission = {
  fullName: string;
  whatsapp: string;
  email: string | null;
  serviceId: string;
  requestedVariantId: string | null;
  objective: string | null;
  preferredStartDate: Date | null;
  message: string | null;
  submissionToken: string;
  isBotSignal: boolean;
  formRenderedAt: Date | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) return null;
  return trimmed;
}

function optionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) return undefined;
  return trimmed;
}

function normalizeWhatsapp(value: string): string | null {
  const stripped = value.replace(/[^\d+]/g, "");
  const digits = stripped.replace(/^\+/, "");
  if (digits.length < 6 || digits.length > 20) return null;
  return stripped;
}

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function normalizeSubmission(input: RequestSubmissionInput): NormalizedSubmission | { invalid: string } {
  const fullName = requiredString(input.fullName, 200);
  if (!fullName) return { invalid: "full_name_invalid" };

  const rawWhatsapp = requiredString(input.whatsapp, 30);
  if (!rawWhatsapp) return { invalid: "whatsapp_invalid" };
  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) return { invalid: "whatsapp_invalid" };

  const email = optionalString(input.email, 200);
  if (email === undefined) return { invalid: "email_invalid" };
  if (email !== null && !email.includes("@")) return { invalid: "email_invalid" };

  const serviceId = requiredString(input.serviceId, 64);
  if (!serviceId || !uuidPattern.test(serviceId)) return { invalid: "service_id_invalid" };

  const requestedVariantId = optionalString(input.requestedVariantId, 64);
  if (requestedVariantId === undefined) return { invalid: "requested_variant_id_invalid" };
  if (requestedVariantId !== null && !uuidPattern.test(requestedVariantId)) return { invalid: "requested_variant_id_invalid" };

  const objective = optionalString(input.objective, 500);
  if (objective === undefined) return { invalid: "objective_invalid" };

  const message = optionalString(input.message, 2000);
  if (message === undefined) return { invalid: "message_invalid" };

  const preferredStartDate = parseOptionalDate(input.preferredStartDate);
  if (preferredStartDate === undefined) return { invalid: "preferred_start_date_invalid" };

  const submissionToken = requiredString(input.submissionToken, 128);
  if (!submissionToken) return { invalid: "submission_token_invalid" };

  const isBotSignal = typeof input.website === "string" && input.website.trim() !== "";

  let formRenderedAt: Date | null = null;
  if (typeof input.formRenderedAt === "string") {
    const parsed = new Date(input.formRenderedAt);
    if (!Number.isNaN(parsed.getTime())) formRenderedAt = parsed;
  }

  return {
    fullName,
    whatsapp,
    email,
    serviceId,
    requestedVariantId,
    objective,
    preferredStartDate,
    message,
    submissionToken,
    isBotSignal,
    formRenderedAt,
  };
}

export class RequestsService {
  constructor(
    private readonly repository: RequestsRepository,
    private readonly audit: Pick<AuditService, "record">,
    private readonly options: { minFormFillMs: number } = { minFormFillMs: 1500 },
  ) {}

  async submit(input: RequestSubmissionInput, context: SubmitRequestContext): Promise<SubmitRequestResult> {
    const normalized = normalizeSubmission(input);
    if ("invalid" in normalized) return { status: "invalid", reason: normalized.invalid };

    const elapsedSinceRender = normalized.formRenderedAt ? context.now.getTime() - normalized.formRenderedAt.getTime() : null;
    const isTooFast = elapsedSinceRender !== null && elapsedSinceRender >= 0 && elapsedSinceRender < this.options.minFormFillMs;

    if (normalized.isBotSignal || isTooFast) {
      await this.audit.record({
        actorType: "anonymous",
        eventType: "request.submission_blocked",
        entityType: "service_request",
        result: "blocked",
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { signal: normalized.isBotSignal ? "honeypot" : "form_fill_too_fast" },
      });
      return { status: "invalid", reason: "submission_invalid" };
    }

    const service = await this.repository.findServiceAvailability(normalized.serviceId);
    if (!service) return { status: "service_not_found" };

    if (service.archivedAt || service.availabilityStatus === "archived") {
      await this.audit.record({
        actorType: "anonymous",
        eventType: "request.submission_rejected",
        entityType: "service_request",
        entityId: service.id,
        result: "blocked",
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { availabilityStatus: "archived" },
      });
      return { status: "service_archived" };
    }

    if (!service.isPublic || !service.publishedAt) {
      await this.audit.record({
        actorType: "anonymous",
        eventType: "request.submission_rejected",
        entityType: "service_request",
        entityId: service.id,
        result: "blocked",
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { reason: "not_public" },
      });
      return { status: "service_not_public" };
    }

    if (service.availabilityStatus === "temporarily_closed") {
      await this.audit.record({
        actorType: "anonymous",
        eventType: "request.submission_rejected",
        entityType: "service_request",
        entityId: service.id,
        result: "blocked",
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { availabilityStatus: "temporarily_closed" },
      });
      return { status: "service_unavailable" };
    }

    if (service.availabilityStatus === "waitlist_only") {
      await this.audit.record({
        actorType: "anonymous",
        eventType: "request.submission_rejected",
        entityType: "service_request",
        entityId: service.id,
        result: "blocked",
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { availabilityStatus: "waitlist_only" },
      });
      return { status: "waitlist_required" };
    }

    if (normalized.requestedVariantId) {
      const ownerServiceId = await this.repository.findVariantOwnerServiceId(normalized.requestedVariantId);
      if (ownerServiceId !== normalized.serviceId) {
        // Do not distinguish "variant does not exist" from "variant belongs to another
        // service" in the public response — both collapse to the same generic code.
        await this.audit.record({
          actorType: "anonymous",
          eventType: "request.submission_rejected",
          entityType: "service_request",
          entityId: service.id,
          result: "blocked",
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { reason: "variant_invalid" },
        });
        return { status: "variant_invalid" };
      }
    }

    const result = await this.repository.createServiceRequest({
      submissionToken: normalized.submissionToken,
      fullName: normalized.fullName,
      whatsapp: normalized.whatsapp,
      email: normalized.email,
      serviceId: normalized.serviceId,
      requestedVariantId: normalized.requestedVariantId,
      objective: normalized.objective,
      preferredStartDate: normalized.preferredStartDate,
      message: normalized.message,
    });

    await this.audit.record({
      actorType: "anonymous",
      eventType: "request.submitted",
      entityType: "service_request",
      entityId: result.request.id,
      result: "success",
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { replayed: result.outcome === "replayed" },
    });

    return {
      status: "ok",
      response: {
        request: {
          id: result.request.id,
          reference: result.request.reference,
          status: "submitted",
          submittedAt: result.request.submittedAt.toISOString(),
        },
      },
    };
  }
}

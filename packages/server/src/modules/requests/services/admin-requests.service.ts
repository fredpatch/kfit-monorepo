import {
  adminRequestAllowedTransitions,
  contactAttemptChannels,
  contactAttemptDirections,
  contactAttemptOutcomes,
  qualificationReviewOutcomes,
  type AdminContactAttempt,
  type AdminQualificationReview,
  type AdminRequestsQueueQuery,
  type AdminServiceRequestDetail,
  type AdminServiceRequestSummary,
  type ContactAttemptChannel,
  type ContactAttemptDirection,
  type ContactAttemptOutcome,
  type CreateContactAttemptInput,
  type CreateQualificationReviewInput,
  type QualificationReviewOutcome,
  type ServiceRequestStatus,
} from "@kfit/shared";

export type AdminRequestActor = {
  userId: string;
};

/** Per-call request context for audit hashing — never baked into a shared repository instance. */
export type AdminRequestAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type NormalizedContactAttemptInput = {
  channel: ContactAttemptChannel;
  direction: ContactAttemptDirection;
  outcome: ContactAttemptOutcome;
  note: string | null;
  occurredAt: Date;
  nextActionAt: Date | null;
};

export type NormalizedQualificationReviewInput = {
  outcome: QualificationReviewOutcome;
  finalVariantId: string | null;
  agreedPriceXaf: number | null;
  targetStartDate: Date | null;
  suitabilityNote: string | null;
  conditions: string[] | null;
  blockers: string[] | null;
};

export type AdminRequestsRepository = {
  listQueue(filter: { status?: ServiceRequestStatus }): Promise<AdminServiceRequestSummary[]>;
  getDetail(requestId: string): Promise<AdminServiceRequestDetail | null>;
  createContactAttempt(
    requestId: string,
    input: NormalizedContactAttemptInput,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<{ contactAttempt: AdminContactAttempt; request: AdminServiceRequestSummary } | "not_found">;
  /**
   * Must load the current status with a row lock and re-check it against
   * adminRequestAllowedTransitions inside the same transaction as the audit
   * insert — the service-level check below is advisory only and does not
   * protect against concurrent transitions.
   */
  transitionStatus(
    requestId: string,
    toStatus: ServiceRequestStatus,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<{ request: AdminServiceRequestSummary } | "not_found" | "invalid_transition">;
  recordQualificationReview(
    requestId: string,
    input: NormalizedQualificationReviewInput,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<
    | { qualificationReview: AdminQualificationReview; request: AdminServiceRequestSummary }
    | "not_found"
    | "invalid_transition"
    | "variant_invalid"
  >;
};

export type CreateContactAttemptResult =
  | { status: "ok"; contactAttempt: AdminContactAttempt; request: AdminServiceRequestSummary }
  | { status: "not_found" }
  | { status: "invalid"; reason: string };

export type TransitionStatusResult =
  | { status: "ok"; request: AdminServiceRequestSummary }
  | { status: "not_found" }
  | { status: "invalid_transition" }
  | { status: "invalid"; reason: string };

export type RecordQualificationReviewResult =
  | { status: "ok"; qualificationReview: AdminQualificationReview; request: AdminServiceRequestSummary }
  | { status: "not_found" }
  | { status: "invalid_transition" }
  | { status: "invalid"; reason: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every status reachable through the S3.3-approved transition subset. */
const reachableStatuses: ReadonlySet<string> = new Set(Object.values(adminRequestAllowedTransitions).flat());

function optionalTrimmedString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) return undefined;
  return trimmed;
}

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function normalizeStringList(value: unknown, maxItems: number, maxItemLength: number): string[] | null | undefined {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > maxItems) return undefined;

  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return undefined;
    const trimmed = item.trim();
    if (trimmed === "" || trimmed.length > maxItemLength) return undefined;
    items.push(trimmed);
  }
  return items;
}

function normalizeContactAttempt(input: CreateContactAttemptInput, now: Date): NormalizedContactAttemptInput | { invalid: string } {
  if (typeof input.channel !== "string" || !contactAttemptChannels.includes(input.channel as ContactAttemptChannel)) {
    return { invalid: "channel_invalid" };
  }
  if (typeof input.direction !== "string" || !contactAttemptDirections.includes(input.direction as ContactAttemptDirection)) {
    return { invalid: "direction_invalid" };
  }
  if (typeof input.outcome !== "string" || !contactAttemptOutcomes.includes(input.outcome as ContactAttemptOutcome)) {
    return { invalid: "outcome_invalid" };
  }

  const note = optionalTrimmedString(input.note, 1000);
  if (note === undefined) return { invalid: "note_invalid" };

  let occurredAt = now;
  if (input.occurredAt !== undefined && input.occurredAt !== null) {
    const parsedOccurredAt = parseOptionalDate(input.occurredAt);
    if (parsedOccurredAt === undefined) return { invalid: "occurred_at_invalid" };
    if (parsedOccurredAt) occurredAt = parsedOccurredAt;
  }

  const nextActionAt = parseOptionalDate(input.nextActionAt);
  if (nextActionAt === undefined) return { invalid: "next_action_at_invalid" };

  return {
    channel: input.channel as ContactAttemptChannel,
    direction: input.direction as ContactAttemptDirection,
    outcome: input.outcome as ContactAttemptOutcome,
    note,
    occurredAt,
    nextActionAt,
  };
}

function normalizeQualificationReview(input: CreateQualificationReviewInput): NormalizedQualificationReviewInput | { invalid: string } {
  if (typeof input.outcome !== "string" || !qualificationReviewOutcomes.includes(input.outcome as QualificationReviewOutcome)) {
    return { invalid: "outcome_invalid" };
  }

  const outcome = input.outcome as QualificationReviewOutcome;
  const suitabilityNote = optionalTrimmedString(input.suitabilityNote, 2000);
  if (suitabilityNote === undefined) return { invalid: "suitability_note_invalid" };

  const targetStartDate = parseOptionalDate(input.targetStartDate);
  if (targetStartDate === undefined) return { invalid: "target_start_date_invalid" };

  const conditions = normalizeStringList(input.conditions, 20, 240);
  if (conditions === undefined) return { invalid: "conditions_invalid" };

  const blockers = normalizeStringList(input.blockers, 20, 240);
  if (blockers === undefined) return { invalid: "blockers_invalid" };

  if (outcome === "rejected") {
    if (input.finalVariantId !== undefined && input.finalVariantId !== null && input.finalVariantId !== "") return { invalid: "final_variant_forbidden" };
    if (input.agreedPriceXaf !== undefined && input.agreedPriceXaf !== null && input.agreedPriceXaf !== "") return { invalid: "agreed_price_forbidden" };
    if (input.targetStartDate !== undefined && input.targetStartDate !== null && input.targetStartDate !== "") return { invalid: "target_start_date_forbidden" };
    return { outcome, finalVariantId: null, agreedPriceXaf: null, targetStartDate: null, suitabilityNote, conditions: null, blockers };
  }

  if (typeof input.finalVariantId !== "string" || !uuidPattern.test(input.finalVariantId)) return { invalid: "final_variant_id_invalid" };
  if (typeof input.agreedPriceXaf !== "number" || !Number.isInteger(input.agreedPriceXaf) || input.agreedPriceXaf < 0) {
    return { invalid: "agreed_price_invalid" };
  }
  const agreedPriceXaf = input.agreedPriceXaf;
  if (outcome === "qualified_with_conditions" && (!conditions || conditions.length === 0)) return { invalid: "conditions_required" };

  return {
    outcome,
    finalVariantId: input.finalVariantId,
    agreedPriceXaf,
    targetStartDate,
    suitabilityNote,
    conditions: outcome === "qualified_with_conditions" ? conditions : null,
    blockers,
  };
}

export class AdminRequestsService {
  constructor(private readonly repository: AdminRequestsRepository) {}

  async listQueue(query: AdminRequestsQueueQuery): Promise<AdminServiceRequestSummary[]> {
    return this.repository.listQueue(query.status ? { status: query.status } : {});
  }

  async getDetail(requestId: string): Promise<{ status: "ok"; detail: AdminServiceRequestDetail } | { status: "not_found" } | { status: "invalid" }> {
    if (!uuidPattern.test(requestId)) return { status: "invalid" };
    const detail = await this.repository.getDetail(requestId);
    if (!detail) return { status: "not_found" };
    return { status: "ok", detail };
  }

  async logContactAttempt(
    requestId: string,
    input: CreateContactAttemptInput,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<CreateContactAttemptResult> {
    if (!uuidPattern.test(requestId)) return { status: "invalid", reason: "request_id_invalid" };

    const normalized = normalizeContactAttempt(input, now);
    if ("invalid" in normalized) return { status: "invalid", reason: normalized.invalid };

    const result = await this.repository.createContactAttempt(requestId, normalized, actor, auditContext, now);
    if (result === "not_found") return { status: "not_found" };
    return { status: "ok", contactAttempt: result.contactAttempt, request: result.request };
  }

  async transitionStatus(
    requestId: string,
    toStatusInput: unknown,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<TransitionStatusResult> {
    if (!uuidPattern.test(requestId)) return { status: "invalid", reason: "request_id_invalid" };
    if (typeof toStatusInput !== "string" || !reachableStatuses.has(toStatusInput)) {
      return { status: "invalid", reason: "to_status_invalid" };
    }

    const result = await this.repository.transitionStatus(requestId, toStatusInput as ServiceRequestStatus, actor, auditContext, now);
    if (result === "not_found") return { status: "not_found" };
    if (result === "invalid_transition") return { status: "invalid_transition" };
    return { status: "ok", request: result.request };
  }

  async recordQualificationReview(
    requestId: string,
    input: CreateQualificationReviewInput,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<RecordQualificationReviewResult> {
    if (!uuidPattern.test(requestId)) return { status: "invalid", reason: "request_id_invalid" };

    const normalized = normalizeQualificationReview(input);
    if ("invalid" in normalized) return { status: "invalid", reason: normalized.invalid };

    const result = await this.repository.recordQualificationReview(requestId, normalized, actor, auditContext, now);
    if (result === "not_found") return { status: "not_found" };
    if (result === "invalid_transition") return { status: "invalid_transition" };
    if (result === "variant_invalid") return { status: "invalid", reason: "final_variant_id_invalid" };
    return { status: "ok", qualificationReview: result.qualificationReview, request: result.request };
  }
}

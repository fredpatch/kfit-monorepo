import {
  adminRequestAllowedTransitions,
  contactAttemptChannels,
  contactAttemptDirections,
  contactAttemptOutcomes,
  type AdminContactAttempt,
  type AdminRequestsQueueQuery,
  type AdminServiceRequestDetail,
  type AdminServiceRequestSummary,
  type ContactAttemptChannel,
  type ContactAttemptDirection,
  type ContactAttemptOutcome,
  type CreateContactAttemptInput,
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
}

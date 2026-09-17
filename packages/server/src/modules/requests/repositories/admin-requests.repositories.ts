import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type {
  AdminContactAttempt,
  AdminQualificationReview,
  AdminServiceRequestDetail,
  AdminServiceRequestVariant,
  AdminServiceRequestSummary,
  AdminWaitlistEntry,
  QualificationReviewOutcome,
  ServiceRequestStatus,
  WaitlistEntryStatus,
} from "@kfit/shared";
import { adminRequestAllowedTransitions } from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import { auditEvents } from "../../../db/schema/auth.js";
import { services, serviceVariants } from "../../../db/schema/catalogue.js";
import { contactAttempts, prospects, qualificationReviews, serviceRequests, waitlistEntries } from "../../../db/schema/prospects.js";
import { hashAuditContext } from "../../auth/services/audit.service.js";
import type {
  AdminRequestActor,
  AdminRequestAuditContext,
  AdminRequestsRepository,
  NormalizedContactAttemptInput,
  NormalizedCreateWaitlistEntryInput,
  NormalizedQualificationReviewInput,
} from "../services/admin-requests.service.js";

type AdminRequestsDb = typeof appDb;

export type AdminRequestsRepositoryOptions = {
  auditHashPepper: string;
};

type BaseRow = {
  id: string;
  reference: string;
  status: string;
  submittedAt: Date;
  objective: string | null;
  preferredStartDate: Date | null;
  message: string | null;
  duplicateOfRequestId: string | null;
  prospectId: string;
  prospectFullName: string;
  prospectWhatsapp: string;
  prospectEmail: string | null;
  serviceId: string;
  serviceName: string;
  requestedVariantId: string | null;
  requestedVariantName: string | null;
};

const baseSelect = {
  id: serviceRequests.id,
  reference: serviceRequests.reference,
  status: serviceRequests.status,
  submittedAt: serviceRequests.submittedAt,
  objective: serviceRequests.objective,
  preferredStartDate: serviceRequests.preferredStartDate,
  message: serviceRequests.message,
  duplicateOfRequestId: serviceRequests.duplicateOfRequestId,
  prospectId: prospects.id,
  prospectFullName: prospects.fullName,
  prospectWhatsapp: prospects.whatsapp,
  prospectEmail: prospects.email,
  serviceId: services.id,
  serviceName: services.name,
  requestedVariantId: serviceVariants.id,
  requestedVariantName: serviceVariants.name,
};

function toSummary(row: BaseRow, lastContactAttemptAt: Date | null, nextActionAt: Date | null): AdminServiceRequestSummary {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status as ServiceRequestStatus,
    submittedAt: row.submittedAt.toISOString(),
    prospect: {
      id: row.prospectId,
      fullName: row.prospectFullName,
      whatsapp: row.prospectWhatsapp,
      email: row.prospectEmail,
    },
    service: { id: row.serviceId, name: row.serviceName },
    requestedVariant: row.requestedVariantId ? { id: row.requestedVariantId, name: row.requestedVariantName ?? "" } : null,
    lastContactAttemptAt: lastContactAttemptAt ? lastContactAttemptAt.toISOString() : null,
    nextActionAt: nextActionAt ? nextActionAt.toISOString() : null,
  };
}

function toContactAttemptDto(attempt: {
  id: string;
  channel: string;
  direction: string;
  outcome: string;
  note: string | null;
  occurredAt: Date;
  nextActionAt: Date | null;
  createdByUserId: string | null;
}): AdminContactAttempt {
  return {
    id: attempt.id,
    channel: attempt.channel as AdminContactAttempt["channel"],
    direction: attempt.direction as AdminContactAttempt["direction"],
    outcome: attempt.outcome as AdminContactAttempt["outcome"],
    note: attempt.note,
    occurredAt: attempt.occurredAt.toISOString(),
    nextActionAt: attempt.nextActionAt ? attempt.nextActionAt.toISOString() : null,
    createdByUserId: attempt.createdByUserId,
  };
}

function jsonStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : null;
}

function toQualificationReviewDto(review: {
  id: string;
  version: number;
  outcome: string;
  finalVariantId: string | null;
  agreedPriceXaf: number | null;
  targetStartDate: Date | null;
  suitabilityNote: string | null;
  conditionsJson: unknown;
  blockersJson: unknown;
  createdByUserId: string | null;
  createdAt: Date;
  supersededAt: Date | null;
}): AdminQualificationReview {
  return {
    id: review.id,
    version: review.version,
    outcome: review.outcome as QualificationReviewOutcome,
    finalVariantId: review.finalVariantId,
    agreedPriceXaf: review.agreedPriceXaf,
    targetStartDate: review.targetStartDate ? review.targetStartDate.toISOString() : null,
    suitabilityNote: review.suitabilityNote,
    conditions: jsonStringList(review.conditionsJson),
    blockers: jsonStringList(review.blockersJson),
    createdByUserId: review.createdByUserId,
    createdAt: review.createdAt.toISOString(),
    supersededAt: review.supersededAt ? review.supersededAt.toISOString() : null,
  };
}

function toWaitlistEntryDto(entry: {
  id: string;
  requestId: string;
  serviceId: string;
  variantId: string | null;
  status: string;
  priorityNote: string | null;
  enteredAt: Date;
  leftAt: Date | null;
}): AdminWaitlistEntry {
  return {
    id: entry.id,
    requestId: entry.requestId,
    serviceId: entry.serviceId,
    variantId: entry.variantId,
    status: entry.status as WaitlistEntryStatus,
    priorityNote: entry.priorityNote,
    enteredAt: entry.enteredAt.toISOString(),
    leftAt: entry.leftAt ? entry.leftAt.toISOString() : null,
  };
}

export class DrizzleAdminRequestsRepository implements AdminRequestsRepository {
  constructor(
    private readonly database: AdminRequestsDb,
    private readonly options: AdminRequestsRepositoryOptions,
  ) {}

  private baseQuery() {
    return this.database
      .select(baseSelect)
      .from(serviceRequests)
      .innerJoin(prospects, eq(serviceRequests.prospectId, prospects.id))
      .innerJoin(services, eq(serviceRequests.serviceId, services.id))
      .leftJoin(serviceVariants, eq(serviceRequests.requestedVariantId, serviceVariants.id));
  }

  private async latestContactAttemptByRequest(requestIds: string[]): Promise<Map<string, { occurredAt: Date; nextActionAt: Date | null }>> {
    if (requestIds.length === 0) return new Map();

    const rows = await this.database
      .select({
        requestId: contactAttempts.requestId,
        occurredAt: contactAttempts.occurredAt,
        nextActionAt: contactAttempts.nextActionAt,
      })
      .from(contactAttempts)
      .where(inArray(contactAttempts.requestId, requestIds))
      .orderBy(desc(contactAttempts.occurredAt));

    const latest = new Map<string, { occurredAt: Date; nextActionAt: Date | null }>();
    for (const row of rows) {
      if (!row.requestId || latest.has(row.requestId)) continue;
      latest.set(row.requestId, { occurredAt: row.occurredAt, nextActionAt: row.nextActionAt });
    }
    return latest;
  }

  async listQueue(filter: { status?: ServiceRequestStatus }): Promise<AdminServiceRequestSummary[]> {
    const query = this.baseQuery();
    const rows = filter.status
      ? await query.where(eq(serviceRequests.status, filter.status)).orderBy(desc(serviceRequests.submittedAt))
      : await query.orderBy(desc(serviceRequests.submittedAt));

    if (rows.length === 0) return [];

    const lastAttempts = await this.latestContactAttemptByRequest(rows.map((row) => row.id));
    return rows.map((row) => {
      const last = lastAttempts.get(row.id) ?? null;
      return toSummary(row, last?.occurredAt ?? null, last?.nextActionAt ?? null);
    });
  }

  async getDetail(requestId: string): Promise<AdminServiceRequestDetail | null> {
    const [row] = await this.baseQuery().where(eq(serviceRequests.id, requestId)).limit(1);
    if (!row) return null;

    const attempts = await this.database
      .select({
        id: contactAttempts.id,
        channel: contactAttempts.channel,
        direction: contactAttempts.direction,
        outcome: contactAttempts.outcome,
        note: contactAttempts.note,
        occurredAt: contactAttempts.occurredAt,
        nextActionAt: contactAttempts.nextActionAt,
        createdByUserId: contactAttempts.createdByUserId,
      })
      .from(contactAttempts)
      .where(eq(contactAttempts.requestId, requestId))
      .orderBy(desc(contactAttempts.occurredAt));

    const variants = await this.variantsForService(row.serviceId);

    const reviews = await this.database
      .select({
        id: qualificationReviews.id,
        version: qualificationReviews.version,
        outcome: qualificationReviews.outcome,
        finalVariantId: qualificationReviews.finalVariantId,
        agreedPriceXaf: qualificationReviews.agreedPriceXaf,
        targetStartDate: qualificationReviews.targetStartDate,
        suitabilityNote: qualificationReviews.suitabilityNote,
        conditionsJson: qualificationReviews.conditionsJson,
        blockersJson: qualificationReviews.blockersJson,
        createdByUserId: qualificationReviews.createdByUserId,
        createdAt: qualificationReviews.createdAt,
        supersededAt: qualificationReviews.supersededAt,
      })
      .from(qualificationReviews)
      .where(eq(qualificationReviews.requestId, requestId))
      .orderBy(desc(qualificationReviews.version));

    const waitlistRows = await this.database
      .select({
        id: waitlistEntries.id,
        requestId: waitlistEntries.requestId,
        serviceId: waitlistEntries.serviceId,
        variantId: waitlistEntries.variantId,
        status: waitlistEntries.status,
        priorityNote: waitlistEntries.priorityNote,
        enteredAt: waitlistEntries.enteredAt,
        leftAt: waitlistEntries.leftAt,
      })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.requestId, requestId))
      .orderBy(asc(waitlistEntries.enteredAt), asc(waitlistEntries.id));

    const summary = toSummary(row, attempts[0]?.occurredAt ?? null, attempts[0]?.nextActionAt ?? null);

    return {
      ...summary,
      objective: row.objective,
      preferredStartDate: row.preferredStartDate ? row.preferredStartDate.toISOString() : null,
      message: row.message,
      duplicateOfRequestId: row.duplicateOfRequestId,
      contactAttempts: attempts.map(toContactAttemptDto),
      qualificationAvailableVariants: variants,
      qualificationReviews: reviews.map(toQualificationReviewDto),
      waitlistEntries: waitlistRows.map(toWaitlistEntryDto),
    };
  }

  async createContactAttempt(
    requestId: string,
    input: NormalizedContactAttemptInput,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<{ contactAttempt: AdminContactAttempt; request: AdminServiceRequestSummary } | "not_found"> {
    return this.database.transaction(async (tx) => {
      const [requestRow] = await tx
        .select({ id: serviceRequests.id, prospectId: serviceRequests.prospectId })
        .from(serviceRequests)
        .where(eq(serviceRequests.id, requestId))
        .for("update")
        .limit(1);

      if (!requestRow) return "not_found" as const;

      const [inserted] = await tx
        .insert(contactAttempts)
        .values({
          prospectId: requestRow.prospectId,
          requestId: requestRow.id,
          channel: input.channel,
          direction: input.direction,
          outcome: input.outcome,
          note: input.note,
          occurredAt: input.occurredAt,
          nextActionAt: input.nextActionAt,
          createdByUserId: actor.userId,
        })
        .returning({
          id: contactAttempts.id,
          channel: contactAttempts.channel,
          direction: contactAttempts.direction,
          outcome: contactAttempts.outcome,
          note: contactAttempts.note,
          occurredAt: contactAttempts.occurredAt,
          nextActionAt: contactAttempts.nextActionAt,
          createdByUserId: contactAttempts.createdByUserId,
        });

      if (!inserted) throw new Error("Contact attempt insert returned no row");

      // Audit insert MUST use `tx`, not the shared AuditService (which holds the
      // top-level pooled db handle) — this is what makes the write and its audit
      // event atomic per S3.3's architecture condition.
      await tx.insert(auditEvents).values({
        actorUserId: actor.userId,
        actorType: "user",
        eventType: "request.contact_attempt_logged",
        entityType: "service_request",
        entityId: requestRow.id,
        result: "success",
        ipHash: hashAuditContext(auditContext.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(auditContext.userAgent, this.options.auditHashPepper),
        metadataJson: { channel: input.channel, direction: input.direction, outcome: input.outcome },
      });

      const [detailRow] = await this.baseQueryTx(tx).where(eq(serviceRequests.id, requestId)).limit(1);
      if (!detailRow) throw new Error("Service request disappeared inside its own transaction");

      // Re-query the true latest attempt rather than assuming the one just inserted
      // is it — a backdated occurredAt on this insert must not shadow a later attempt.
      const [latestAttempt] = await tx
        .select({ occurredAt: contactAttempts.occurredAt, nextActionAt: contactAttempts.nextActionAt })
        .from(contactAttempts)
        .where(eq(contactAttempts.requestId, requestId))
        .orderBy(desc(contactAttempts.occurredAt))
        .limit(1);

      return {
        contactAttempt: toContactAttemptDto(inserted),
        request: toSummary(detailRow, latestAttempt?.occurredAt ?? null, latestAttempt?.nextActionAt ?? null),
      };
    });
  }

  async transitionStatus(
    requestId: string,
    toStatus: ServiceRequestStatus,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<{ request: AdminServiceRequestSummary } | "not_found" | "invalid_transition"> {
    return this.database.transaction(async (tx) => {
      const [requestRow] = await tx
        .select({ id: serviceRequests.id, status: serviceRequests.status })
        .from(serviceRequests)
        .where(eq(serviceRequests.id, requestId))
        .for("update")
        .limit(1);

      if (!requestRow) return "not_found" as const;

      const allowedTargets = adminRequestAllowedTransitions[requestRow.status] ?? [];
      if (!allowedTargets.includes(toStatus)) return "invalid_transition" as const;

      const fromStatus = requestRow.status;

      await tx
        .update(serviceRequests)
        .set({ status: toStatus, updatedAt: now })
        .where(eq(serviceRequests.id, requestId));

      // Same atomicity requirement as createContactAttempt above: write directly
      // against `tx`, never through the shared AuditService instance.
      await tx.insert(auditEvents).values({
        actorUserId: actor.userId,
        actorType: "user",
        eventType: "request.status_changed",
        entityType: "service_request",
        entityId: requestRow.id,
        result: "success",
        ipHash: hashAuditContext(auditContext.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(auditContext.userAgent, this.options.auditHashPepper),
        metadataJson: { fromStatus, toStatus },
      });

      const [detailRow] = await this.baseQueryTx(tx).where(eq(serviceRequests.id, requestId)).limit(1);
      if (!detailRow) throw new Error("Service request disappeared inside its own transaction");

      const lastAttempts = await tx
        .select({ occurredAt: contactAttempts.occurredAt, nextActionAt: contactAttempts.nextActionAt })
        .from(contactAttempts)
        .where(eq(contactAttempts.requestId, requestId))
        .orderBy(desc(contactAttempts.occurredAt))
        .limit(1);

      return { request: toSummary(detailRow, lastAttempts[0]?.occurredAt ?? null, lastAttempts[0]?.nextActionAt ?? null) };
    });
  }

  async recordQualificationReview(
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
  > {
    return this.database.transaction(async (tx) => {
      const [requestRow] = await tx
        .select({ id: serviceRequests.id, status: serviceRequests.status, serviceId: serviceRequests.serviceId })
        .from(serviceRequests)
        .where(eq(serviceRequests.id, requestId))
        .for("update")
        .limit(1);

      if (!requestRow) return "not_found" as const;
      if (requestRow.status !== "qualification_in_progress") return "invalid_transition" as const;

      if (input.finalVariantId) {
        const [ownedVariant] = await tx
          .select({ id: serviceVariants.id })
          .from(serviceVariants)
          .where(and(eq(serviceVariants.id, input.finalVariantId), eq(serviceVariants.serviceId, requestRow.serviceId)))
          .limit(1);
        if (!ownedVariant) return "variant_invalid" as const;
      }

      const existingReviews = await tx
        .select({ version: qualificationReviews.version, supersededAt: qualificationReviews.supersededAt })
        .from(qualificationReviews)
        .where(eq(qualificationReviews.requestId, requestId))
        .orderBy(desc(qualificationReviews.version));

      if (existingReviews.some((review) => review.supersededAt === null)) return "invalid_transition" as const;

      const version = (existingReviews[0]?.version ?? 0) + 1;
      const toStatus = input.outcome;

      const [inserted] = await tx
        .insert(qualificationReviews)
        .values({
          requestId,
          version,
          outcome: input.outcome,
          finalVariantId: input.finalVariantId,
          agreedPriceXaf: input.agreedPriceXaf,
          targetStartDate: input.targetStartDate,
          suitabilityNote: input.suitabilityNote,
          conditionsJson: input.conditions,
          blockersJson: input.blockers,
          createdByUserId: actor.userId,
          createdAt: now,
          supersededAt: null,
        })
        .returning({
          id: qualificationReviews.id,
          version: qualificationReviews.version,
          outcome: qualificationReviews.outcome,
          finalVariantId: qualificationReviews.finalVariantId,
          agreedPriceXaf: qualificationReviews.agreedPriceXaf,
          targetStartDate: qualificationReviews.targetStartDate,
          suitabilityNote: qualificationReviews.suitabilityNote,
          conditionsJson: qualificationReviews.conditionsJson,
          blockersJson: qualificationReviews.blockersJson,
          createdByUserId: qualificationReviews.createdByUserId,
          createdAt: qualificationReviews.createdAt,
          supersededAt: qualificationReviews.supersededAt,
        });

      if (!inserted) throw new Error("Qualification review insert returned no row");

      await tx
        .update(serviceRequests)
        .set({ status: toStatus, updatedAt: now })
        .where(eq(serviceRequests.id, requestId));

      await tx.insert(auditEvents).values({
        actorUserId: actor.userId,
        actorType: "user",
        eventType: "request.qualification_review_recorded",
        entityType: "service_request",
        entityId: requestId,
        result: "success",
        ipHash: hashAuditContext(auditContext.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(auditContext.userAgent, this.options.auditHashPepper),
        metadataJson: { version, outcome: input.outcome, fromStatus: "qualification_in_progress", toStatus },
      });

      const [detailRow] = await this.baseQueryTx(tx).where(eq(serviceRequests.id, requestId)).limit(1);
      if (!detailRow) throw new Error("Service request disappeared inside its own transaction");

      const [latestAttempt] = await tx
        .select({ occurredAt: contactAttempts.occurredAt, nextActionAt: contactAttempts.nextActionAt })
        .from(contactAttempts)
        .where(eq(contactAttempts.requestId, requestId))
        .orderBy(desc(contactAttempts.occurredAt))
        .limit(1);

      return {
        qualificationReview: toQualificationReviewDto(inserted),
        request: toSummary(detailRow, latestAttempt?.occurredAt ?? null, latestAttempt?.nextActionAt ?? null),
      };
    });
  }

  async createWaitlistEntry(
    requestId: string,
    input: NormalizedCreateWaitlistEntryInput,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<
    | { waitlistEntry: AdminWaitlistEntry; request: AdminServiceRequestSummary }
    | "not_found"
    | "invalid_transition"
    | "not_eligible"
    | "already_active"
    | "variant_invalid"
  > {
    return this.database.transaction(async (tx) => {
      const [requestRow] = await tx
        .select({
          id: serviceRequests.id,
          status: serviceRequests.status,
          serviceId: serviceRequests.serviceId,
          requestedVariantId: serviceRequests.requestedVariantId,
        })
        .from(serviceRequests)
        .where(eq(serviceRequests.id, requestId))
        .for("update")
        .limit(1);

      if (!requestRow) return "not_found" as const;
      if (!["submitted", "contacting", "qualification_in_progress"].includes(requestRow.status)) return "invalid_transition" as const;

      const [serviceRow] = await tx
        .select({
          id: services.id,
          availabilityStatus: services.availabilityStatus,
          waitlistEnabled: services.waitlistEnabled,
          archivedAt: services.archivedAt,
        })
        .from(services)
        .where(eq(services.id, requestRow.serviceId))
        .limit(1);

      if (!serviceRow) return "not_eligible" as const;
      const serviceCanWaitlist = serviceRow.availabilityStatus === "waitlist_only" || serviceRow.waitlistEnabled;
      if (serviceRow.archivedAt !== null || serviceRow.availabilityStatus === "archived" || !serviceCanWaitlist) return "not_eligible" as const;

      const activeRows = await tx
        .select({ id: waitlistEntries.id })
        .from(waitlistEntries)
        .where(and(eq(waitlistEntries.requestId, requestId), eq(waitlistEntries.status, "active"), isNull(waitlistEntries.leftAt)))
        .limit(1);
      if (activeRows.length > 0) return "already_active" as const;

      const variantId = input.variantId ?? requestRow.requestedVariantId;
      if (variantId) {
        const [ownedVariant] = await tx
          .select({ id: serviceVariants.id, availabilityStatus: serviceVariants.availabilityStatus })
          .from(serviceVariants)
          .where(and(eq(serviceVariants.id, variantId), eq(serviceVariants.serviceId, requestRow.serviceId), isNull(serviceVariants.archivedAt)))
          .limit(1);
        if (!ownedVariant || ownedVariant.availabilityStatus === "archived") return "variant_invalid" as const;
      }

      const fromStatus = requestRow.status;
      const [inserted] = await tx
        .insert(waitlistEntries)
        .values({
          requestId,
          serviceId: requestRow.serviceId,
          variantId,
          status: "active",
          priorityNote: input.priorityNote,
          enteredAt: now,
          leftAt: null,
        })
        .returning({
          id: waitlistEntries.id,
          requestId: waitlistEntries.requestId,
          serviceId: waitlistEntries.serviceId,
          variantId: waitlistEntries.variantId,
          status: waitlistEntries.status,
          priorityNote: waitlistEntries.priorityNote,
          enteredAt: waitlistEntries.enteredAt,
          leftAt: waitlistEntries.leftAt,
        });

      if (!inserted) throw new Error("Waitlist entry insert returned no row");

      await tx
        .update(serviceRequests)
        .set({ status: "waitlisted", updatedAt: now })
        .where(eq(serviceRequests.id, requestId));

      await tx.insert(auditEvents).values({
        actorUserId: actor.userId,
        actorType: "user",
        eventType: "request.waitlist_entered",
        entityType: "service_request",
        entityId: requestId,
        result: "success",
        ipHash: hashAuditContext(auditContext.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(auditContext.userAgent, this.options.auditHashPepper),
        metadataJson: { waitlistEntryId: inserted.id, fromStatus, toStatus: "waitlisted", serviceId: requestRow.serviceId, variantId },
      });

      const [detailRow] = await this.baseQueryTx(tx).where(eq(serviceRequests.id, requestId)).limit(1);
      if (!detailRow) throw new Error("Service request disappeared inside its own transaction");

      const [latestAttempt] = await tx
        .select({ occurredAt: contactAttempts.occurredAt, nextActionAt: contactAttempts.nextActionAt })
        .from(contactAttempts)
        .where(eq(contactAttempts.requestId, requestId))
        .orderBy(desc(contactAttempts.occurredAt))
        .limit(1);

      return {
        waitlistEntry: toWaitlistEntryDto(inserted),
        request: toSummary(detailRow, latestAttempt?.occurredAt ?? null, latestAttempt?.nextActionAt ?? null),
      };
    });
  }

  async withdrawWaitlistEntry(
    requestId: string,
    actor: AdminRequestActor,
    auditContext: AdminRequestAuditContext,
    now: Date,
  ): Promise<
    | { waitlistEntry: AdminWaitlistEntry; request: AdminServiceRequestSummary }
    | "not_found"
    | "invalid_transition"
    | "entry_not_found"
  > {
    return this.database.transaction(async (tx) => {
      const [requestRow] = await tx
        .select({ id: serviceRequests.id, status: serviceRequests.status })
        .from(serviceRequests)
        .where(eq(serviceRequests.id, requestId))
        .for("update")
        .limit(1);

      if (!requestRow) return "not_found" as const;
      if (requestRow.status !== "waitlisted") return "invalid_transition" as const;

      const [activeEntry] = await tx
        .select({
          id: waitlistEntries.id,
          requestId: waitlistEntries.requestId,
          serviceId: waitlistEntries.serviceId,
          variantId: waitlistEntries.variantId,
          status: waitlistEntries.status,
          priorityNote: waitlistEntries.priorityNote,
          enteredAt: waitlistEntries.enteredAt,
          leftAt: waitlistEntries.leftAt,
        })
        .from(waitlistEntries)
        .where(and(eq(waitlistEntries.requestId, requestId), eq(waitlistEntries.status, "active"), isNull(waitlistEntries.leftAt)))
        .orderBy(asc(waitlistEntries.enteredAt), asc(waitlistEntries.id))
        .limit(1);

      if (!activeEntry) return "entry_not_found" as const;

      const [updatedEntry] = await tx
        .update(waitlistEntries)
        .set({ status: "withdrawn", leftAt: now })
        .where(eq(waitlistEntries.id, activeEntry.id))
        .returning({
          id: waitlistEntries.id,
          requestId: waitlistEntries.requestId,
          serviceId: waitlistEntries.serviceId,
          variantId: waitlistEntries.variantId,
          status: waitlistEntries.status,
          priorityNote: waitlistEntries.priorityNote,
          enteredAt: waitlistEntries.enteredAt,
          leftAt: waitlistEntries.leftAt,
        });

      if (!updatedEntry) throw new Error("Waitlist entry update returned no row");

      await tx
        .update(serviceRequests)
        .set({ status: "abandoned", updatedAt: now })
        .where(eq(serviceRequests.id, requestId));

      await tx.insert(auditEvents).values({
        actorUserId: actor.userId,
        actorType: "user",
        eventType: "request.waitlist_withdrawn",
        entityType: "service_request",
        entityId: requestId,
        result: "success",
        ipHash: hashAuditContext(auditContext.ipAddress, this.options.auditHashPepper),
        userAgentHash: hashAuditContext(auditContext.userAgent, this.options.auditHashPepper),
        metadataJson: { waitlistEntryId: activeEntry.id, fromStatus: "waitlisted", toStatus: "abandoned" },
      });

      const [detailRow] = await this.baseQueryTx(tx).where(eq(serviceRequests.id, requestId)).limit(1);
      if (!detailRow) throw new Error("Service request disappeared inside its own transaction");

      const [latestAttempt] = await tx
        .select({ occurredAt: contactAttempts.occurredAt, nextActionAt: contactAttempts.nextActionAt })
        .from(contactAttempts)
        .where(eq(contactAttempts.requestId, requestId))
        .orderBy(desc(contactAttempts.occurredAt))
        .limit(1);

      return {
        waitlistEntry: toWaitlistEntryDto(updatedEntry),
        request: toSummary(detailRow, latestAttempt?.occurredAt ?? null, latestAttempt?.nextActionAt ?? null),
      };
    });
  }

  private async variantsForService(serviceId: string): Promise<AdminServiceRequestVariant[]> {
    const rows = await this.database
      .select({ id: serviceVariants.id, name: serviceVariants.name })
      .from(serviceVariants)
      .where(eq(serviceVariants.serviceId, serviceId))
      .orderBy(serviceVariants.sortOrder, serviceVariants.name);

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  private baseQueryTx(tx: Parameters<AdminRequestsDb["transaction"]>[0] extends (tx: infer T) => unknown ? T : never) {
    return tx
      .select(baseSelect)
      .from(serviceRequests)
      .innerJoin(prospects, eq(serviceRequests.prospectId, prospects.id))
      .innerJoin(services, eq(serviceRequests.serviceId, services.id))
      .leftJoin(serviceVariants, eq(serviceRequests.requestedVariantId, serviceVariants.id));
  }
}

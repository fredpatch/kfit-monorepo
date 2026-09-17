import assert from "node:assert/strict";
import test from "node:test";
import type { AdminServiceRequestDetail, AdminServiceRequestSummary } from "@kfit/shared";
import {
  AdminRequestsService,
  type AdminRequestsRepository,
  type NormalizedContactAttemptInput,
  type NormalizedQualificationReviewInput,
} from "../services/admin-requests.service.js";

const requestId = "11111111-1111-1111-1111-111111111111";
const noAuditContext = { ipAddress: null, userAgent: null };

function summary(overrides: Partial<AdminServiceRequestSummary> = {}): AdminServiceRequestSummary {
  return {
    id: requestId,
    reference: "REQ-1",
    status: "submitted",
    submittedAt: "2026-09-17T08:00:00.000Z",
    prospect: { id: "prospect-1", fullName: "Awa Nguema", whatsapp: "+24106123456", email: null },
    service: { id: "service-1", name: "Coaching" },
    requestedVariant: null,
    lastContactAttemptAt: null,
    nextActionAt: null,
    ...overrides,
  };
}

class FakeAdminRequestsRepository implements AdminRequestsRepository {
  detail: AdminServiceRequestDetail | null = {
    ...summary(),
    objective: null,
    preferredStartDate: null,
    message: null,
    duplicateOfRequestId: null,
    contactAttempts: [],
    qualificationAvailableVariants: [],
    qualificationReviews: [],
  };
  transitionOutcome: "not_found" | "invalid_transition" | "ok" = "ok";
  reviewOutcome: "not_found" | "invalid_transition" | "variant_invalid" | "ok" = "ok";
  loggedAttempts: Array<{ requestId: string; input: NormalizedContactAttemptInput }> = [];
  transitions: Array<{ requestId: string; toStatus: string }> = [];
  reviews: Array<{ requestId: string; input: NormalizedQualificationReviewInput }> = [];

  async listQueue() {
    return [summary()];
  }

  async getDetail(id: string) {
    if (id !== requestId) return null;
    return this.detail;
  }

  async createContactAttempt(id: string, input: NormalizedContactAttemptInput) {
    if (id !== requestId) return "not_found" as const;
    this.loggedAttempts.push({ requestId: id, input });
    return {
      contactAttempt: {
        id: "attempt-1",
        channel: input.channel,
        direction: input.direction,
        outcome: input.outcome,
        note: input.note,
        occurredAt: input.occurredAt.toISOString(),
        nextActionAt: input.nextActionAt ? input.nextActionAt.toISOString() : null,
        createdByUserId: "user-1",
      },
      request: summary(),
    };
  }

  async transitionStatus(id: string, toStatus: string) {
    this.transitions.push({ requestId: id, toStatus });
    if (this.transitionOutcome === "not_found") return "not_found" as const;
    if (this.transitionOutcome === "invalid_transition") return "invalid_transition" as const;
    return { request: summary({ status: toStatus as AdminServiceRequestSummary["status"] }) };
  }

  async recordQualificationReview(id: string, input: NormalizedQualificationReviewInput) {
    this.reviews.push({ requestId: id, input });
    if (this.reviewOutcome === "not_found") return "not_found" as const;
    if (this.reviewOutcome === "invalid_transition") return "invalid_transition" as const;
    if (this.reviewOutcome === "variant_invalid") return "variant_invalid" as const;
    return {
      qualificationReview: {
        id: "review-1",
        version: 1,
        outcome: input.outcome,
        finalVariantId: input.finalVariantId,
        agreedPriceXaf: input.agreedPriceXaf,
        targetStartDate: input.targetStartDate ? input.targetStartDate.toISOString() : null,
        suitabilityNote: input.suitabilityNote,
        conditions: input.conditions,
        blockers: input.blockers,
        createdByUserId: "user-1",
        createdAt: "2026-09-17T10:00:00.000Z",
        supersededAt: null,
      },
      request: summary({ status: input.outcome }),
    };
  }
}

test("AdminRequestsService.getDetail rejects a non-UUID id without calling the repository", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.getDetail("not-a-uuid");
  assert.deepEqual(result, { status: "invalid" });
});

test("AdminRequestsService.getDetail returns not_found when the repository has no matching row", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.getDetail("22222222-2222-2222-2222-222222222222");
  assert.deepEqual(result, { status: "not_found" });
});

test("AdminRequestsService.logContactAttempt rejects an unknown channel", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.logContactAttempt(requestId, { channel: "carrier_pigeon", direction: "outbound", outcome: "reached" }, { userId: "user-1" }, noAuditContext, new Date());
  assert.deepEqual(result, { status: "invalid", reason: "channel_invalid" });
  assert.equal(repository.loggedAttempts.length, 0);
});

test("AdminRequestsService.logContactAttempt rejects an unknown outcome", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.logContactAttempt(requestId, { channel: "phone_call", direction: "outbound", outcome: "will_call_back" }, { userId: "user-1" }, noAuditContext, new Date());
  assert.deepEqual(result, { status: "invalid", reason: "outcome_invalid" });
});

test("AdminRequestsService.logContactAttempt normalizes and forwards a valid attempt", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);
  const now = new Date("2026-09-17T09:00:00.000Z");

  const result = await service.logContactAttempt(
    requestId,
    { channel: "phone_call", direction: "outbound", outcome: "callback_requested", note: "  Rappeler demain  " },
    { userId: "user-1" },
    noAuditContext,
    now,
  );

  assert.equal(result.status, "ok");
  assert.equal(repository.loggedAttempts.length, 1);
  assert.equal(repository.loggedAttempts[0]?.input.note, "Rappeler demain");
  assert.equal(repository.loggedAttempts[0]?.input.occurredAt.getTime(), now.getTime());
});

test("AdminRequestsService.logContactAttempt returns not_found for an unknown request id", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.logContactAttempt(
    "22222222-2222-2222-2222-222222222222",
    { channel: "phone_call", direction: "outbound", outcome: "reached" },
    { userId: "user-1" },
    noAuditContext,
    new Date(),
  );

  assert.deepEqual(result, { status: "not_found" });
});

test("AdminRequestsService.transitionStatus rejects a target status outside the S3.3 allow-list", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  for (const forbidden of ["qualified", "qualified_with_conditions", "rejected", "waitlisted", "converted", "closed_duplicate"]) {
    const result = await service.transitionStatus(requestId, forbidden, { userId: "user-1" }, noAuditContext, new Date());
    assert.deepEqual(result, { status: "invalid", reason: "to_status_invalid" }, `expected ${forbidden} to be rejected`);
  }
  assert.equal(repository.transitions.length, 0);
});

test("AdminRequestsService.transitionStatus rejects a non-string target", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.transitionStatus(requestId, 42, { userId: "user-1" }, noAuditContext, new Date());
  assert.deepEqual(result, { status: "invalid", reason: "to_status_invalid" });
});

test("AdminRequestsService.transitionStatus forwards an allow-listed target to the repository", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.transitionStatus(requestId, "contacting", { userId: "user-1" }, noAuditContext, new Date());
  assert.equal(result.status, "ok");
  assert.deepEqual(repository.transitions, [{ requestId, toStatus: "contacting" }]);
});

test("AdminRequestsService.transitionStatus surfaces invalid_transition from the repository's row-locked check", async () => {
  const repository = new FakeAdminRequestsRepository();
  repository.transitionOutcome = "invalid_transition";
  const service = new AdminRequestsService(repository);

  const result = await service.transitionStatus(requestId, "abandoned", { userId: "user-1" }, noAuditContext, new Date());
  assert.deepEqual(result, { status: "invalid_transition" });
});

test("AdminRequestsService.transitionStatus surfaces not_found from the repository", async () => {
  const repository = new FakeAdminRequestsRepository();
  repository.transitionOutcome = "not_found";
  const service = new AdminRequestsService(repository);

  const result = await service.transitionStatus(requestId, "contacting", { userId: "user-1" }, noAuditContext, new Date());
  assert.deepEqual(result, { status: "not_found" });
});

test("AdminRequestsService.recordQualificationReview normalizes and forwards a qualified review", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);
  const variantId = "33333333-3333-3333-3333-333333333333";

  const result = await service.recordQualificationReview(
    requestId,
    { outcome: "qualified", finalVariantId: variantId, agreedPriceXaf: 50000, suitabilityNote: "  OK  " },
    { userId: "user-1" },
    noAuditContext,
    new Date(),
  );

  assert.equal(result.status, "ok");
  assert.equal(repository.reviews.length, 1);
  assert.equal(repository.reviews[0]?.input.finalVariantId, variantId);
  assert.equal(repository.reviews[0]?.input.suitabilityNote, "OK");
});

test("AdminRequestsService.recordQualificationReview rejects waitlisted as an invalid S3.4 outcome", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.recordQualificationReview(requestId, { outcome: "waitlisted" }, { userId: "user-1" }, noAuditContext, new Date());
  assert.deepEqual(result, { status: "invalid", reason: "outcome_invalid" });
  assert.equal(repository.reviews.length, 0);
});

test("AdminRequestsService.recordQualificationReview requires conditions for qualified_with_conditions", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.recordQualificationReview(
    requestId,
    {
      outcome: "qualified_with_conditions",
      finalVariantId: "33333333-3333-3333-3333-333333333333",
      agreedPriceXaf: 50000,
      conditions: [],
    },
    { userId: "user-1" },
    noAuditContext,
    new Date(),
  );

  assert.deepEqual(result, { status: "invalid", reason: "conditions_required" });
  assert.equal(repository.reviews.length, 0);
});

test("AdminRequestsService.recordQualificationReview forbids commercial fields for rejected", async () => {
  const repository = new FakeAdminRequestsRepository();
  const service = new AdminRequestsService(repository);

  const result = await service.recordQualificationReview(
    requestId,
    { outcome: "rejected", finalVariantId: "33333333-3333-3333-3333-333333333333" },
    { userId: "user-1" },
    noAuditContext,
    new Date(),
  );

  assert.deepEqual(result, { status: "invalid", reason: "final_variant_forbidden" });
  assert.equal(repository.reviews.length, 0);
});

test("AdminRequestsService.recordQualificationReview surfaces invalid_transition from the row-locked repository check", async () => {
  const repository = new FakeAdminRequestsRepository();
  repository.reviewOutcome = "invalid_transition";
  const service = new AdminRequestsService(repository);

  const result = await service.recordQualificationReview(requestId, { outcome: "rejected" }, { userId: "user-1" }, noAuditContext, new Date());
  assert.deepEqual(result, { status: "invalid_transition" });
});

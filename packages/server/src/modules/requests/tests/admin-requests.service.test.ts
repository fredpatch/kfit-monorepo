import assert from "node:assert/strict";
import test from "node:test";
import type { AdminServiceRequestDetail, AdminServiceRequestSummary } from "@kfit/shared";
import {
  AdminRequestsService,
  type AdminRequestsRepository,
  type NormalizedContactAttemptInput,
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
  detail: AdminServiceRequestDetail | null = { ...summary(), objective: null, preferredStartDate: null, message: null, duplicateOfRequestId: null, contactAttempts: [] };
  transitionOutcome: "not_found" | "invalid_transition" | "ok" = "ok";
  loggedAttempts: Array<{ requestId: string; input: NormalizedContactAttemptInput }> = [];
  transitions: Array<{ requestId: string; toStatus: string }> = [];

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

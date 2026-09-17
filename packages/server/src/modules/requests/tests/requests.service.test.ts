import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestsService,
  type CreateServiceRequestInput,
  type CreateServiceRequestResult,
  type RequestsRepository,
  type ServiceAvailabilityRecord,
} from "../services/requests.service.js";
import type { AuditService, RecordAuditEventInput } from "../../auth/services/audit.service.js";

const openService: ServiceAvailabilityRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  availabilityStatus: "open",
  archivedAt: null,
  isPublic: true,
  publishedAt: new Date("2026-08-25T08:00:00Z"),
};

const otherServiceId = "99999999-9999-9999-9999-999999999999";
const ownVariantId = "22222222-2222-2222-2222-222222222222";
const foreignVariantId = "33333333-3333-3333-3333-333333333333";

class FakeRequestsRepository implements RequestsRepository {
  service: ServiceAvailabilityRecord | null = openService;
  created: CreateServiceRequestInput[] = [];
  variantOwners = new Map<string, string>([
    [ownVariantId, openService.id],
    [foreignVariantId, otherServiceId],
  ]);
  private byToken = new Map<string, CreateServiceRequestResult>();

  async findServiceAvailability(serviceId: string) {
    if (!this.service || this.service.id !== serviceId) return null;
    return this.service;
  }

  async findVariantOwnerServiceId(variantId: string) {
    return this.variantOwners.get(variantId) ?? null;
  }

  async createServiceRequest(input: CreateServiceRequestInput): Promise<CreateServiceRequestResult> {
    const existing = this.byToken.get(input.submissionToken);
    if (existing) return { outcome: "replayed", request: existing.request };

    this.created.push(input);
    const result: CreateServiceRequestResult = {
      outcome: "created",
      request: { id: `request-${this.created.length}`, reference: `REQ-${this.created.length}`, submittedAt: new Date("2026-09-17T08:00:00Z") },
    };
    this.byToken.set(input.submissionToken, result);
    return result;
  }
}

class FakeAudit implements Pick<AuditService, "record"> {
  events: RecordAuditEventInput[] = [];

  async record(input: RecordAuditEventInput) {
    this.events.push(input);
    return { id: "audit-event" } as never;
  }
}

function validInput() {
  return {
    fullName: "Awa Nguema",
    whatsapp: "+241 06 12 34 56",
    email: "awa@example.com",
    serviceId: openService.id,
    submissionToken: "token-1",
    formRenderedAt: "2026-09-17T07:59:00.000Z",
  };
}

function context(overrides: Partial<{ now: Date }> = {}) {
  return {
    requestId: "req-1",
    ipAddress: "203.0.113.5",
    userAgent: "test-agent",
    now: overrides.now ?? new Date("2026-09-17T08:00:00.000Z"),
  };
}

test("RequestsService creates a request for an open service and audits success", async () => {
  const repository = new FakeRequestsRepository();
  const audit = new FakeAudit();
  const service = new RequestsService(repository, audit);

  const result = await service.submit(validInput(), context());

  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.response.request.reference, "REQ-1");
  assert.equal(repository.created[0]?.whatsapp, "+24106123456");
  assert.equal(audit.events.at(-1)?.eventType, "request.submitted");
  assert.equal(audit.events.at(-1)?.result, "success");
});

test("RequestsService rejects invalid input without touching the repository", async () => {
  const repository = new FakeRequestsRepository();
  const service = new RequestsService(repository, new FakeAudit());

  const result = await service.submit({ ...validInput(), fullName: "" }, context());

  assert.deepEqual(result, { status: "invalid", reason: "full_name_invalid" });
  assert.equal(repository.created.length, 0);
});

test("RequestsService rejects archived services and audits a blocked event", async () => {
  const repository = new FakeRequestsRepository();
  repository.service = { ...openService, availabilityStatus: "archived" };
  const audit = new FakeAudit();
  const service = new RequestsService(repository, audit);

  const result = await service.submit(validInput(), context());

  assert.deepEqual(result, { status: "service_archived" });
  assert.equal(audit.events.at(-1)?.result, "blocked");
});

test("RequestsService rejects temporarily closed services", async () => {
  const repository = new FakeRequestsRepository();
  repository.service = { ...openService, availabilityStatus: "temporarily_closed" };
  const service = new RequestsService(repository, new FakeAudit());

  const result = await service.submit(validInput(), context());

  assert.deepEqual(result, { status: "service_unavailable" });
});

test("RequestsService rejects waitlist_only services without creating a waitlist entry", async () => {
  const repository = new FakeRequestsRepository();
  repository.service = { ...openService, availabilityStatus: "waitlist_only" };
  const service = new RequestsService(repository, new FakeAudit());

  const result = await service.submit(validInput(), context());

  assert.deepEqual(result, { status: "waitlist_required" });
  assert.equal(repository.created.length, 0);
});

test("RequestsService rejects a service that is not publicly listed and creates nothing", async () => {
  const repository = new FakeRequestsRepository();
  repository.service = { ...openService, isPublic: false };
  const audit = new FakeAudit();
  const service = new RequestsService(repository, audit);

  const result = await service.submit(validInput(), context());

  assert.deepEqual(result, { status: "service_not_public" });
  assert.equal(repository.created.length, 0);
  assert.equal(audit.events.at(-1)?.result, "blocked");
});

test("RequestsService rejects a service that has not been published yet", async () => {
  const repository = new FakeRequestsRepository();
  repository.service = { ...openService, publishedAt: null };
  const service = new RequestsService(repository, new FakeAudit());

  const result = await service.submit(validInput(), context());

  assert.deepEqual(result, { status: "service_not_public" });
  assert.equal(repository.created.length, 0);
});

test("RequestsService accepts a requested variant that belongs to the selected service", async () => {
  const repository = new FakeRequestsRepository();
  const service = new RequestsService(repository, new FakeAudit());

  const result = await service.submit({ ...validInput(), requestedVariantId: ownVariantId }, context());

  assert.equal(result.status, "ok");
  assert.equal(repository.created[0]?.requestedVariantId, ownVariantId);
});

test("RequestsService rejects a nonexistent requested variant without creating anything", async () => {
  const repository = new FakeRequestsRepository();
  const audit = new FakeAudit();
  const service = new RequestsService(repository, audit);

  const result = await service.submit({ ...validInput(), requestedVariantId: "44444444-4444-4444-4444-444444444444" }, context());

  assert.deepEqual(result, { status: "variant_invalid" });
  assert.equal(repository.created.length, 0);
  assert.equal(audit.events.at(-1)?.result, "blocked");
});

test("RequestsService rejects a requested variant that belongs to another service with the same generic error", async () => {
  const repository = new FakeRequestsRepository();
  const service = new RequestsService(repository, new FakeAudit());

  const result = await service.submit({ ...validInput(), requestedVariantId: foreignVariantId }, context());

  assert.deepEqual(result, { status: "variant_invalid" });
  assert.equal(repository.created.length, 0);
});

test("RequestsService returns not_found for an unknown service", async () => {
  const repository = new FakeRequestsRepository();
  repository.service = null;
  const service = new RequestsService(repository, new FakeAudit());

  const result = await service.submit(validInput(), context());

  assert.deepEqual(result, { status: "service_not_found" });
});

test("RequestsService blocks honeypot submissions with a neutral reason and no repository call", async () => {
  const repository = new FakeRequestsRepository();
  const audit = new FakeAudit();
  const service = new RequestsService(repository, audit);

  const result = await service.submit({ ...validInput(), website: "http://spam.example" }, context());

  assert.deepEqual(result, { status: "invalid", reason: "submission_invalid" });
  assert.equal(repository.created.length, 0);
  assert.equal(audit.events.at(-1)?.eventType, "request.submission_blocked");
  assert.equal((audit.events.at(-1)?.metadata as { signal?: string } | null)?.signal, "honeypot");
});

test("RequestsService blocks submissions completed faster than the minimum fill time", async () => {
  const repository = new FakeRequestsRepository();
  const service = new RequestsService(repository, new FakeAudit());

  const result = await service.submit(
    { ...validInput(), formRenderedAt: "2026-09-17T07:59:59.900Z" },
    context({ now: new Date("2026-09-17T08:00:00.000Z") }),
  );

  assert.deepEqual(result, { status: "invalid", reason: "submission_invalid" });
  assert.equal(repository.created.length, 0);
});

test("RequestsService is idempotent for a retried submission token", async () => {
  const repository = new FakeRequestsRepository();
  const service = new RequestsService(repository, new FakeAudit());

  const first = await service.submit(validInput(), context());
  const second = await service.submit(validInput(), context());

  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  if (first.status !== "ok" || second.status !== "ok") return;
  assert.equal(first.response.request.id, second.response.request.id);
  assert.equal(repository.created.length, 1);
});

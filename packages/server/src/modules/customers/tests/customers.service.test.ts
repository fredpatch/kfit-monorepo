import assert from "node:assert/strict";
import test from "node:test";
import {
  CustomersService,
  type CustomersRepository,
  type NormalizedCustomerInput,
} from "../services/customers.service.js";

const actor = {
  userId: "11111111-1111-1111-1111-111111111111",
  requestId: "customer-test",
  ipAddress: null,
  userAgent: null,
};
function repository(
  overrides: Partial<CustomersRepository> = {},
): CustomersRepository {
  return {
    async listActive() {
      return [];
    },
    async searchActive() {
      return [];
    },
    async createManual() {
      return { status: "duplicate" };
    },
    async getDetail() {
      return null;
    },
    async listArchived() {
      return [];
    },
    async getAnalyticsSource() {
      return null;
    },
    async getOverviewSource() {
      return {
        customers: [],
        subscriptions: [],
        completedAppointments: [],
        followUps: [],
        upcomingAppointments: [],
      };
    },
    ...overrides,
  };
}

test("customer manual creation trims input, normalizes WhatsApp, defaults channel and ignores caller-owned linkage", async () => {
  let saved: NormalizedCustomerInput | undefined;
  const service = new CustomersService(
    repository({
      async createManual(input, context) {
        saved = input;
        assert.equal(context, actor);
        return { status: "duplicate" };
      },
    }),
  );
  await service.createManual(
    {
      fullName: "  Synthetic Customer  ",
      whatsapp: "+241 00 00 00 00",
      prospectId: actor.userId,
      email: " ",
      city: " Libreville ",
    },
    actor,
  );
  assert.deepEqual(saved, {
    fullName: "Synthetic Customer",
    whatsapp: "+24100000000",
    email: null,
    city: "Libreville",
    country: null,
    preferredContactChannel: "whatsapp",
  });
});

test("customer lookup normalizes before querying and preserves an empty result", async () => {
  const service = new CustomersService(
    repository({
      async searchActive(phone) {
        assert.equal(phone, "+24100000000");
        return [];
      },
    }),
  );
  assert.deepEqual(await service.search("+241 00 00 00 00"), {
    status: "ok",
    customers: [],
  });
});

test("invalid search inputs never reach persistence", async () => {
  const service = new CustomersService(
    repository({
      async searchActive() {
        assert.fail("invalid input reached repository");
      },
    }),
  );
  for (const value of [undefined, null, [], {}, "", "123", "1".repeat(31)])
    assert.equal((await service.search(value)).status, "invalid");
});

test("invalid manual customer fields and non-object bodies never reach persistence", async () => {
  const service = new CustomersService(
    repository({
      async createManual() {
        assert.fail("invalid input reached repository");
      },
    }),
  );
  const valid = { fullName: "Synthetic Customer", whatsapp: "+24100000000" };
  for (const input of [
    null,
    [],
    "text",
    {},
    { ...valid, fullName: " " },
    { ...valid, fullName: "x".repeat(201) },
    { ...valid, whatsapp: 123456789 },
    { ...valid, email: "invalid" },
    { ...valid, email: {} },
    { ...valid, city: 42 },
    { ...valid, country: "x".repeat(201) },
    { ...valid, preferredContactChannel: null },
  ]) {
    assert.equal((await service.createManual(input, actor)).status, "invalid");
  }
});

test("customer service returns duplicate conflicts and propagates persistence failure", async () => {
  const input = { fullName: "Synthetic Customer", whatsapp: "+24100000000" };
  assert.deepEqual(
    await new CustomersService(repository()).createManual(input, actor),
    { status: "duplicate" },
  );
  const service = new CustomersService(
    repository({
      async createManual() {
        throw new Error("audit failed");
      },
    }),
  );
  await assert.rejects(service.createManual(input, actor), /audit failed/);
});

test("customer detail validates the id before persistence and maps a missing customer to not_found", async () => {
  const guarded = new CustomersService(
    repository({
      async getDetail() {
        assert.fail("invalid id reached repository");
      },
    }),
  );
  for (const value of [
    undefined,
    null,
    42,
    "",
    "not-a-uuid",
    "33333333-3333-3333-3333-33333333333",
  ])
    assert.equal((await guarded.getDetail(value)).status, "invalid");
  const id = "33333333-3333-3333-3333-333333333333";
  const service = new CustomersService(
    repository({
      async getDetail(customerId) {
        assert.equal(customerId, id);
        return null;
      },
    }),
  );
  assert.deepEqual(await service.getDetail(id.toUpperCase()), {
    status: "not_found",
  });
});

test("customer analytics validates ids, period and subscription ownership before computing", async () => {
  const customerId = "33333333-3333-3333-3333-333333333333";
  const source = {
    customerId,
    subscriptions: [],
    appointments: [],
    followUps: [],
    links: [],
    rescheduleRequests: [],
  };
  const service = new CustomersService(
    repository({
      async getAnalyticsSource(id) {
        return id === customerId ? source : null;
      },
    }),
    () => new Date("2026-10-22T10:00:00Z"),
  );
  assert.deepEqual(await service.getAnalytics("nope", {}), {
    status: "invalid",
    reason: "customer_id_invalid",
  });
  assert.deepEqual(await service.getAnalytics(customerId, { periode: "7j" }), {
    status: "invalid",
    reason: "period_invalid",
  });
  assert.deepEqual(
    await service.getAnalytics(customerId, { periode: ["30j", "tout"] }),
    { status: "invalid", reason: "period_invalid" },
  );
  assert.deepEqual(
    await service.getAnalytics(customerId, { abonnement: "x" }),
    { status: "invalid", reason: "subscription_id_invalid" },
  );
  assert.deepEqual(
    await service.getAnalytics(customerId, {
      abonnement: "44444444-4444-4444-4444-444444444444",
    }),
    { status: "invalid", reason: "subscription_not_owned" },
  );
  assert.deepEqual(
    await service.getAnalytics("55555555-5555-5555-5555-555555555555", {}),
    { status: "not_found" },
  );
  const ok = await service.getAnalytics(customerId.toUpperCase(), {});
  assert.equal(ok.status, "ok");
  if (ok.status === "ok") {
    assert.equal(ok.analytics.period, "30j");
    assert.equal(ok.analytics.periodStart, "2026-09-22T10:00:00.000Z");
    assert.equal(ok.analytics.focusSubscriptionId, null);
    assert.deepEqual(ok.analytics.attendance, {
      honored: 0,
      missed: 0,
      rescheduled: 0,
      rate: null,
    });
    assert.equal(ok.analytics.weeklyAttendance.length, 6);
  }
});

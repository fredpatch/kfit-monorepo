import assert from "node:assert/strict";
import test from "node:test";
import {
  FinanceService,
  type FinanceCommand,
  type FinanceRepository,
} from "../services/finance.service.js";
import {
  allocateFifo,
  financialStatus,
  installmentStatus,
  sumXaf,
  validXaf,
  financeDate,
  FinanceInvariantError,
} from "../services/finance.policy.js";
const id = "11111111-1111-1111-1111-111111111111",
  actor = { userId: id, requestId: id, ipAddress: null, userAgent: null },
  now = new Date("2026-10-22T12:00:00Z");
const denied: FinanceRepository = {
    async execute() {
      assert.fail("invalid input reached persistence");
    },
  },
  service = new FinanceService(denied);
const payment = {
  amountXaf: 10000,
  paymentMethod: "cash",
  occurredAt: now.toISOString(),
  idempotencyKey: id,
};
for (const value of [0, -1, 1.5, NaN, Infinity, "1000", 2147483648])
  test(`integer XAF rejects ${String(value)}`, async () => {
    assert.equal(validXaf(value), false);
    assert.deepEqual(
      await service.execute(
        id,
        "record",
        { ...payment, amountXaf: value },
        actor,
      ),
      { ok: false, error: "FINANCE_INVALID_INPUT" },
    );
  });
test("XAF sums use exact integer arithmetic and storage bounds", () => {
  assert.equal(sumXaf([2147483647, -2147483647, 10000]), 10000);
  assert.throws(() => sumXaf([2147483647, 1]), FinanceInvariantError);
  assert.throws(() => sumXaf([-1]), FinanceInvariantError);
});
for (const field of [
  "customerId",
  "currency",
  "confirmedAt",
  "confirmedByUserId",
  "paidXaf",
  "remainingXaf",
  "allocations",
  "status",
  "subscriptionStatus",
])
  test(`payment rejects mass assignment ${field}`, async () => {
    assert.deepEqual(
      await service.execute(
        id,
        "record",
        { ...payment, [field]: "synthetic" },
        actor,
      ),
      { ok: false, error: "FINANCE_INVALID_INPUT" },
    );
  });
for (const method of [undefined, "card", "", 10])
  test(`closed method rejects ${String(method)}`, async () => {
    assert.deepEqual(
      await service.execute(
        id,
        "record",
        { ...payment, paymentMethod: method },
        actor,
      ),
      { ok: false, error: "FINANCE_INVALID_INPUT" },
    );
  });
for (const method of ["cash", "bank_transfer", "mobile_money"])
  test(`accepted method ${method} normalizes reference`, async () => {
    const capture = new FinanceService({
      async execute(_id, command) {
        assert.ok(command.action === "record");
        assert.equal(command.paymentMethod, method);
        assert.equal(command.externalReference, "ABC-123");
        return { ok: false, error: "FINANCE_INVALID_STATE" };
      },
    });
    await capture.execute(
      id,
      "record",
      {
        ...payment,
        paymentMethod: method,
        externalReference: "  ＡＢＣ-123  ",
      },
      actor,
    );
  });
for (const date of [
  "2026-02-30T12:00:00Z",
  "2026-10-22T24:00:00Z",
  "2026-10-22",
  "tomorrow",
  "2026-10-22T12:00:00",
])
  test(`strict financial date ${date}`, async () => {
    assert.equal(financeDate(date), null);
    assert.deepEqual(
      await service.execute(
        id,
        "record",
        { ...payment, occurredAt: date },
        actor,
      ),
      { ok: false, error: "FINANCE_INVALID_INPUT" },
    );
  });
test("unknown installment fields and incomplete/invalid schedules are rejected", async () => {
  for (const input of [
    {},
    { installments: [{ amountXaf: 0, dueDate: now.toISOString() }] },
    {
      installments: [
        { amountXaf: 100, dueDate: now.toISOString(), paidXaf: 100 },
      ],
    },
    {
      installments: [
        { amountXaf: 2147483647, dueDate: now.toISOString() },
        { amountXaf: 1, dueDate: now.toISOString() },
      ],
    },
  ]) {
    assert.deepEqual(await service.execute(id, "create", input, actor), {
      ok: false,
      error: "FINANCE_INVALID_INPUT",
    });
  }
});
test("correction accepts only explicit amount/date/identity and no allocation ownership", async () => {
  for (const input of [
    { amountXaf: 100, occurredAt: now.toISOString() },
    { ...payment, correctionOfEventId: id },
    { ...payment, amountXaf: -100 },
  ]) {
    assert.deepEqual(await service.execute(id, "correct", input, actor), {
      ok: false,
      error: "FINANCE_INVALID_INPUT",
    });
  }
});
test("command keys and references are validated without weakening financial ownership", async () => {
  for (const extra of [
    { idempotencyKey: "not-stable" },
    { externalReference: "line\nbreak" },
    { externalReference: "x".repeat(201) },
  ])
    assert.deepEqual(
      await service.execute(id, "record", { ...payment, ...extra }, actor),
      { ok: false, error: "FINANCE_INVALID_INPUT" },
    );
});
test("FIFO orders due date before sequence and supports partial/spanning allocation", () => {
  const items = [
    {
      id: "b",
      dueDate: "2026-11-01T00:00:00Z",
      sequenceNumber: 1,
      remainingXaf: 10000,
    },
    {
      id: "a",
      dueDate: now.toISOString(),
      sequenceNumber: 2,
      remainingXaf: 10000,
    },
  ];
  assert.deepEqual(allocateFifo(15000, items), [
    { installmentId: "a", amountXaf: 10000 },
    { installmentId: "b", amountXaf: 5000 },
  ]);
  assert.deepEqual(allocateFifo(5000, items, true), [
    { installmentId: "b", amountXaf: 5000 },
  ]);
  assert.throws(() => allocateFifo(21000, items), FinanceInvariantError);
});
test("settlement and overdue are independent and use exact due boundary", () => {
  assert.equal(financialStatus(0, 0), "paid");
  assert.equal(financialStatus(10000, 0), "unpaid");
  assert.equal(financialStatus(10000, 5000), "partially_paid");
  assert.equal(financialStatus(10000, 10000), "paid");
  assert.equal(
    installmentStatus(10000, 0, now, new Date(now.getTime() - 1)),
    "upcoming",
  );
  assert.equal(installmentStatus(10000, 0, now, now), "due");
  assert.equal(installmentStatus(10000, 5000, now, now), "partially_paid");
  assert.equal(
    installmentStatus(10000, 5000, now, new Date(now.getTime() + 1)),
    "overdue",
  );
  assert.equal(
    installmentStatus(10000, 10000, now, new Date(now.getTime() + 1)),
    "paid",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  historicalStocks,
  type HistoricalSubscription,
} from "../services/historical-stock.policy.js";

const at = (day: number) => new Date(Date.UTC(2026, 0, day));
const sub: HistoricalSubscription = {
  id: "sub",
  customerId: "customer",
  createdAt: at(1),
  actualStartDate: at(1),
  completedAt: null,
  cancelledAt: null,
};
const empty = {
  subscriptions: [sub],
  statuses: [],
  pauses: [],
  cadenceHistory: [],
  followUps: [],
  appointments: [],
};
const known = {
  ...empty,
  cadenceHistory: [
    {
      subscriptionId: "sub",
      source: "service",
      effectiveFrequencyDays: 7,
      effectiveFrom: at(1),
      effectiveTo: null,
    },
  ],
};
test("historical eligible unknown cadence poisons overdue stock instead of inventing zero", () => {
  assert.deepEqual(historicalStocks(empty, at(10)), {
    activeClients: 1,
    followUpsOverdue: null,
  });
});
test("historical unknown not-yet-created subscription does not poison stock", () => {
  assert.deepEqual(historicalStocks(empty, at(0)), {
    activeClients: 0,
    followUpsOverdue: 0,
  });
});
test("historical unknown not-yet-activated subscription does not poison stock", () => {
  assert.deepEqual(
    historicalStocks(
      { ...empty, subscriptions: [{ ...sub, actualStartDate: at(10) }] },
      at(5),
    ),
    { activeClients: 0, followUpsOverdue: 0 },
  );
});
test("historical proven zero overdue is complete zero", () => {
  assert.deepEqual(historicalStocks(known, at(5)), {
    activeClients: 1,
    followUpsOverdue: 0,
  });
});
test("historical stock reuses strict owner deadline semantics", () => {
  assert.equal(historicalStocks(known, at(8)).followUpsOverdue, 0);
  assert.equal(
    historicalStocks(known, new Date(at(8).getTime() + 1)).followUpsOverdue,
    1,
  );
});
test("historical active clients deduplicate concurrent subscriptions", () => {
  const other = { ...sub, id: "other" };
  assert.equal(
    historicalStocks({ ...empty, subscriptions: [sub, other] }, at(5))
      .activeClients,
    1,
  );
});
test("historical pauses freeze eligibility without poisoning availability", () => {
  const pauses = [{ subscriptionId: "sub", startedAt: at(3), endedAt: at(10) }];
  assert.deepEqual(historicalStocks({ ...empty, pauses }, at(5)), {
    activeClients: 0,
    followUpsOverdue: 0,
  });
});
test("historical lifecycle transitions exclude completion_due and restore active", () => {
  const statuses = [
    {
      subscriptionId: "sub",
      fromStatus: "active",
      toStatus: "completion_due",
      changedAt: at(3),
    },
    {
      subscriptionId: "sub",
      fromStatus: "completion_due",
      toStatus: "active",
      changedAt: at(5),
    },
  ];
  assert.equal(
    historicalStocks({ ...known, statuses }, at(4)).activeClients,
    0,
  );
  assert.equal(
    historicalStocks({ ...known, statuses }, at(6)).activeClients,
    1,
  );
});
test("historical future completion does not remove earlier active stock", () => {
  const data = { ...known, subscriptions: [{ ...sub, completedAt: at(10) }] };
  assert.equal(historicalStocks(data, at(5)).activeClients, 1);
  assert.equal(historicalStocks(data, at(10)).activeClients, 0);
});
test("historical later activity never resets an earlier endpoint", () => {
  const appointments = [
    { subscriptionId: "sub", completedAt: at(12), createdAt: at(1) },
  ];
  assert.equal(
    historicalStocks({ ...known, appointments }, at(10)).followUpsOverdue,
    1,
  );
});
test("historical meaningful follow-up resets owner activity only at its occurrence", () => {
  const followUps = [
    {
      subscriptionId: "sub",
      occurredAt: at(9),
      completedAt: null,
      status: "open",
    },
  ];
  assert.equal(
    historicalStocks({ ...known, followUps }, at(10)).followUpsOverdue,
    0,
  );
});

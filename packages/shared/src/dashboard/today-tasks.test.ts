import assert from "node:assert/strict";
import test from "node:test";
import { todayHeaderCounts, todayTaskKinds } from "./contracts.js";

test("POL-01 D5: « À traiter » priority order with the two finance kinds", () => {
  assert.deepEqual(todayTaskKinds, [
    "follow_up_overdue",
    "installment_overdue",
    "follow_up_due",
    "payment_proof_pending",
    "request_new",
    "request_follow_up",
    "preparation_expired",
    "preparation_ready",
    "preparation_waiting",
    "completion_due",
  ]);
});

test("POL-01 D6: header counts every task and the two « en retard » kinds", () => {
  assert.deepEqual(todayHeaderCounts([]), {
    total: 0,
    followUpsOverdue: 0,
    installmentsOverdue: 0,
  });
  assert.deepEqual(
    todayHeaderCounts([
      { kind: "follow_up_overdue" },
      { kind: "installment_overdue" },
      { kind: "installment_overdue" },
      { kind: "request_new" },
    ]),
    { total: 4, followUpsOverdue: 1, installmentsOverdue: 2 },
  );
});

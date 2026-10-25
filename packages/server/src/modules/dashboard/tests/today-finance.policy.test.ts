import assert from "node:assert/strict";
import test from "node:test";
import type { FollowUpQueueItem } from "@kfit/shared";
import { buildTodayTasks, installmentDaysLate, type FinanceCollectionsInput } from "../services/today.policy.js";

// 2026-10-22 10:00 Libreville (UTC+1).
const now = new Date("2026-10-22T09:00:00Z");
const endOfDay = new Date("2026-10-22T22:59:59.999Z");
const follow = (id: string, state: "due" | "overdue", days: number | null): FollowUpQueueItem => ({
  subscriptionId: id, reference: `SUB-${id}`, customer: { id: `c-${id}`, fullName: `Client ${id}` }, openFollowUpCount: 0, overdueNextActionCount: 0,
  effectiveCadenceDays: 7, cadenceSource: "service", monitoringDisabled: false, cadenceEligible: true, clockFrozen: false,
  latestMeaningfulActivityAt: "2026-10-10T09:00:00Z", latestActivityType: "activation", nextFollowUpDueAt: "2026-10-22T12:00:00Z", cadenceState: state, overdueByDays: days, activeElapsedMs: 0,
});
const owner = (id: string) => ({ subscriptionId: id, customerId: `c-${id}`, customerDisplayName: `Client ${id}` });
const plan = (subscriptionId: string, installments: Array<[id: string, dueDate: string, remainingXaf: number]>) =>
  ({ subscriptionId, activePaymentPlan: { installments: installments.map(([id, dueDate, remainingXaf]) => ({ id, dueDate, remainingXaf })) } });
const base = { now, endOfDay, offerOfSubscription: new Map([["a", "Coaching"], ["b", "Programme"]]), requests: [], preparations: [], completions: [] };

test("POL-01 D5: Libreville day boundary — due today is not late, yesterday is one day late", () => {
  assert.equal(installmentDaysLate("2026-10-22T00:00:00+01:00", now), null, "due today");
  assert.equal(installmentDaysLate("2026-10-21T23:59:00+01:00", now), 1, "due late yesterday, Libreville time");
  assert.equal(installmentDaysLate("2026-10-21T23:30:00Z", now), null, "22 Oct 00:30 in Libreville is today");
  assert.equal(installmentDaysLate("2026-10-12T08:00:00Z", now), 10);
  assert.equal(installmentDaysLate("2026-10-30T00:00:00Z", now), null, "future");
});

test("POL-01 D5: finance tasks take their validated places and order within kind", () => {
  const collections: FinanceCollectionsInput = {
    owners: [owner("a"), owner("b")],
    finance: [plan("a", [["i-paid", "2026-10-01T00:00:00Z", 0], ["i-3", "2026-10-19T00:00:00Z", 5000], ["i-10", "2026-10-12T00:00:00Z", 20000], ["i-today", "2026-10-22T00:00:00+01:00", 7000]]), plan("b", [["i-3b", "2026-10-19T00:00:00Z", 1000]])],
    proofs: [{ resourceId: "p-new", subscriptionId: "b", referenceAt: new Date("2026-10-21T08:00:00Z") }, { resourceId: "p-old", subscriptionId: "a", referenceAt: new Date("2026-10-18T08:00:00Z") }],
  };
  const tasks = buildTodayTasks({ ...base, followUps: [follow("a", "due", null), follow("b", "overdue", 4)], collections });
  assert.deepEqual(tasks.map((t) => [t.kind, t.resourceId ?? t.subscriptionId, t.days]), [
    ["follow_up_overdue", "b", 4],
    ["installment_overdue", "i-10", 10], ["installment_overdue", "i-3", 3], ["installment_overdue", "i-3b", 3],
    ["follow_up_due", "a", null],
    ["payment_proof_pending", "p-old", null], ["payment_proof_pending", "p-new", null],
  ]);
  const installment = tasks.find((t) => t.resourceId === "i-10")!;
  assert.equal(installment.amountXaf, 20000); assert.equal(installment.offer, "Coaching"); assert.equal(installment.name, "Client a"); assert.equal(installment.at, "2026-10-12T00:00:00Z");
});

test("POL-01 D5: subscriptions without an available owner (archived or anonymized customer) produce no finance task", () => {
  const collections: FinanceCollectionsInput = { owners: [owner("a")], finance: [plan("gone", [["x", "2026-10-01T00:00:00Z", 1000]])], proofs: [{ resourceId: "p", subscriptionId: "gone", referenceAt: now }] };
  assert.deepEqual(buildTodayTasks({ ...base, followUps: [], collections }), []);
});

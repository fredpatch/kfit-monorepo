import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceDetail, FinancePlan } from "@kfit/shared";
import type { DashboardAnalyticsSnapshot } from "../repositories/analytics.repository.js";
import { DashboardAnalyticsService } from "../services/analytics.service.js";

const now = new Date("2026-10-22T10:00:00Z");
const snapshot = (): DashboardAnalyticsSnapshot => ({ subscriptions: [], statuses: [], pauses: [], cadenceHistory: [], followUps: [], appointments: [], requests: [], contactedIds: new Set(), qualifiedIds: new Set(), finance: [] });
async function read(data = snapshot(), period: unknown = "4w") {
  const result = await new DashboardAnalyticsService({ async snapshot() { return data; } }, () => now).analytics({ periode: period });
  assert.equal(result.status, "ok"); if (result.status !== "ok") throw new Error("Missing analytics"); return result.response;
}
for (const periode of ["4w", "8w", "12m"] as const) test(`dashboard service accepts ${periode} and returns eight KPI points`, async () => {
  const response = await read(snapshot(), periode);
  assert.equal(response.periode, periode); assert.equal(response.requests.buckets.length, periode === "12m" ? 12 : periode === "4w" ? 4 : 8);
  for (const trend of Object.values(response.trends)) assert.equal(trend.points.length, 8);
});
test("dashboard service rejects unsupported, repeated and non-string periods before reading", async () => {
  const service = new DashboardAnalyticsService({ async snapshot() { throw new Error("Must not read invalid input"); } });
  for (const periode of ["", "4W", "1w", ["4w", "8w"], null, 4, {}]) assert.deepEqual(await service.analytics({ periode }), { status: "invalid" });
});
test("dashboard request flows do not become accumulated stock", async () => {
  const data = snapshot(); data.requests.push({ id: "request", submittedAt: new Date("2026-10-14T10:00:00Z"), convertedSubscriptionId: null });
  const view = await read(data);
  assert.equal(view.trends.newRequests.points[6]!.value, 1); assert.equal(view.trends.newRequests.points[7]!.value, 0);
  assert.equal(view.requests.totalRequests, 1);
});
test("dashboard completed sessions use the authoritative completion timestamp", async () => {
  const data = snapshot(); data.appointments.push({ subscriptionId: "subscription", createdAt: new Date("2026-10-01"), completedAt: now });
  const view = await read(data); assert.equal(view.trends.sessionsCompleted.points[7]!.value, 1); assert.equal(view.trends.sessionsCompleted.points[6]!.value, 0);
});
test("dashboard only the cohort submitted in the selected range enters the funnel", async () => {
  const data = snapshot(); data.requests.push({ id: "old", submittedAt: new Date("2026-08-01"), convertedSubscriptionId: "sub" }, { id: "new", submittedAt: now, convertedSubscriptionId: "later-sub" });
  const view = await read(data); assert.deepEqual(view.requests.funnel, { received: 1, contacted: 1, qualified: 1, converted: 1 }); assert.equal(view.requests.conversionRate, 1);
});
const plan = (): FinancePlan => ({ id: "plan", totalExpectedXaf: 90, status: "active", revisedFromPlanId: null, createdAt: now.toISOString(), availableCommands: [], installments: [
  { id: "overdue", sequenceNumber: 1, amountXaf: 50, dueDate: "2026-10-21T22:59:59Z", paidXaf: 10, remainingXaf: 40, effectiveStatus: "partially_paid" },
  { id: "due", sequenceNumber: 2, amountXaf: 20, dueDate: "2026-10-21T23:00:00Z", paidXaf: 0, remainingXaf: 20, effectiveStatus: "overdue" },
  { id: "future", sequenceNumber: 3, amountXaf: 20, dueDate: "2026-10-22T23:00:00Z", paidXaf: 0, remainingXaf: 20, effectiveStatus: "upcoming" },
] });
function finance(): FinanceDetail {
  const activePaymentPlan = plan();
  return { subscriptionId: "sub", subscriptionStatus: "completed", asOf: now.toISOString(), currency: "XAF", agreedAmountXaf: 100, confirmedPaidXaf: 20, remainingXaf: 80, financialStatus: "partially_paid", hasOverdueInstallment: true, activePaymentPlan, plans: [activePaymentPlan], paymentHistory: [
    { id: "payment", eventType: "payment_received", amountXaf: 30, correctableXaf: 20, currency: "XAF", paymentMethod: "cash", occurredAt: "2026-10-01T00:00:00Z", confirmedAt: "2026-10-01T00:00:00Z", confirmedByUserId: null, correctionOfEventId: null, externalReference: "PRIVATE MUST NOT LEAK", allocations: [] },
  ], scheduleRequiresRevision: false, canCreatePlan: false, canRecordPayment: true };
}
test("dashboard finance uses owner remaining amounts and separates business dates exactly", async () => {
  const data = snapshot(); data.finance.push(finance());
  const view = await read(data); assert.deepEqual(view.finance, { collectedXaf: 20, dueXaf: 20, futureXaf: 20, overdueXaf: 40, outstandingXaf: 80 });
  assert.equal(view.finance.outstandingXaf, view.finance.dueXaf + view.finance.futureXaf + view.finance.overdueXaf);
  assert.equal(JSON.stringify(view).includes("PRIVATE MUST NOT LEAK"), false);
});
test("dashboard collected uses owner effective net even when corrections occur in a later period", async () => {
  const data = snapshot(); const view = finance(); view.paymentHistory[0]!.correctableXaf = 5; data.finance.push(view);
  assert.equal((await read(data)).finance.collectedXaf, 5);
});
test("dashboard finance excludes non-active schedules without changing collected history", async () => {
  const data = snapshot(); const view = finance(); view.activePaymentPlan = null; view.plans[0]!.status = "cancelled"; data.finance.push(view);
  assert.deepEqual((await read(data)).finance, { collectedXaf: 20, dueXaf: 0, futureXaf: 0, overdueXaf: 0, outstandingXaf: 0 });
});

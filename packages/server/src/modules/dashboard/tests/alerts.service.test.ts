import assert from "node:assert/strict";
import test from "node:test";
import type { TodayTask, TodayResponse } from "@kfit/shared";
import { DashboardAlertsService } from "../services/alerts.service.js";
import type { DrizzleDashboardAlertsRepository } from "../repositories/alerts.repository.js";

const now = new Date("2026-10-22T10:00:00Z");
function fixture() {
  const source: Awaited<
    ReturnType<DrizzleDashboardAlertsRepository["snapshot"]>
  > = {
    owners: [
      {
        subscriptionId: "sub",
        customerId: "customer",
        customerDisplayName: "Synthetic Customer",
      },
    ],
    finance: [],
    proofs: [],
    quoteChanges: [],
  };
  const today: TodayResponse = {
    asOf: now.toISOString(),
    businessDate: "2026-10-22",
    tasks: [],
    kpis: {
      activeClients: 0,
      followUpsOverdue: 0,
      oldestOverdueDays: null,
      newRequestsThisWeek: 0,
      requestsToContact: 0,
      sessionsCompletedThisWeek: 0,
      sessionsCompletedToday: 0,
    },
    appointments: [],
    clientsByOffer: [],
    capacity: [],
  };
  const service = new DashboardAlertsService(
    {
      async snapshot() {
        return source;
      },
    },
    {
      async today() {
        return today;
      },
    },
    () => now,
  );
  return { source, today, service };
}
const actor = {
  userId: "admin",
  requestId: "request",
  ipAddress: null,
  userAgent: null,
};
const task = (kind: TodayTask["kind"]): TodayTask => ({
  kind,
  customerId: "customer",
  name: "Synthetic Customer",
  subscriptionId: "sub",
  requestId: null,
  offer: "Synthetic Offer",
  at: now.toISOString(),
  days: 2,
  item: "PRIVATE HEALTH CHECKLIST CONTENT",
});
test("dashboard alerts map owner tasks to existing source tabs without private checklist content", async () => {
  const { today, service } = fixture();
  today.tasks = [
    task("follow_up_overdue"),
    task("preparation_waiting"),
    task("completion_due"),
  ];
  const view = await service.alerts(actor);
  assert.equal(view.alerts.length, 3);
  assert.ok(
    view.alerts.some((alert) => alert.deepLink.endsWith("onglet=suivis")),
  );
  assert.ok(
    view.alerts.some((alert) => alert.deepLink.endsWith("onglet=preparation")),
  );
  assert.ok(
    view.alerts.some((alert) => alert.deepLink.endsWith("onglet=apercu")),
  );
  assert.equal(JSON.stringify(view).includes("PRIVATE"), false);
});
test("dashboard request alerts link directly to the request detail", async () => {
  const { today, service } = fixture();
  today.tasks = [
    {
      ...task("request_new"),
      customerId: null,
      subscriptionId: null,
      requestId: "request-id",
    },
  ];
  assert.equal(
    (await service.alerts(actor)).alerts[0]!.deepLink,
    "/admin/demandes?demande=request-id",
  );
});
test("dashboard pending proof and quote changes link to finance and devis", async () => {
  const { source, today, service } = fixture();
  today.tasks = [
    {
      ...task("payment_proof_pending"),
      days: null,
      item: null,
      resourceId: "proof",
    },
  ];
  source.quoteChanges.push({
    resourceId: "quote",
    subscriptionId: "sub",
    referenceAt: now,
  });
  const view = await service.alerts(actor);
  assert.equal(view.alerts.length, 2);
  assert.ok(
    view.alerts.some(
      (alert) =>
        alert.kind === "payment_proof_pending" &&
        alert.deepLink.endsWith("onglet=finance"),
    ),
  );
  assert.ok(
    view.alerts.some(
      (alert) =>
        alert.kind === "quote_action_required" &&
        alert.deepLink.endsWith("onglet=devis"),
    ),
  );
});
test("dashboard alerts exclude unavailable customer owners and harmless today tasks", async () => {
  const { source, today, service } = fixture();
  source.owners = [];
  today.tasks = [
    task("follow_up_overdue"),
    task("preparation_ready"),
    task("follow_up_due"),
  ];
  today.tasks.push(
    { ...task("payment_proof_pending"), resourceId: "proof" },
    {
      ...task("installment_overdue"),
      resourceId: "installment",
      amountXaf: 1000,
    },
  );
  assert.deepEqual((await service.alerts(actor)).alerts, []);
});

test("POL-01 D5: finance alerts mapped from today tasks keep the former fields and key order", async () => {
  const { today, service } = fixture();
  today.tasks = [
    {
      ...task("installment_overdue"),
      at: "2026-10-20T00:00:00.000Z",
      item: null,
      resourceId: "installment",
      amountXaf: 25000,
    },
  ];
  assert.deepEqual(
    JSON.stringify((await service.alerts(actor)).alerts),
    JSON.stringify([
      {
        subscriptionId: "sub",
        customerId: "customer",
        customerDisplayName: "Synthetic Customer",
        kind: "installment_overdue",
        severity: "warning",
        requestId: null,
        resourceId: "installment",
        title: "Échéance en retard",
        summary: "25 000 FCFA restant à régler",
        referenceAt: "2026-10-20T00:00:00.000Z",
        deepLink: "/admin/clients/customer?abonnement=sub&onglet=finance",
      },
    ]),
  );
});

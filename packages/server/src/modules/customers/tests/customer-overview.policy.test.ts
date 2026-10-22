import assert from "node:assert/strict";
import test from "node:test";
import type { AdminCustomer } from "@kfit/shared";
import { computeCustomerOverview, type OverviewSource, type OverviewSubscription } from "../services/customer-overview.policy.js";

const now = new Date("2026-10-22T10:00:00Z");
const at = (days: number, hour = 10) => new Date(Date.UTC(2026, 9, 22 + days, hour));
const customer = (id: string): AdminCustomer => ({ id, fullName: `Synthetic ${id}`, whatsapp: "+24100000000", email: null, city: null, country: null, preferredContactChannel: "whatsapp", prospectId: null, createdAt: now.toISOString() });
const sub = (overrides: Partial<OverviewSubscription> & Pick<OverviewSubscription, "id" | "customerId" | "status">): OverviewSubscription => ({
  reference: `SUB-${overrides.id}`, serviceName: "Synthetic", serviceSlug: "synthetic", variantName: null, createdAt: at(-30), actualStartDate: at(-20),
  cadence: { days: 7, source: "service" }, pauses: [], ...overrides,
});
const source = (overrides: Partial<OverviewSource>): OverviewSource => ({ customers: [], subscriptions: [], completedAppointments: [], followUps: [], upcomingAppointments: [], ...overrides });

test("overview: client status, current subscription, other open subscriptions and views follow the validated rules", () => {
  const result = computeCustomerOverview(source({
    customers: ["a", "b", "c", "d", "e"].map(customer),
    subscriptions: [
      sub({ id: "a1", customerId: "a", status: "active", createdAt: at(-40) }),
      sub({ id: "a2", customerId: "a", status: "onboarding", createdAt: at(-1), actualStartDate: null }),
      sub({ id: "a3", customerId: "a", status: "completed", createdAt: at(-100) }),
      sub({ id: "b1", customerId: "b", status: "ready_to_start", actualStartDate: null }),
      sub({ id: "c1", customerId: "c", status: "paused" }),
      sub({ id: "d1", customerId: "d", status: "completed" }), sub({ id: "d2", customerId: "d", status: "cancelled" }),
    ],
    completedAppointments: [{ subscriptionId: "a1", completedAt: at(-2) }],
  }), now);
  const row = (id: string) => result.customers.find((r) => r.customer.id === id);
  assert.equal(row("a")?.clientStatus, "active");
  assert.equal(row("a")?.currentSubscription?.id, "a1");
  assert.equal(row("a")?.otherOpenSubscriptions, 1);
  assert.deepEqual(row("a")?.views, ["all", "active"]);
  assert.deepEqual(row("b")?.views, ["all", "preparation"]);
  assert.deepEqual(row("c")?.views, ["all", "paused"]);
  assert.equal(row("d")?.clientStatus, "former");
  assert.deepEqual(row("d")?.views, ["all", "former"]);
  assert.equal(row("e")?.clientStatus, "none");
  assert.equal(row("e")?.currentSubscription, null);
  assert.deepEqual(result.counts, { all: 5, active: 1, overdue: 0, preparation: 1, paused: 1, former: 1 });
});

test("overview cadence = worst S5.3 state across subscriptions; paused and invalid cadences ignored", () => {
  const result = computeCustomerOverview(source({
    customers: [customer("a"), customer("b")],
    subscriptions: [
      sub({ id: "a1", customerId: "a", status: "active", actualStartDate: at(-3) }),
      sub({ id: "a2", customerId: "a", status: "active", actualStartDate: at(-12) }),
      sub({ id: "a3", customerId: "a", status: "active", actualStartDate: at(-30), cadence: null }),
      sub({ id: "b1", customerId: "b", status: "paused", actualStartDate: at(-30), pauses: [{ startedAt: at(-25), endedAt: null }] }),
    ],
  }), now);
  assert.deepEqual(result.customers[0]?.cadence, { subscriptionId: "a2", state: "overdue", overdueByDays: 5 });
  assert.ok(result.customers[0]?.views.includes("overdue"));
  assert.equal(result.customers[1]?.cadence, null);
  assert.equal(result.counts.overdue, 1);
});

test("overview next appointment = earliest upcoming not yet ended; last contact = latest meaningful activity", () => {
  const result = computeCustomerOverview(source({
    customers: [customer("a")],
    subscriptions: [sub({ id: "a1", customerId: "a", status: "active", actualStartDate: at(-20) }), sub({ id: "a2", customerId: "a", status: "active", actualStartDate: at(-10) })],
    completedAppointments: [{ subscriptionId: "a1", completedAt: at(-4) }],
    followUps: [{ subscriptionId: "a2", occurredAt: at(-2), completedAt: null, status: "open" }, { subscriptionId: "a2", occurredAt: at(3), completedAt: null, status: "open" }],
    upcomingAppointments: [
      { id: "later", subscriptionId: "a1", scheduledStart: at(5), scheduledEnd: at(5, 11), status: "confirmed" },
      { id: "ongoing", subscriptionId: "a2", scheduledStart: at(0, 9), scheduledEnd: at(0, 11), status: "scheduled" },
      { id: "cancelled", subscriptionId: "a2", scheduledStart: at(1), scheduledEnd: at(1, 11), status: "cancelled" },
    ],
  }), now);
  assert.equal(result.customers[0]?.nextAppointment?.id, "ongoing");
  assert.equal(result.customers[0]?.lastContactAt, at(-2).toISOString()); // future follow-up ignored
});

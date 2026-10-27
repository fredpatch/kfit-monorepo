import assert from "node:assert/strict";
import test from "node:test";
import {
  adminCustomersApiRoutes,
  customerAnalyticsPeriods,
  customerErrorCodes,
  customerOverviewViews,
  deriveClientStatusKey,
  pickDefaultSubscription,
  normalizeWhatsapp,
  type AdminCustomer,
} from "../index.js";

test("customer routes and stable codes expose the approved S4.1 surface plus the UX-4 profile/analytics, UX-5 overview and S7.3b archived list", () => {
  assert.deepEqual(adminCustomersApiRoutes, {
    list: "/admin/customers",
    search: "/admin/customers/search",
    create: "/admin/customers",
    overview: "/admin/customers/overview",
    archived: "/admin/customers/archived",
    detail: "/admin/customers/:customerId",
    analytics: "/admin/customers/:customerId/analytics",
  });
  assert.deepEqual(customerOverviewViews, [
    "all",
    "active",
    "overdue",
    "preparation",
    "paused",
    "former",
  ]);
  assert.deepEqual(customerAnalyticsPeriods, ["30j", "abonnement", "tout"]);
  assert.ok(customerErrorCodes.includes("CUSTOMER_DUPLICATE_WHATSAPP"));
  assert.ok(customerErrorCodes.includes("CUSTOMER_NOT_FOUND"));
});

test("WhatsApp normalization preserves Sprint 3 semantics", () => {
  for (const phone of ["+241 06 12 34 56", "+241-06-12-34-56", "+24106123456"])
    assert.equal(normalizeWhatsapp(phone), "+24106123456");
  assert.equal(normalizeWhatsapp("123"), null);
  assert.equal(normalizeWhatsapp("1".repeat(21)), null);
  assert.equal(normalizeWhatsapp("06123456"), "06123456");
});

test("customer DTO serializes only the approved fields with explicit nulls and ISO dates", () => {
  const customer: AdminCustomer = {
    id: "11111111-1111-1111-1111-111111111111",
    fullName: "Synthetic Customer",
    whatsapp: "+24100000000",
    email: null,
    city: null,
    country: null,
    preferredContactChannel: "whatsapp",
    prospectId: null,
    createdAt: new Date("2026-10-20T08:00:00Z").toISOString(),
  };
  assert.deepEqual(JSON.parse(JSON.stringify(customer)), customer);
  assert.deepEqual(
    Object.keys(customer).sort(),
    [
      "id",
      "fullName",
      "whatsapp",
      "email",
      "city",
      "country",
      "preferredContactChannel",
      "prospectId",
      "createdAt",
    ].sort(),
  );
});

test("client status follows the validated priority (2026-10-22)", () => {
  const of = (...statuses: string[]) =>
    deriveClientStatusKey(statuses.map((status) => ({ status })));
  assert.equal(of(), "none");
  assert.equal(of("completed", "cancelled"), "former");
  assert.equal(of("onboarding", "active", "paused"), "active");
  assert.equal(of("onboarding", "paused", "completion_due"), "completion_due");
  assert.equal(of("onboarding", "paused"), "paused");
  assert.equal(of("onboarding", "ready_to_start"), "ready_to_start");
  assert.equal(
    of("medical_clearance_required", "awaiting_payment"),
    "awaiting_payment",
  );
  assert.equal(
    of("onboarding", "medical_clearance_required"),
    "medical_clearance_required",
  );
  assert.equal(of("completed", "onboarding"), "onboarding");
  const subs = [
    { id: "new", status: "completed" },
    { id: "open", status: "paused" },
    { id: "old", status: "onboarding" },
  ];
  assert.equal(pickDefaultSubscription(subs)?.id, "open");
  assert.equal(
    pickDefaultSubscription([
      { id: "a", status: "completed" },
      { id: "b", status: "cancelled" },
    ])?.id,
    "a",
  );
  assert.equal(pickDefaultSubscription([]), undefined);
});

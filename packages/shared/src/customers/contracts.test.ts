import assert from "node:assert/strict";
import test from "node:test";
import { adminCustomersApiRoutes, customerErrorCodes, normalizeWhatsapp, type AdminCustomer } from "../index.js";

test("customer routes and stable conflict code expose the approved S4.1 surface", () => {
  assert.deepEqual(adminCustomersApiRoutes, { list: "/admin/customers", search: "/admin/customers/search", create: "/admin/customers" });
  assert.ok(customerErrorCodes.includes("CUSTOMER_DUPLICATE_WHATSAPP"));
});

test("WhatsApp normalization preserves Sprint 3 semantics", () => {
  for (const phone of ["+241 06 12 34 56", "+241-06-12-34-56", "+24106123456"]) assert.equal(normalizeWhatsapp(phone), "+24106123456");
  assert.equal(normalizeWhatsapp("123"), null);
  assert.equal(normalizeWhatsapp("1".repeat(21)), null);
  assert.equal(normalizeWhatsapp("06123456"), "06123456");
});

test("customer DTO serializes only the approved fields with explicit nulls and ISO dates", () => {
  const customer: AdminCustomer = {
    id: "11111111-1111-1111-1111-111111111111", fullName: "Synthetic Customer", whatsapp: "+24100000000",
    email: null, city: null, country: null, preferredContactChannel: "whatsapp", prospectId: null,
    createdAt: new Date("2026-10-20T08:00:00Z").toISOString(),
  };
  assert.deepEqual(JSON.parse(JSON.stringify(customer)), customer);
  assert.deepEqual(Object.keys(customer).sort(), ["id", "fullName", "whatsapp", "email", "city", "country", "preferredContactChannel", "prospectId", "createdAt"].sort());
});

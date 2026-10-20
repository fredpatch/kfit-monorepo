import assert from "node:assert/strict";
import test from "node:test";
import { serviceRequestStatuses } from "@kfit/shared";
import { RequestConversionService, resolveConversionDecision } from "../services/request-conversion.service.js";

const id = "11111111-1111-1111-1111-111111111111";
const actor = { userId: id, requestId: "synthetic-conversion", ipAddress: null, userAgent: null };
const target = new Date("2026-11-01T00:00:00Z");
const fallback = new Date("2026-12-01T00:00:00Z");
const review = { outcome: "qualified", finalVariantId: id, agreedPriceXaf: 45000, targetStartDate: target };

for (const status of serviceRequestStatuses) {
  test(`conversion domain eligibility: ${status}`, () => {
    const result = resolveConversionDecision(status, [{ ...review, outcome: status }], null);
    assert.equal(result.status, status === "qualified" || status === "qualified_with_conditions" ? "ok" : "not_eligible");
  });
}

test("conversion domain takes qualification commercial values and target start before caller fallback", () => {
  assert.deepEqual(resolveConversionDecision("qualified", [review], fallback), { status: "ok", variantId: id, agreedPriceXaf: 45000, plannedStartDate: target });
  assert.deepEqual(resolveConversionDecision("qualified", [{ ...review, targetStartDate: null, agreedPriceXaf: 0 }], fallback), { status: "ok", variantId: id, agreedPriceXaf: 0, plannedStartDate: fallback });
});

test("conversion domain requires one consistent current review with complete commercial values", () => {
  for (const reviews of [[], [review, review], [{ ...review, outcome: "qualified_with_conditions" }], [{ ...review, finalVariantId: null }],
    [{ ...review, agreedPriceXaf: null }], [{ ...review, agreedPriceXaf: -1 }], [{ ...review, agreedPriceXaf: 1.5 }], [{ ...review, targetStartDate: new Date("invalid") }]]) {
    assert.equal(resolveConversionDecision("qualified", reviews, null).status, "qualification_invalid");
  }
});

test("conversion domain requires a fallback start only when qualification has none", () => {
  assert.deepEqual(resolveConversionDecision("qualified", [{ ...review, targetStartDate: null }], null), { status: "start_date_required" });
});

test("conversion service rejects invalid bodies, identifiers and commercial/customer overrides before persistence", async () => {
  const service = new RequestConversionService({ async convert() { assert.fail("invalid request reached persistence"); } });
  assert.deepEqual(await service.convert("invalid", {}, actor), { status: "invalid" });
  for (const body of [null, [], "text", { serviceId: id }, { variantId: id }, { agreedPriceXaf: 1 }, { currency: "EUR" }, { customerId: id },
    { plannedStartDate: null }, { plannedStartDate: "invalid" }, { plannedStartDate: "2026-02-30" }, { plannedStartDate: "2026-11-01T25:00:00Z" }, { plannedStartDate: "2026-11-01T12:00" }]) {
    assert.deepEqual(await service.convert(id, body, actor), { status: "invalid" });
  }
});

test("conversion service accepts ISO/date-only starts and preserves repository conflicts", async () => {
  const values: Array<Date | null> = [];
  const service = new RequestConversionService({ async convert(requestId, planned, context) { assert.equal(requestId, id); assert.equal(context, actor); values.push(planned); return { status: "already_converted" }; } });
  assert.deepEqual(await service.convert(id, {}, actor), { status: "already_converted" });
  await service.convert(id, { plannedStartDate: "2026-11-01" }, actor);
  await service.convert(id, { plannedStartDate: "2026-11-01T02:00:00+02:00" }, actor);
  assert.deepEqual(values, [null, target, target]);
});

test("conversion service propagates persistence failures without inventing successful replay", async () => {
  const service = new RequestConversionService({ async convert() { throw new Error("synthetic failure"); } });
  await assert.rejects(service.convert(id, {}, actor), /synthetic failure/);
});

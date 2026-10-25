import assert from "node:assert/strict";
import test from "node:test";
import { finalVariantRefusal, finalVariantRuleFor, normalizeQualificationReview } from "../services/admin-requests.service.js";
import { resolveConversionDecision } from "../services/request-conversion.service.js";

const variantId = "11111111-1111-4111-8111-111111111111";

test("REG-F1 validation accepts a missing option for a non-rejected decision and keeps rejecting one for rejected (R1, R2)", () => {
  for (const finalVariantId of [undefined, null, ""]) {
    const result = normalizeQualificationReview({ outcome: "qualified", agreedPriceXaf: 25000, ...(finalVariantId === undefined ? {} : { finalVariantId }) });
    assert.ok(!("invalid" in result) && result.finalVariantId === null, JSON.stringify(finalVariantId));
  }
  const withOption = normalizeQualificationReview({ outcome: "qualified_with_conditions", agreedPriceXaf: 25000, finalVariantId: variantId, conditions: ["ok"] });
  assert.ok(!("invalid" in withOption) && withOption.finalVariantId === variantId);
  assert.deepEqual(normalizeQualificationReview({ outcome: "qualified", agreedPriceXaf: 25000, finalVariantId: "not-a-uuid" }), { invalid: "final_variant_id_invalid" });
  assert.deepEqual(normalizeQualificationReview({ outcome: "rejected", finalVariantId: variantId }), { invalid: "final_variant_forbidden" });
});

test("REG-F1 rule: options required when the offer has active ones, not applicable otherwise (R1)", () => {
  assert.equal(finalVariantRuleFor(0), "not_applicable");
  assert.equal(finalVariantRuleFor(2), "required");
  assert.equal(finalVariantRefusal("required", null), "final_variant_required");
  assert.equal(finalVariantRefusal("required", variantId), null);
  assert.equal(finalVariantRefusal("not_applicable", null), null);
  assert.equal(finalVariantRefusal("not_applicable", variantId), "final_variant_not_applicable");
});

test("REG-F1 conversion decision accepts a no-option qualification (R3)", () => {
  const start = new Date("2026-11-02T00:00:00Z");
  assert.deepEqual(resolveConversionDecision("qualified", [{ outcome: "qualified", finalVariantId: null, agreedPriceXaf: 25000, targetStartDate: start }], null),
    { status: "ok", variantId: null, agreedPriceXaf: 25000, plannedStartDate: start });
  assert.deepEqual(resolveConversionDecision("qualified", [{ outcome: "qualified", finalVariantId: null, agreedPriceXaf: null, targetStartDate: start }], null), { status: "qualification_invalid" });
});

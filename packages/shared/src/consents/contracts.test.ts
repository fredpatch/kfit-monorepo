import assert from "node:assert/strict";
import test from "node:test";
import {
  consentApiRoutes,
  consentDefinitionApiRoutes,
  consentErrorCodes,
  consentTypes,
  optionalConsentTypes,
  requiredConsentTypes,
  type ConsentCaptureInput,
} from "./contracts.js";
test("CONS-02 optional types are exactly the four non-required types (D2)", () => {
  assert.deepEqual(optionalConsentTypes, [
    "health_data",
    "progress_photo_storage",
    "marketing",
    "publication",
  ]);
  assert.deepEqual(
    [...requiredConsentTypes, ...optionalConsentTypes].sort(),
    [...consentTypes].sort(),
  );
});
test("CONS-02 consent text admin routes stay under the admin prefix and add the not-requested code (D7)", () => {
  assert.ok(
    Object.values(consentDefinitionApiRoutes).every((route) =>
      route.startsWith("/admin/consent-definitions"),
    ),
  );
  assert.ok(consentErrorCodes.includes("CONSENT_TYPE_NOT_REQUESTED"));
});
test("consent types keep the two required acceptances independent from four optional types", () => {
  assert.deepEqual(requiredConsentTypes, ["service_terms", "privacy_notice"]);
  assert.equal(consentTypes.length, 6);
});
test("consent public input supplies decisions without definition identity overrides", () => {
  const input: ConsentCaptureInput = {
    decisions: { service_terms: "granted", privacy_notice: "refused" },
  };
  assert.deepEqual(Object.keys(input), ["decisions"]);
});
test("consent routes separate public bearer access and authenticated admin commands", () => {
  assert.equal(consentApiRoutes.public, "/public/consents/:token");
  assert.ok(
    Object.entries(consentApiRoutes)
      .filter(([name]) => name !== "public")
      .every(([, route]) => route.startsWith("/admin/subscriptions/")),
  );
});

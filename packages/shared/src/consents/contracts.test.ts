import assert from "node:assert/strict";
import test from "node:test";
import { consentApiRoutes, consentTypes, requiredConsentTypes, type ConsentCaptureInput } from "./contracts.js";
test("consent types keep the two required acceptances independent from four optional types", () => {
  assert.deepEqual(requiredConsentTypes, ["service_terms", "privacy_notice"]); assert.equal(consentTypes.length, 6);
});
test("consent public input supplies decisions without definition identity overrides", () => {
  const input: ConsentCaptureInput = { decisions: { service_terms: "granted", privacy_notice: "refused" } };
  assert.deepEqual(Object.keys(input), ["decisions"]);
});
test("consent routes separate public bearer access and authenticated admin commands", () => {
  assert.equal(consentApiRoutes.public, "/public/consents/:token");
  assert.ok(Object.entries(consentApiRoutes).filter(([name]) => name !== "public").every(([, route]) => route.startsWith("/admin/subscriptions/")));
});

import assert from "node:assert/strict";
import test from "node:test";
import { kfitInitialCatalogueSeed } from "./catalogue.seed.js";

test("initial catalogue seed defines stable public K'FIT services", () => {
  assert.equal(kfitInitialCatalogueSeed.services.length, 3);
  assert.deepEqual(kfitInitialCatalogueSeed.services.map((service) => service.slug), [
    "coaching-nutrition-personnalise",
    "programme-sportif-12-semaines",
    "bilan-individuel",
  ]);
  assert.equal(kfitInitialCatalogueSeed.services.every((service) => service.isPublic && service.publishedAt), true);
  assert.equal(kfitInitialCatalogueSeed.variants.length, 3);
  assert.equal(kfitInitialCatalogueSeed.components.length, 5);
  assert.equal(kfitInitialCatalogueSeed.policies.length, 3);
});

test("initial catalogue seed keeps one service per request assumption ready", () => {
  const serviceIds = new Set(kfitInitialCatalogueSeed.services.map((service) => service.id));

  for (const variant of kfitInitialCatalogueSeed.variants) {
    assert.equal(serviceIds.has(variant.serviceId), true);
  }

  for (const component of kfitInitialCatalogueSeed.components) {
    assert.equal(serviceIds.has(component.serviceId), true);
  }

  for (const policy of kfitInitialCatalogueSeed.policies) {
    assert.equal(serviceIds.has(policy.serviceId), true);
  }
});

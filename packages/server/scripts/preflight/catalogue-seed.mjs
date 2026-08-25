import "dotenv/config";
import assert from "node:assert/strict";

const { seedInitialCatalogue } = await import("../../dist/db/seeds/catalogue.seed.js");
const { db, pool } = await import("../../dist/db/client.js");
const { DrizzleCatalogueRepository, CatalogueService } = await import("../../dist/index.js");

function ok(message) {
  console.log(`✓ ${message}`);
}

try {
  const first = await seedInitialCatalogue(db);
  const second = await seedInitialCatalogue(db);

  assert.deepEqual(first, { services: 3, variants: 3, components: 5, policies: 3 });
  assert.deepEqual(second, first);
  ok("catalogue seed runs idempotently");

  const catalogue = await new CatalogueService(new DrizzleCatalogueRepository(db)).listPublicServices();

  assert.equal(catalogue.services.length, 3);
  assert.deepEqual(catalogue.services.map((service) => service.slug), [
    "coaching-nutrition-personnalise",
    "programme-sportif-12-semaines",
    "bilan-individuel",
  ]);
  ok("public catalogue returns the seeded services in display order");

  const nutrition = catalogue.services.find((service) => service.slug === "coaching-nutrition-personnalise");
  assert.ok(nutrition);
  assert.equal(nutrition.basePriceXaf, 75000);
  assert.equal(nutrition.variants.length, 2);
  assert.deepEqual(nutrition.variants.map((variant) => variant.slug), ["standard", "premium"]);
  assert.equal(nutrition.components.some((component) => component.label === "Suivi WhatsApp hebdomadaire"), true);
  assert.equal(nutrition.policy?.medicalClearancePolicy, "required_if_risk_flag");
  ok("nutrition service exposes variants, components and policy");

  const programme = catalogue.services.find((service) => service.slug === "programme-sportif-12-semaines");
  assert.ok(programme);
  assert.equal(programme.variants[0]?.components.length, 2);
  assert.equal(programme.variants[0]?.policy?.followUpFrequencyDays, 7);
  ok("programme service exposes package components and policy");

  const bilan = catalogue.services.find((service) => service.slug === "bilan-individuel");
  assert.ok(bilan);
  assert.equal(bilan.pricingMode, "quote");
  assert.equal(bilan.availabilityStatus, "waitlist_only");
  assert.equal(bilan.waitlistEnabled, true);
  ok("quote-based waitlist service is represented");

  assert.equal(JSON.stringify(catalogue).includes("archivedAt"), false);
  assert.equal(JSON.stringify(catalogue).includes("isPublic"), false);
  ok("public catalogue response does not expose admin-only fields");
} finally {
  await pool.end();
}

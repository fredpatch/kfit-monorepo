import assert from "node:assert/strict";
import test from "node:test";
import { CatalogueService, type CatalogueSnapshot } from "../services/catalogue.service.js";

const snapshot: CatalogueSnapshot = {
  services: [
    {
      id: "service-2",
      name: "Programme sportif",
      slug: "programme-sportif",
      description: null,
      pricingMode: "quote",
      basePriceXaf: null,
      deliveryType: "time_based",
      defaultDurationValue: 3,
      defaultDurationUnit: "month",
      availabilityStatus: "waitlist_only",
      capacityMode: "limited",
      capacityLimit: 6,
      waitlistEnabled: true,
      sortOrder: 2,
      publishedAt: new Date("2026-08-25T09:00:00Z"),
    },
    {
      id: "service-1",
      name: "Coaching nutrition",
      slug: "coaching-nutrition",
      description: "Accompagnement nutrition personnalisé.",
      pricingMode: "fixed",
      basePriceXaf: 75000,
      deliveryType: "time_based",
      defaultDurationValue: 1,
      defaultDurationUnit: "month",
      availabilityStatus: "open",
      capacityMode: "unlimited",
      capacityLimit: null,
      waitlistEnabled: false,
      sortOrder: 1,
      publishedAt: new Date("2026-08-25T08:00:00Z"),
    },
  ],
  variants: [
    {
      id: "variant-premium",
      serviceId: "service-1",
      name: "Premium",
      slug: "premium",
      priceXaf: 120000,
      durationValue: 1,
      durationUnit: "month",
      capacityLimit: 4,
      availabilityStatus: "open",
      sortOrder: 2,
    },
    {
      id: "variant-standard",
      serviceId: "service-1",
      name: "Standard",
      slug: "standard",
      priceXaf: 75000,
      durationValue: 1,
      durationUnit: "month",
      capacityLimit: null,
      availabilityStatus: "open",
      sortOrder: 1,
    },
  ],
  components: [
    {
      id: "component-service",
      serviceId: "service-1",
      variantId: null,
      componentType: "follow_up",
      label: "Suivi WhatsApp",
      quantity: 4,
      isMandatory: true,
      consumptionPolicy: "manual",
    },
    {
      id: "component-premium",
      serviceId: "service-1",
      variantId: "variant-premium",
      componentType: "appointment",
      label: "Session individuelle",
      quantity: 2,
      isMandatory: true,
      consumptionPolicy: "manual",
    },
  ],
  policies: [
    {
      serviceId: "service-1",
      variantId: null,
      followUpFrequencyDays: 7,
      lateCancelNoticeHours: 24,
      lateCancelConsumesComponent: false,
      missedConsumesComponent: true,
      medicalClearancePolicy: "required_if_risk_flag",
    },
  ],
};

test("CatalogueService returns public services with variants, components and policy snapshots", async () => {
  const service = new CatalogueService({
    async listPublicServices() {
      return snapshot;
    },
  });

  const result = await service.listPublicServices();

  assert.equal(result.services.length, 2);
  assert.equal(result.services[0]?.slug, "coaching-nutrition");
  assert.equal(result.services[0]?.publishedAt, "2026-08-25T08:00:00.000Z");
  assert.equal(result.services[0]?.components[0]?.label, "Suivi WhatsApp");
  assert.equal(result.services[0]?.policy?.followUpFrequencyDays, 7);
  assert.deepEqual(result.services[0]?.variants.map((variant) => variant.slug), ["standard", "premium"]);
  assert.equal(result.services[0]?.variants[1]?.components[0]?.label, "Session individuelle");
});

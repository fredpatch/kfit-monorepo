import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogueApiRoutes,
  catalogueErrorCodes,
  type CataloguePublicServicesResponse,
} from "./contracts.js";

test("catalogue shared contracts expose stable public routes and errors", () => {
  assert.deepEqual(catalogueApiRoutes, {
    publicServices: "/catalogue/services",
  });

  assert.deepEqual(catalogueErrorCodes, [
    "CATALOGUE_ROUTE_UNEXPECTED_FAILURE",
  ]);
});

test("catalogue shared contracts type-check public service response shape", () => {
  const response: CataloguePublicServicesResponse = {
    services: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Coaching nutrition",
        slug: "coaching-nutrition",
        description: "Accompagnement nutrition personnalisé.",
        pricingMode: "fixed",
        basePriceXaf: 75000,
        deliveryType: "time_based",
        defaultDurationValue: 1,
        defaultDurationUnit: "month",
        availabilityStatus: "open",
        capacityMode: "limited",
        capacityLimit: 10,
        waitlistEnabled: true,
        publishedAt: "2026-08-25T08:00:00.000Z",
        components: [],
        policy: null,
        variants: [],
      },
    ],
  };

  assert.equal(response.services[0]?.slug, "coaching-nutrition");
  assert.equal(response.services[0]?.basePriceXaf, 75000);
});

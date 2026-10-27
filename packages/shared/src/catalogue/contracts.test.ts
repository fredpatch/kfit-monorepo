import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogueApiRoutes,
  catalogueComponentTypes,
  catalogueConsumptionPolicies,
  catalogueErrorCodes,
  catalogueMedicalClearancePolicies,
  catalogueRuleLimits,
  type CatalogueAdminServicesResponse,
  type CataloguePublicServicesResponse,
} from "./contracts.js";

test("catalogue shared contracts expose stable public and admin routes", () => {
  assert.deepEqual(catalogueApiRoutes, {
    publicServices: "/catalogue/services",
    adminServices: "/admin/catalogue/services",
    adminService: "/admin/catalogue/services/:serviceId",
    adminServicePublish: "/admin/catalogue/services/:serviceId/publish",
    adminServiceArchive: "/admin/catalogue/services/:serviceId/archive",
    adminServiceCapacity: "/admin/catalogue/services/:serviceId/capacity",
    adminServiceOrder: "/admin/catalogue/services/order",
    adminServicesOverview: "/admin/catalogue/services/overview",
    adminVariants: "/admin/catalogue/services/:serviceId/variants",
    adminVariant: "/admin/catalogue/services/:serviceId/variants/:variantId",
    adminVariantArchive:
      "/admin/catalogue/services/:serviceId/variants/:variantId/archive",
    adminComponents: "/admin/catalogue/services/:serviceId/components",
    adminComponent:
      "/admin/catalogue/services/:serviceId/components/:componentId",
    adminComponentArchive:
      "/admin/catalogue/services/:serviceId/components/:componentId/archive",
    adminServiceRules: "/admin/catalogue/services/:serviceId/rules",
    adminVariantRules:
      "/admin/catalogue/services/:serviceId/variants/:variantId/rules",
    adminServiceDeliverability:
      "/admin/catalogue/services/:serviceId/deliverability",
  });

  assert.deepEqual(catalogueErrorCodes, [
    "CATALOGUE_ROUTE_UNEXPECTED_FAILURE",
    "CATALOGUE_ADMIN_FORBIDDEN",
    "CATALOGUE_SERVICE_NOT_FOUND",
    "CATALOGUE_SERVICE_INVALID_INPUT",
    "CATALOGUE_SERVICE_SLUG_CONFLICT",
    "CATALOGUE_SERVICE_ARCHIVED",
    "CATALOGUE_SERVICE_PUBLISH_INVALID",
    "CATALOGUE_SERVICE_NOT_DELIVERABLE",
    "CATALOGUE_VARIANT_NOT_FOUND",
    "CATALOGUE_VARIANT_SLUG_CONFLICT",
    "CATALOGUE_VARIANT_ARCHIVED",
    "CATALOGUE_COMPONENT_NOT_FOUND",
    "CATALOGUE_COMPONENT_ARCHIVED",
    "CATALOGUE_RULES_OVERRIDE_NOT_FOUND",
    "CATALOGUE_RULES_OVERRIDE_HAS_QUESTIONNAIRE",
  ]);
});

test("CAT-03 closed vocabularies match Fred's decisions (D2, D3, D4)", () => {
  assert.deepEqual(catalogueComponentTypes, [
    "appointment",
    "follow_up",
    "program",
  ]);
  assert.deepEqual(catalogueConsumptionPolicies, ["manual"]);
  assert.deepEqual(catalogueMedicalClearancePolicies, [
    "not_required",
    "required_if_risk_flag",
    "required",
  ]);
  assert.deepEqual(catalogueRuleLimits, {
    followUpFrequencyDays: { min: 1, max: 90 },
    lateCancelNoticeHours: { min: 1, max: 168 },
  });
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

test("catalogue shared contracts type-check admin service response shape", () => {
  const response: CatalogueAdminServicesResponse = {
    services: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Bilan individuel",
        slug: "bilan-individuel",
        description: null,
        pricingMode: "quote",
        basePriceXaf: null,
        deliveryType: "one_time",
        defaultDurationValue: null,
        defaultDurationUnit: null,
        availabilityStatus: "temporarily_closed",
        capacityMode: "unlimited",
        capacityLimit: null,
        waitlistEnabled: false,
        isPublic: false,
        sortOrder: 3,
        publishedAt: null,
        archivedAt: null,
        updatedAt: "2026-08-25T08:00:00.000Z",
      },
    ],
  };

  assert.equal(response.services[0]?.isPublic, false);
  assert.equal(response.services[0]?.publishedAt, null);
});

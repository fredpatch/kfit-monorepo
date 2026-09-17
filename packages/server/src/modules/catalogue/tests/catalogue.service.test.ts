import assert from "node:assert/strict";
import test from "node:test";
import {
  CatalogueService,
  type CatalogueAdminServiceRecord,
  type CatalogueRepository,
  type CatalogueServicePatchInput,
  type CatalogueServiceWriteInput,
  type CatalogueSnapshot,
} from "../services/catalogue.service.js";

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

function adminRecord(input: Partial<CatalogueAdminServiceRecord> = {}): CatalogueAdminServiceRecord {
  return {
    id: "service-admin",
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
    sortOrder: 3,
    isPublic: false,
    publishedAt: null,
    archivedAt: null,
    updatedAt: new Date("2026-08-25T08:00:00Z"),
    ...input,
  };
}

class FakeCatalogueRepository implements CatalogueRepository {
  services = [adminRecord()];
  createdInput: CatalogueServiceWriteInput | null = null;
  updatedInput: CatalogueServicePatchInput | null = null;
  reorderedItems: Array<{ serviceId: string; sortOrder: number }> | null = null;

  async listPublicServices() {
    return snapshot;
  }

  async listAdminServices() {
    return this.services;
  }

  async getAdminService(serviceId: string) {
    return this.services.find((service) => service.id === serviceId) ?? null;
  }

  async createService(input: CatalogueServiceWriteInput) {
    this.createdInput = input;
    const service = adminRecord({
      ...input,
      id: "created-service",
      publishedAt: null,
      archivedAt: null,
      updatedAt: new Date("2026-08-25T08:05:00Z"),
    });
    this.services.push(service);
    return service;
  }

  async updateService(serviceId: string, input: CatalogueServicePatchInput) {
    this.updatedInput = input;
    const existing = this.services.find((service) => service.id === serviceId);
    if (!existing) return "not_found";
    Object.assign(existing, input, { updatedAt: new Date("2026-08-25T08:10:00Z") });
    return existing;
  }

  async publishService(serviceId: string, now: Date) {
    const existing = this.services.find((service) => service.id === serviceId);
    if (!existing) return "not_found";
    if (existing.archivedAt || existing.availabilityStatus === "archived") return "archived";
    existing.isPublic = true;
    existing.publishedAt = existing.publishedAt ?? now;
    existing.updatedAt = now;
    return existing;
  }

  async archiveService(serviceId: string, now: Date) {
    const existing = this.services.find((service) => service.id === serviceId);
    if (!existing) return "not_found";
    existing.isPublic = false;
    existing.availabilityStatus = "archived";
    existing.archivedAt = now;
    existing.updatedAt = now;
    return existing;
  }

  async reorderServices(items: Array<{ serviceId: string; sortOrder: number }>) {
    this.reorderedItems = items;
    for (const item of items) {
      const existing = this.services.find((service) => service.id === item.serviceId);
      if (!existing) return "not_found";
      existing.sortOrder = item.sortOrder;
    }
    return this.services;
  }
}

test("CatalogueService returns public services with variants, components and policy snapshots", async () => {
  const service = new CatalogueService({
    async listPublicServices() {
      return snapshot;
    },
    async listAdminServices() {
      return [];
    },
    async getAdminService() {
      return null;
    },
    async createService() {
      throw new Error("not used");
    },
    async updateService() {
      throw new Error("not used");
    },
    async publishService() {
      throw new Error("not used");
    },
    async archiveService() {
      throw new Error("not used");
    },
    async reorderServices() {
      throw new Error("not used");
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

test("CatalogueService lists admin services with draft and publication metadata", async () => {
  const repository = new FakeCatalogueRepository();
  const service = new CatalogueService(repository);

  const result = await service.listAdminServices();

  assert.equal(result.services[0]?.slug, "bilan-individuel");
  assert.equal(result.services[0]?.isPublic, false);
  assert.equal(result.services[0]?.publishedAt, null);
  assert.equal(result.services[0]?.updatedAt, "2026-08-25T08:00:00.000Z");
});

test("CatalogueService validates and creates admin service drafts", async () => {
  const repository = new FakeCatalogueRepository();
  const service = new CatalogueService(repository);

  const invalid = await service.createAdminService({ name: "", slug: "bad slug" });
  assert.equal(invalid.status, "invalid");

  const created = await service.createAdminService({
    name: "Suivi express",
    slug: "suivi-express",
    pricingMode: "fixed",
    basePriceXaf: 25000,
    deliveryType: "one_time",
    capacityMode: "unlimited",
    sortOrder: 4,
  });

  assert.equal(created.status, "ok");
  assert.equal(repository.createdInput?.isPublic, false);
  assert.equal(repository.createdInput?.availabilityStatus, "temporarily_closed");
  assert.equal(created.status === "ok" ? created.response.service.slug : null, "suivi-express");
});

test("CatalogueService updates, publishes, archives and reorders admin services", async () => {
  const repository = new FakeCatalogueRepository();
  const service = new CatalogueService(repository);

  const updated = await service.updateAdminService("service-admin", { name: "Bilan complet", sortOrder: 1 });
  assert.equal(updated.status, "ok");
  assert.deepEqual(repository.updatedInput, { name: "Bilan complet", sortOrder: 1 });

  const published = await service.publishAdminService("service-admin", new Date("2026-08-25T09:00:00Z"));
  assert.equal(published.status, "ok");
  assert.equal(published.status === "ok" ? published.response.service.isPublic : null, true);

  const invalidCapacity = await service.updateAdminServiceCapacity("service-admin", {
    availabilityStatus: "waitlist_only",
    capacityMode: "limited",
    capacityLimit: 6,
    waitlistEnabled: false,
  });
  assert.deepEqual(invalidCapacity, { status: "invalid", reason: "waitlist_required" });

  const capacity = await service.updateAdminServiceCapacity("service-admin", {
    availabilityStatus: "waitlist_only",
    capacityMode: "limited",
    capacityLimit: 6,
    waitlistEnabled: true,
  });
  assert.equal(capacity.status, "ok");
  assert.deepEqual(repository.updatedInput, {
    availabilityStatus: "waitlist_only",
    capacityMode: "limited",
    capacityLimit: 6,
    waitlistEnabled: true,
  });

  const unlimitedCapacity = await service.updateAdminServiceCapacity("service-admin", {
    availabilityStatus: "open",
    capacityMode: "unlimited",
    capacityLimit: 6,
    waitlistEnabled: false,
  });
  assert.deepEqual(unlimitedCapacity, { status: "invalid", reason: "capacity_limit_must_be_null" });

  const reordered = await service.reorderAdminServices({ items: [{ serviceId: "service-admin", sortOrder: 5 }] });
  assert.equal(reordered.status, "ok");
  assert.deepEqual(repository.reorderedItems, [{ serviceId: "service-admin", sortOrder: 5 }]);

  const archived = await service.archiveAdminService("service-admin", new Date("2026-08-25T10:00:00Z"));
  assert.equal(archived.status, "ok");
  assert.equal(archived.status === "ok" ? archived.response.service.availabilityStatus : null, "archived");
  assert.equal(archived.status === "ok" ? archived.response.service.isPublic : null, false);
});

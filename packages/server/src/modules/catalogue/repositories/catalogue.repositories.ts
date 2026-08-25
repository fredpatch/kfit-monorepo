import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import { serviceComponents, servicePolicies, services, serviceVariants } from "../../../db/schema/catalogue.js";
import type {
  CatalogueRepository,
  CatalogueServiceComponentRecord,
  CatalogueServicePolicyRecord,
  CatalogueServiceRecord,
  CatalogueServiceVariantRecord,
} from "../services/catalogue.service.js";

type CatalogueDb = typeof appDb;

function mapService(row: typeof services.$inferSelect): CatalogueServiceRecord {
  if (!row.publishedAt) {
    throw new Error("Published catalogue service row is missing publishedAt");
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    pricingMode: row.pricingMode as CatalogueServiceRecord["pricingMode"],
    basePriceXaf: row.basePriceXaf,
    deliveryType: row.deliveryType as CatalogueServiceRecord["deliveryType"],
    defaultDurationValue: row.defaultDurationValue,
    defaultDurationUnit: row.defaultDurationUnit as CatalogueServiceRecord["defaultDurationUnit"],
    availabilityStatus: row.availabilityStatus as CatalogueServiceRecord["availabilityStatus"],
    capacityMode: row.capacityMode as CatalogueServiceRecord["capacityMode"],
    capacityLimit: row.capacityLimit,
    waitlistEnabled: row.waitlistEnabled,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt,
  };
}

function mapVariant(row: typeof serviceVariants.$inferSelect): CatalogueServiceVariantRecord {
  return {
    id: row.id,
    serviceId: row.serviceId,
    name: row.name,
    slug: row.slug,
    priceXaf: row.priceXaf,
    durationValue: row.durationValue,
    durationUnit: row.durationUnit as CatalogueServiceVariantRecord["durationUnit"],
    capacityLimit: row.capacityLimit,
    availabilityStatus: row.availabilityStatus as CatalogueServiceVariantRecord["availabilityStatus"],
    sortOrder: row.sortOrder,
  };
}

function mapComponent(row: typeof serviceComponents.$inferSelect): CatalogueServiceComponentRecord {
  return {
    id: row.id,
    serviceId: row.serviceId,
    variantId: row.variantId,
    componentType: row.componentType,
    label: row.label,
    quantity: row.quantity,
    isMandatory: row.isMandatory,
    consumptionPolicy: row.consumptionPolicy,
  };
}

function mapPolicy(row: typeof servicePolicies.$inferSelect): CatalogueServicePolicyRecord {
  return {
    serviceId: row.serviceId,
    variantId: row.variantId,
    followUpFrequencyDays: row.followUpFrequencyDays,
    lateCancelNoticeHours: row.lateCancelNoticeHours,
    lateCancelConsumesComponent: row.lateCancelConsumesComponent,
    missedConsumesComponent: row.missedConsumesComponent,
    medicalClearancePolicy: row.medicalClearancePolicy,
  };
}

export class DrizzleCatalogueRepository implements CatalogueRepository {
  constructor(private readonly database: CatalogueDb) {}

  async listPublicServices() {
    const serviceRows = await this.database
      .select()
      .from(services)
      .where(and(
        eq(services.isPublic, true),
        isNotNull(services.publishedAt),
        isNull(services.archivedAt),
        ne(services.availabilityStatus, "archived"),
      ))
      .orderBy(asc(services.sortOrder), asc(services.name));

    const serviceIds = serviceRows.map((service) => service.id);
    if (serviceIds.length === 0) {
      return {
        services: [],
        variants: [],
        components: [],
        policies: [],
      };
    }

    const [variantRows, componentRows, policyRows] = await Promise.all([
      this.database
        .select()
        .from(serviceVariants)
        .where(and(
          inArray(serviceVariants.serviceId, serviceIds),
          isNull(serviceVariants.archivedAt),
          ne(serviceVariants.availabilityStatus, "archived"),
        ))
        .orderBy(asc(serviceVariants.sortOrder), asc(serviceVariants.name)),
      this.database
        .select()
        .from(serviceComponents)
        .where(inArray(serviceComponents.serviceId, serviceIds)),
      this.database
        .select()
        .from(servicePolicies)
        .where(inArray(servicePolicies.serviceId, serviceIds)),
    ]);

    return {
      services: serviceRows.map(mapService),
      variants: variantRows.map(mapVariant),
      components: componentRows.map(mapComponent),
      policies: policyRows.map(mapPolicy),
    };
  }
}

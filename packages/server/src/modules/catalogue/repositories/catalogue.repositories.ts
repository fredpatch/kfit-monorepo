import { and, asc, count, eq, inArray, isNotNull, isNull, min, ne, sql } from "drizzle-orm";
import type { db as appDb } from "../../../db/client.js";
import { serviceComponents, servicePolicies, services, serviceVariants } from "../../../db/schema/catalogue.js";
import { subscriptions } from "../../../db/schema/customers.js";
import { waitlistEntries } from "../../../db/schema/prospects.js";
import { capacityClaimCondition } from "../../onboarding/repositories/capacity-claims.js";
import type {
  CatalogueAdminServiceRecord,
  CatalogueRepository,
  CatalogueServiceComponentRecord,
  CatalogueServicePatchInput,
  CatalogueServicePolicyRecord,
  CatalogueServiceRecord,
  CatalogueServiceVariantRecord,
  CatalogueServiceWriteInput,
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

function mapAdminService(row: typeof services.$inferSelect): CatalogueAdminServiceRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    pricingMode: row.pricingMode as CatalogueAdminServiceRecord["pricingMode"],
    basePriceXaf: row.basePriceXaf,
    deliveryType: row.deliveryType as CatalogueAdminServiceRecord["deliveryType"],
    defaultDurationValue: row.defaultDurationValue,
    defaultDurationUnit: row.defaultDurationUnit as CatalogueAdminServiceRecord["defaultDurationUnit"],
    availabilityStatus: row.availabilityStatus as CatalogueAdminServiceRecord["availabilityStatus"],
    capacityMode: row.capacityMode as CatalogueAdminServiceRecord["capacityMode"],
    capacityLimit: row.capacityLimit,
    waitlistEnabled: row.waitlistEnabled,
    isPublic: row.isPublic,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt,
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

function toInsert(input: CatalogueServiceWriteInput) {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description,
    pricingMode: input.pricingMode,
    basePriceXaf: input.basePriceXaf,
    deliveryType: input.deliveryType,
    defaultDurationValue: input.defaultDurationValue,
    defaultDurationUnit: input.defaultDurationUnit,
    availabilityStatus: input.availabilityStatus,
    capacityMode: input.capacityMode,
    capacityLimit: input.capacityLimit,
    waitlistEnabled: input.waitlistEnabled,
    isPublic: input.isPublic,
    sortOrder: input.sortOrder,
  };
}

function toPatch(input: CatalogueServicePatchInput, now: Date) {
  return {
    ...input,
    updatedAt: now,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
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

  /** Read-only snapshot for the admin overview (UX-7). One read-only transaction so counts and services agree. */
  async getAdminOverviewSnapshot(now: Date) {
    return this.database.transaction(async (tx) => {
      const serviceRows = await tx.select().from(services).orderBy(asc(services.sortOrder), asc(services.name));
      const serviceIds = serviceRows.map((service) => service.id);
      if (serviceIds.length === 0) return { services: [], variants: [], components: [], policies: [], claims: [], waitlist: [] };
      const onboarding = sql<boolean>`${subscriptions.status} = 'onboarding'`;
      const [variantRows, componentRows, policyRows, claimRows, waitlistRows] = await Promise.all([
        tx.select().from(serviceVariants)
          .where(and(inArray(serviceVariants.serviceId, serviceIds), isNull(serviceVariants.archivedAt), ne(serviceVariants.availabilityStatus, "archived")))
          .orderBy(asc(serviceVariants.sortOrder), asc(serviceVariants.name)),
        tx.select().from(serviceComponents).where(inArray(serviceComponents.serviceId, serviceIds)),
        tx.select().from(servicePolicies).where(inArray(servicePolicies.serviceId, serviceIds)),
        tx.select({ serviceId: subscriptions.serviceId, variantId: subscriptions.variantId, onboarding, count: count() })
          .from(subscriptions)
          .where(and(inArray(subscriptions.serviceId, serviceIds), capacityClaimCondition(now)))
          .groupBy(subscriptions.serviceId, subscriptions.variantId, onboarding),
        tx.select({ serviceId: waitlistEntries.serviceId, active: count(), oldestEnteredAt: min(waitlistEntries.enteredAt) })
          .from(waitlistEntries)
          .where(and(inArray(waitlistEntries.serviceId, serviceIds), eq(waitlistEntries.status, "active"), isNull(waitlistEntries.leftAt)))
          .groupBy(waitlistEntries.serviceId),
      ]);
      return {
        services: serviceRows.map(mapAdminService),
        variants: variantRows.map(mapVariant),
        components: componentRows.map(mapComponent),
        policies: policyRows.map(mapPolicy),
        claims: claimRows.map((row) => ({ serviceId: row.serviceId, variantId: row.variantId, onboarding: Boolean(row.onboarding), count: Number(row.count) })),
        waitlist: waitlistRows.map((row) => ({ serviceId: row.serviceId, active: Number(row.active), oldestEnteredAt: row.oldestEnteredAt ? new Date(row.oldestEnteredAt) : null })),
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async listAdminServices() {
    const rows = await this.database
      .select()
      .from(services)
      .orderBy(asc(services.sortOrder), asc(services.name));
    return rows.map(mapAdminService);
  }

  async getAdminService(serviceId: string) {
    const [row] = await this.database
      .select()
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    return row ? mapAdminService(row) : null;
  }

  async createService(input: CatalogueServiceWriteInput) {
    try {
      const [created] = await this.database
        .insert(services)
        .values(toInsert(input))
        .returning();
      if (!created) throw new Error("Catalogue service insert returned no row");
      return mapAdminService(created);
    } catch (error) {
      if (isUniqueViolation(error)) return "slug_conflict";
      throw error;
    }
  }

  async updateService(serviceId: string, input: CatalogueServicePatchInput) {
    try {
      const [updated] = await this.database
        .update(services)
        .set(toPatch(input, new Date()))
        .where(and(eq(services.id, serviceId), isNull(services.archivedAt), ne(services.availabilityStatus, "archived")))
        .returning();
      if (!updated) return "not_found";
      return mapAdminService(updated);
    } catch (error) {
      if (isUniqueViolation(error)) return "slug_conflict";
      throw error;
    }
  }

  async publishService(serviceId: string, now: Date) {
    const [existing] = await this.database
      .select()
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (!existing) return "not_found";
    if (existing.archivedAt || existing.availabilityStatus === "archived") return "archived";

    const [updated] = await this.database
      .update(services)
      .set({
        isPublic: true,
        publishedAt: existing.publishedAt ?? now,
        updatedAt: now,
      })
      .where(eq(services.id, serviceId))
      .returning();
    if (!updated) return "not_found";
    return mapAdminService(updated);
  }

  async archiveService(serviceId: string, now: Date) {
    const [updated] = await this.database
      .update(services)
      .set({
        availabilityStatus: "archived",
        isPublic: false,
        archivedAt: now,
        updatedAt: now,
      })
      .where(eq(services.id, serviceId))
      .returning();
    if (!updated) return "not_found";
    return mapAdminService(updated);
  }

  async reorderServices(items: Array<{ serviceId: string; sortOrder: number }>) {
    const ids = items.map((item) => item.serviceId);
    const existing = await this.database
      .select({ id: services.id })
      .from(services)
      .where(inArray(services.id, ids));

    if (existing.length !== ids.length) return "not_found";

    const rows = await this.database.transaction(async (tx) => {
      const updatedRows: Array<typeof services.$inferSelect> = [];
      for (const item of items) {
        const [updated] = await tx
          .update(services)
          .set({ sortOrder: item.sortOrder, updatedAt: sql`now()` })
          .where(eq(services.id, item.serviceId))
          .returning();
        if (!updated) {
          throw new Error("Catalogue reorder precheck failed");
        }
        updatedRows.push(updated);
      }
      return updatedRows;
    });

    return rows.map(mapAdminService);
  }
}

import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { serviceComponents, servicePolicies, services, serviceVariants } from "../schema/catalogue.js";

import { kfitInitialCatalogueSeed } from "./catalogue.seed-data.js";

type CatalogueSeedDatabase = typeof import("../client.js").db;

export type CatalogueSeedResult = {
  services: number;
  variants: number;
  components: number;
  policies: number;
};

export async function seedInitialCatalogue(db: CatalogueSeedDatabase): Promise<CatalogueSeedResult> {
  await db.transaction(async (tx) => {
    await tx.insert(services).values(kfitInitialCatalogueSeed.services).onConflictDoUpdate({
      target: services.id,
      set: {
        name: sqlExcluded("name"),
        slug: sqlExcluded("slug"),
        description: sqlExcluded("description"),
        pricingMode: sqlExcluded("pricing_mode"),
        basePriceXaf: sqlExcluded("base_price_xaf"),
        deliveryType: sqlExcluded("delivery_type"),
        defaultDurationValue: sqlExcluded("default_duration_value"),
        defaultDurationUnit: sqlExcluded("default_duration_unit"),
        availabilityStatus: sqlExcluded("availability_status"),
        capacityMode: sqlExcluded("capacity_mode"),
        capacityLimit: sqlExcluded("capacity_limit"),
        waitlistEnabled: sqlExcluded("waitlist_enabled"),
        isPublic: sqlExcluded("is_public"),
        sortOrder: sqlExcluded("sort_order"),
        publishedAt: sqlExcluded("published_at"),
        archivedAt: null,
      },
    });

    await tx.insert(serviceVariants).values(kfitInitialCatalogueSeed.variants).onConflictDoUpdate({
      target: serviceVariants.id,
      set: {
        name: sqlExcluded("name"),
        slug: sqlExcluded("slug"),
        priceXaf: sqlExcluded("price_xaf"),
        durationValue: sqlExcluded("duration_value"),
        durationUnit: sqlExcluded("duration_unit"),
        capacityLimit: sqlExcluded("capacity_limit"),
        availabilityStatus: sqlExcluded("availability_status"),
        sortOrder: sqlExcluded("sort_order"),
        archivedAt: null,
      },
    });

    await tx.insert(serviceComponents).values(kfitInitialCatalogueSeed.components).onConflictDoUpdate({
      target: serviceComponents.id,
      set: {
        componentType: sqlExcluded("component_type"),
        label: sqlExcluded("label"),
        quantity: sqlExcluded("quantity"),
        isMandatory: sqlExcluded("is_mandatory"),
        consumptionPolicy: sqlExcluded("consumption_policy"),
      },
    });

    await tx.insert(servicePolicies).values(kfitInitialCatalogueSeed.policies).onConflictDoUpdate({
      target: servicePolicies.id,
      set: {
        followUpFrequencyDays: sqlExcluded("follow_up_frequency_days"),
        lateCancelNoticeHours: sqlExcluded("late_cancel_notice_hours"),
        lateCancelConsumesComponent: sqlExcluded("late_cancel_consumes_component"),
        missedConsumesComponent: sqlExcluded("missed_consumes_component"),
        medicalClearancePolicy: sqlExcluded("medical_clearance_policy"),
      },
    });
  });

  return {
    services: kfitInitialCatalogueSeed.services.length,
    variants: kfitInitialCatalogueSeed.variants.length,
    components: kfitInitialCatalogueSeed.components.length,
    policies: kfitInitialCatalogueSeed.policies.length,
  };
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

async function main(): Promise<void> {
  await import("dotenv/config");
  const { db, pool } = await import("../client.js");

  try {
    const result = await seedInitialCatalogue(db);
    console.log(JSON.stringify({ seeded: result }, null, 2));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

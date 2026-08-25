import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db, pool } from "../client.js";
import { serviceComponents, servicePolicies, services, serviceVariants } from "../schema/catalogue.js";

export const kfitInitialCatalogueSeed = {
  services: [
    {
      id: "21000000-0000-4000-8000-000000000001",
      name: "Coaching nutrition personnalisé",
      slug: "coaching-nutrition-personnalise",
      description: "Accompagnement nutrition adapté aux objectifs, habitudes et contraintes du client.",
      pricingMode: "fixed",
      basePriceXaf: 75000,
      deliveryType: "time_based",
      defaultDurationValue: 1,
      defaultDurationUnit: "month",
      availabilityStatus: "open",
      capacityMode: "limited",
      capacityLimit: 12,
      waitlistEnabled: true,
      isPublic: true,
      sortOrder: 10,
      publishedAt: new Date("2026-08-25T08:00:00.000Z"),
    },
    {
      id: "21000000-0000-4000-8000-000000000002",
      name: "Programme sportif 12 semaines",
      slug: "programme-sportif-12-semaines",
      description: "Programme progressif avec suivi WhatsApp pour structurer l'entraînement sur trois mois.",
      pricingMode: "fixed",
      basePriceXaf: 180000,
      deliveryType: "time_based",
      defaultDurationValue: 12,
      defaultDurationUnit: "week",
      availabilityStatus: "open",
      capacityMode: "limited",
      capacityLimit: 8,
      waitlistEnabled: true,
      isPublic: true,
      sortOrder: 20,
      publishedAt: new Date("2026-08-25T08:00:00.000Z"),
    },
    {
      id: "21000000-0000-4000-8000-000000000003",
      name: "Bilan individuel",
      slug: "bilan-individuel",
      description: "Session ponctuelle pour clarifier les objectifs et proposer une orientation de coaching.",
      pricingMode: "quote",
      basePriceXaf: null,
      deliveryType: "one_time",
      defaultDurationValue: null,
      defaultDurationUnit: null,
      availabilityStatus: "waitlist_only",
      capacityMode: "limited",
      capacityLimit: 4,
      waitlistEnabled: true,
      isPublic: true,
      sortOrder: 30,
      publishedAt: new Date("2026-08-25T08:00:00.000Z"),
    },
  ],
  variants: [
    {
      id: "22000000-0000-4000-8000-000000000001",
      serviceId: "21000000-0000-4000-8000-000000000001",
      name: "Standard",
      slug: "standard",
      priceXaf: 75000,
      durationValue: 1,
      durationUnit: "month",
      capacityLimit: 8,
      availabilityStatus: "open",
      sortOrder: 10,
    },
    {
      id: "22000000-0000-4000-8000-000000000002",
      serviceId: "21000000-0000-4000-8000-000000000001",
      name: "Premium",
      slug: "premium",
      priceXaf: 120000,
      durationValue: 1,
      durationUnit: "month",
      capacityLimit: 4,
      availabilityStatus: "open",
      sortOrder: 20,
    },
    {
      id: "22000000-0000-4000-8000-000000000003",
      serviceId: "21000000-0000-4000-8000-000000000002",
      name: "Suivi complet",
      slug: "suivi-complet",
      priceXaf: 180000,
      durationValue: 12,
      durationUnit: "week",
      capacityLimit: 8,
      availabilityStatus: "open",
      sortOrder: 10,
    },
  ],
  components: [
    {
      id: "23000000-0000-4000-8000-000000000001",
      serviceId: "21000000-0000-4000-8000-000000000001",
      variantId: null,
      componentType: "follow_up",
      label: "Suivi WhatsApp hebdomadaire",
      quantity: 4,
      isMandatory: true,
      consumptionPolicy: "manual",
    },
    {
      id: "23000000-0000-4000-8000-000000000002",
      serviceId: "21000000-0000-4000-8000-000000000001",
      variantId: "22000000-0000-4000-8000-000000000002",
      componentType: "appointment",
      label: "Session individuelle mensuelle",
      quantity: 1,
      isMandatory: true,
      consumptionPolicy: "manual",
    },
    {
      id: "23000000-0000-4000-8000-000000000003",
      serviceId: "21000000-0000-4000-8000-000000000002",
      variantId: "22000000-0000-4000-8000-000000000003",
      componentType: "program",
      label: "Plan d'entraînement progressif",
      quantity: 1,
      isMandatory: true,
      consumptionPolicy: "manual",
    },
    {
      id: "23000000-0000-4000-8000-000000000004",
      serviceId: "21000000-0000-4000-8000-000000000002",
      variantId: "22000000-0000-4000-8000-000000000003",
      componentType: "follow_up",
      label: "Points de suivi WhatsApp",
      quantity: 12,
      isMandatory: true,
      consumptionPolicy: "manual",
    },
    {
      id: "23000000-0000-4000-8000-000000000005",
      serviceId: "21000000-0000-4000-8000-000000000003",
      variantId: null,
      componentType: "appointment",
      label: "Session d'évaluation initiale",
      quantity: 1,
      isMandatory: true,
      consumptionPolicy: "manual",
    },
  ],
  policies: [
    {
      id: "24000000-0000-4000-8000-000000000001",
      serviceId: "21000000-0000-4000-8000-000000000001",
      variantId: null,
      followUpFrequencyDays: 7,
      lateCancelNoticeHours: 24,
      lateCancelConsumesComponent: false,
      missedConsumesComponent: true,
      medicalClearancePolicy: "required_if_risk_flag",
    },
    {
      id: "24000000-0000-4000-8000-000000000002",
      serviceId: "21000000-0000-4000-8000-000000000002",
      variantId: "22000000-0000-4000-8000-000000000003",
      followUpFrequencyDays: 7,
      lateCancelNoticeHours: 24,
      lateCancelConsumesComponent: false,
      missedConsumesComponent: true,
      medicalClearancePolicy: "required_if_risk_flag",
    },
    {
      id: "24000000-0000-4000-8000-000000000003",
      serviceId: "21000000-0000-4000-8000-000000000003",
      variantId: null,
      followUpFrequencyDays: null,
      lateCancelNoticeHours: 12,
      lateCancelConsumesComponent: false,
      missedConsumesComponent: false,
      medicalClearancePolicy: "not_required",
    },
  ],
} as const;

export type CatalogueSeedResult = {
  services: number;
  variants: number;
  components: number;
  policies: number;
};

export async function seedInitialCatalogue(): Promise<CatalogueSeedResult> {
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
  const result = await seedInitialCatalogue();
  console.log(JSON.stringify({ seeded: result }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .finally(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

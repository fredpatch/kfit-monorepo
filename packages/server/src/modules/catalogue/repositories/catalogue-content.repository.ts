import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type {
  CatalogueAdminComponent,
  CatalogueAdminRules,
  CatalogueAdminVariant,
  CatalogueComponentType,
  CatalogueConsumptionPolicy,
  CatalogueDeliverabilityResponse,
  CatalogueDurationUnit,
  CatalogueAvailabilityStatus,
  CatalogueMedicalClearancePolicy,
} from "@kfit/shared";
import type { db as appDb } from "../../../db/client.js";
import {
  serviceComponents,
  servicePolicies,
  services,
  serviceVariants,
} from "../../../db/schema/catalogue.js";
import {
  AuditService,
  type AuditMetadata,
} from "../../auth/services/audit.service.js";
import {
  lockCadenceWrites,
  lockPolicyCadenceScope,
  recordPolicyCadenceChanges,
} from "../../follow-ups/repositories/cadence-history.repository.js";
import { syncPolicyMedicalRequirement } from "../../onboarding/repositories/medical-requirement.js";
import { effectiveMedicalPolicy } from "../../onboarding/services/onboarding.service.js";
import {
  evaluateDeliverability,
  variantStateInvalid,
  type CatalogueComponentPatch,
  type CatalogueComponentWrite,
  type CatalogueRulesWrite,
  type CatalogueVariantWrite,
  type DeliverabilityInput,
} from "../services/catalogue-content.policy.js";
import { isPgUniqueViolation } from "../../../db/pg-error.js";

type Database = typeof appDb;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ServiceRow = typeof services.$inferSelect;
export type CatalogueContentActor = {
  userId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};
export type CatalogueContentError =
  | "service_not_found"
  | "service_archived"
  | "variant_not_found"
  | "variant_archived"
  | "variant_slug_conflict"
  | "component_not_found"
  | "component_archived"
  | "override_not_found"
  | "override_has_questionnaire"
  | "invalid";
export type CatalogueContentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CatalogueContentError; reason?: string };

const fail = (
  error: CatalogueContentError,
  reason?: string,
): { ok: false; error: CatalogueContentError; reason?: string } => ({
  ok: false,
  error,
  ...(reason ? { reason } : {}),
});
const isArchivedService = (row: ServiceRow) =>
  row.archivedAt !== null || row.availabilityStatus === "archived";
const isArchivedVariant = (row: typeof serviceVariants.$inferSelect) =>
  row.archivedAt !== null || row.availabilityStatus === "archived";
/** Active variant: not archived by either marker (same predicate as qualification, REG-F1). */
export const activeVariant = and(
  isNull(serviceVariants.archivedAt),
  ne(serviceVariants.availabilityStatus, "archived"),
);
const variantFields = [
  "name",
  "slug",
  "priceXaf",
  "durationValue",
  "durationUnit",
  "capacityLimit",
  "availabilityStatus",
  "sortOrder",
] as const;
const componentFields = [
  "componentType",
  "label",
  "quantity",
  "isMandatory",
  "consumptionPolicy",
] as const;
const rulesFields = [
  "followUpFrequencyDays",
  "lateCancelNoticeHours",
  "lateCancelConsumesComponent",
  "missedConsumesComponent",
  "medicalClearancePolicy",
] as const;

function variantDto(
  row: typeof serviceVariants.$inferSelect,
): CatalogueAdminVariant {
  return {
    id: row.id,
    serviceId: row.serviceId,
    name: row.name,
    slug: row.slug,
    priceXaf: row.priceXaf,
    durationValue: row.durationValue,
    durationUnit: row.durationUnit as CatalogueDurationUnit | null,
    capacityLimit: row.capacityLimit,
    availabilityStatus: row.availabilityStatus as CatalogueAvailabilityStatus,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
function componentDto(
  row: typeof serviceComponents.$inferSelect,
): CatalogueAdminComponent {
  return {
    id: row.id,
    serviceId: row.serviceId,
    variantId: row.variantId,
    componentType: row.componentType as CatalogueComponentType,
    label: row.label,
    quantity: row.quantity,
    isMandatory: row.isMandatory,
    consumptionPolicy: row.consumptionPolicy as CatalogueConsumptionPolicy,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
function rulesDto(
  row: typeof servicePolicies.$inferSelect,
): CatalogueAdminRules {
  return {
    serviceId: row.serviceId,
    variantId: row.variantId,
    followUpFrequencyDays: row.followUpFrequencyDays,
    lateCancelNoticeHours: row.lateCancelNoticeHours,
    lateCancelConsumesComponent: row.lateCancelConsumesComponent,
    missedConsumesComponent: row.missedConsumesComponent,
    medicalClearancePolicy:
      row.medicalClearancePolicy as CatalogueMedicalClearancePolicy | null,
  };
}
const changed = <K extends string>(
  fields: readonly K[],
  before: Record<K, unknown>,
  after: Partial<Record<K, unknown>>,
) => fields.filter((field) => field in after && after[field] !== before[field]);

/** D6 input for one service, read inside the caller's transaction. */
export async function loadDeliverabilityInput(
  tx: Tx | Database,
  service: ServiceRow,
): Promise<DeliverabilityInput> {
  const variants = await tx
    .select()
    .from(serviceVariants)
    .where(and(eq(serviceVariants.serviceId, service.id), activeVariant));
  const components = await tx
    .select({ variantId: serviceComponents.variantId })
    .from(serviceComponents)
    .where(
      and(
        eq(serviceComponents.serviceId, service.id),
        isNull(serviceComponents.archivedAt),
      ),
    );
  const [rules] = await tx
    .select()
    .from(servicePolicies)
    .where(
      and(
        eq(servicePolicies.serviceId, service.id),
        isNull(servicePolicies.variantId),
      ),
    );
  return {
    service: {
      pricingMode: service.pricingMode,
      basePriceXaf: service.basePriceXaf,
      deliveryType: service.deliveryType,
      defaultDurationValue: service.defaultDurationValue,
      defaultDurationUnit: service.defaultDurationUnit,
    },
    variants: variants.map((v) => ({
      id: v.id,
      priceXaf: v.priceXaf,
      durationValue: v.durationValue,
      durationUnit: v.durationUnit,
    })),
    components,
    serviceRules: rules
      ? { medicalClearancePolicy: rules.medicalClearancePolicy }
      : null,
  };
}

export class DrizzleCatalogueContentRepository {
  constructor(
    private readonly database: Database,
    private readonly options: { auditHashPepper: string },
  ) {}

  private audit(
    tx: Tx,
    actor: CatalogueContentActor,
    entityType: string,
    entityId: string,
    eventType: string,
    metadata: AuditMetadata,
  ) {
    return new AuditService(tx, this.options).record({
      actorType: "user",
      actorUserId: actor.userId,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      eventType,
      entityType,
      entityId,
      result: "success",
      metadata,
    });
  }
  /** Capacity claim writers and every content writer take the service row first (onboarding.repository.ts). */
  private async lockService(
    tx: Tx,
    serviceId: string,
  ): Promise<CatalogueContentResult<ServiceRow>> {
    const [service] = await tx
      .select()
      .from(services)
      .where(eq(services.id, serviceId))
      .for("update");
    if (!service) return fail("service_not_found");
    return isArchivedService(service)
      ? fail("service_archived")
      : { ok: true, value: service };
  }
  private async lockVariant(tx: Tx, serviceId: string, variantId: string) {
    const [variant] = await tx
      .select()
      .from(serviceVariants)
      .where(
        and(
          eq(serviceVariants.id, variantId),
          eq(serviceVariants.serviceId, serviceId),
        ),
      )
      .for("update");
    return variant;
  }
  private async withSlugGuard<T>(
    work: () => Promise<CatalogueContentResult<T>>,
  ): Promise<CatalogueContentResult<T>> {
    try {
      return await work();
    } catch (error) {
      if (isPgUniqueViolation(error)) return fail("variant_slug_conflict");
      throw error;
    }
  }

  createVariant(
    serviceId: string,
    input: CatalogueVariantWrite,
    actor: CatalogueContentActor,
  ): Promise<CatalogueContentResult<CatalogueAdminVariant>> {
    return this.withSlugGuard(() =>
      this.database.transaction(async (tx) => {
        const service = await this.lockService(tx, serviceId);
        if (!service.ok) return service;
        const [row] = await tx
          .insert(serviceVariants)
          .values({ serviceId, ...input })
          .returning();
        if (!row) throw new Error("Variant insert did not return a row");
        await this.audit(
          tx,
          actor,
          "service_variant",
          row.id,
          "catalogue.variant_created",
          { serviceId, variantId: row.id, changedFields: Object.keys(input) },
        );
        return { ok: true, value: variantDto(row) };
      }),
    );
  }

  updateVariant(
    serviceId: string,
    variantId: string,
    patch: Partial<CatalogueVariantWrite>,
    actor: CatalogueContentActor,
  ): Promise<CatalogueContentResult<CatalogueAdminVariant>> {
    return this.withSlugGuard(() =>
      this.database.transaction(async (tx) => {
        const service = await this.lockService(tx, serviceId);
        if (!service.ok) return service;
        const variant = await this.lockVariant(tx, serviceId, variantId);
        if (!variant) return fail("variant_not_found");
        if (isArchivedVariant(variant)) return fail("variant_archived");
        const invalid = variantStateInvalid({
          durationValue:
            patch.durationValue !== undefined
              ? patch.durationValue
              : variant.durationValue,
          durationUnit:
            patch.durationUnit !== undefined
              ? patch.durationUnit
              : (variant.durationUnit as CatalogueDurationUnit | null),
        });
        if (invalid) return fail("invalid", invalid);
        const fields = changed(variantFields, variant, patch);
        const [row] = await tx
          .update(serviceVariants)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(serviceVariants.id, variant.id))
          .returning();
        if (!row) throw new Error("Variant update did not return a row");
        if (fields.length)
          await this.audit(
            tx,
            actor,
            "service_variant",
            row.id,
            "catalogue.variant_updated",
            { serviceId, variantId: row.id, changedFields: fields },
          );
        return { ok: true, value: variantDto(row) };
      }),
    );
  }

  /** Idempotent. Subscriptions already sold on this variant keep it; it is no longer offered or convertible. */
  archiveVariant(
    serviceId: string,
    variantId: string,
    actor: CatalogueContentActor,
  ): Promise<CatalogueContentResult<CatalogueAdminVariant>> {
    return this.database.transaction(async (tx) => {
      const service = await this.lockService(tx, serviceId);
      if (!service.ok) return service;
      const variant = await this.lockVariant(tx, serviceId, variantId);
      if (!variant) return fail("variant_not_found");
      if (isArchivedVariant(variant) && variant.archivedAt)
        return { ok: true, value: variantDto(variant) };
      const now = new Date();
      const [row] = await tx
        .update(serviceVariants)
        .set({
          archivedAt: now,
          availabilityStatus: "archived",
          updatedAt: now,
        })
        .where(eq(serviceVariants.id, variant.id))
        .returning();
      if (!row) throw new Error("Variant archive did not return a row");
      await this.audit(
        tx,
        actor,
        "service_variant",
        row.id,
        "catalogue.variant_archived",
        {
          serviceId,
          variantId: row.id,
          changedFields: ["archivedAt", "availabilityStatus"],
        },
      );
      return { ok: true, value: variantDto(row) };
    });
  }

  createComponent(
    serviceId: string,
    input: CatalogueComponentWrite,
    actor: CatalogueContentActor,
  ): Promise<CatalogueContentResult<CatalogueAdminComponent>> {
    return this.database.transaction(async (tx) => {
      const service = await this.lockService(tx, serviceId);
      if (!service.ok) return service;
      if (input.variantId) {
        const variant = await this.lockVariant(tx, serviceId, input.variantId);
        if (!variant) return fail("variant_not_found");
        if (isArchivedVariant(variant)) return fail("variant_archived");
      }
      const [row] = await tx
        .insert(serviceComponents)
        .values({ serviceId, ...input })
        .returning();
      if (!row) throw new Error("Component insert did not return a row");
      await this.audit(
        tx,
        actor,
        "service_component",
        row.id,
        "catalogue.component_created",
        {
          serviceId,
          variantId: row.variantId,
          componentId: row.id,
          changedFields: Object.keys(input),
        },
      );
      return { ok: true, value: componentDto(row) };
    });
  }

  private async lockComponent(tx: Tx, serviceId: string, componentId: string) {
    const [component] = await tx
      .select()
      .from(serviceComponents)
      .where(
        and(
          eq(serviceComponents.id, componentId),
          eq(serviceComponents.serviceId, serviceId),
        ),
      )
      .for("update");
    return component;
  }

  /** Sold subscriptions keep their label and quantity snapshots (subscription_components). */
  updateComponent(
    serviceId: string,
    componentId: string,
    patch: CatalogueComponentPatch,
    actor: CatalogueContentActor,
  ): Promise<CatalogueContentResult<CatalogueAdminComponent>> {
    return this.database.transaction(async (tx) => {
      const service = await this.lockService(tx, serviceId);
      if (!service.ok) return service;
      const component = await this.lockComponent(tx, serviceId, componentId);
      if (!component) return fail("component_not_found");
      if (component.archivedAt) return fail("component_archived");
      const fields = changed(componentFields, component, patch);
      const [row] = await tx
        .update(serviceComponents)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(serviceComponents.id, component.id))
        .returning();
      if (!row) throw new Error("Component update did not return a row");
      if (fields.length)
        await this.audit(
          tx,
          actor,
          "service_component",
          row.id,
          "catalogue.component_updated",
          {
            serviceId,
            variantId: row.variantId,
            componentId: row.id,
            changedFields: fields,
          },
        );
      return { ok: true, value: componentDto(row) };
    });
  }

  /** Idempotent. No hard delete: subscription_components reference sold components (FK restrict). */
  archiveComponent(
    serviceId: string,
    componentId: string,
    actor: CatalogueContentActor,
  ): Promise<CatalogueContentResult<CatalogueAdminComponent>> {
    return this.database.transaction(async (tx) => {
      const service = await this.lockService(tx, serviceId);
      if (!service.ok) return service;
      const component = await this.lockComponent(tx, serviceId, componentId);
      if (!component) return fail("component_not_found");
      if (component.archivedAt)
        return { ok: true, value: componentDto(component) };
      const now = new Date();
      const [row] = await tx
        .update(serviceComponents)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(serviceComponents.id, component.id))
        .returning();
      if (!row) throw new Error("Component archive did not return a row");
      await this.audit(
        tx,
        actor,
        "service_component",
        row.id,
        "catalogue.component_archived",
        {
          serviceId,
          variantId: row.variantId,
          componentId: row.id,
          changedFields: ["archivedAt"],
        },
      );
      return { ok: true, value: componentDto(row) };
    });
  }

  /**
   * D3/D5 lock order: cadence fence 7247001, then every subscription of the service (owner rows), then the service,
   * the variant and the policy rows. Cadence history and live medical requirements follow in the same transaction.
   */
  private rulesWrite<T>(
    serviceId: string,
    variantId: string | null,
    actor: CatalogueContentActor,
    write: (
      tx: Tx,
      scopeRow: typeof servicePolicies.$inferSelect | undefined,
    ) => Promise<CatalogueContentResult<T>>,
  ): Promise<
    CatalogueContentResult<{
      value: T;
      onboardingSubscriptionsAffected: number;
    }>
  > {
    return this.database.transaction(async (tx) => {
      await lockCadenceWrites(tx);
      const before = await lockPolicyCadenceScope(tx, [serviceId]);
      const service = await this.lockService(tx, serviceId);
      if (!service.ok) return service;
      if (variantId) {
        const variant = await this.lockVariant(tx, serviceId, variantId);
        if (!variant) return fail("variant_not_found");
      }
      const rowsBefore = await tx
        .select()
        .from(servicePolicies)
        .where(eq(servicePolicies.serviceId, serviceId))
        .orderBy(asc(servicePolicies.id))
        .for("update");
      const scopeRow = rowsBefore.find((row) => row.variantId === variantId);
      const result = await write(tx, scopeRow);
      if (!result.ok) return result;
      const now = new Date();
      await recordPolicyCadenceChanges(tx, before, now);
      const rowsAfter = await tx
        .select()
        .from(servicePolicies)
        .where(eq(servicePolicies.serviceId, serviceId));
      let affected = 0;
      for (const { sub } of before) {
        if (sub.status !== "onboarding") continue;
        const from = effectiveMedicalPolicy(rowsBefore, sub.variantId),
          to = effectiveMedicalPolicy(rowsAfter, sub.variantId);
        if (from === to) continue;
        affected += 1;
        await syncPolicyMedicalRequirement(
          tx,
          sub.id,
          to,
          (eventType, metadata) =>
            this.audit(tx, actor, "subscription", sub.id, eventType, metadata),
        );
      }
      return {
        ok: true,
        value: {
          value: result.value,
          onboardingSubscriptionsAffected: affected,
        },
      };
    });
  }

  /** PUT of the five editable rules; questionnaireTemplateId is left as it is (D3). */
  async putRules(
    serviceId: string,
    variantId: string | null,
    rules: CatalogueRulesWrite,
    actor: CatalogueContentActor,
  ) {
    return this.rulesWrite(
      serviceId,
      variantId,
      actor,
      async (tx, scopeRow) => {
        const fields = scopeRow
          ? changed(rulesFields, scopeRow, rules)
          : [...rulesFields];
        const [row] = scopeRow
          ? await tx
              .update(servicePolicies)
              .set({ ...rules, updatedAt: new Date() })
              .where(eq(servicePolicies.id, scopeRow.id))
              .returning()
          : await tx
              .insert(servicePolicies)
              .values({ serviceId, variantId, ...rules })
              .returning();
        if (!row) throw new Error("Rules write did not return a row");
        await this.audit(
          tx,
          actor,
          "service_policy",
          row.id,
          "catalogue.rules_updated",
          { serviceId, variantId, changedFields: fields, created: !scopeRow },
        );
        return { ok: true, value: rulesDto(row) };
      },
    );
  }

  /** Back to the offer rules. A variant row that also carries a questionnaire assignment is not removed here (D3). */
  async removeVariantRules(
    serviceId: string,
    variantId: string,
    actor: CatalogueContentActor,
  ) {
    return this.rulesWrite(
      serviceId,
      variantId,
      actor,
      async (tx, scopeRow) => {
        if (!scopeRow) return fail("override_not_found");
        if (scopeRow.questionnaireTemplateId)
          return fail("override_has_questionnaire");
        await tx
          .delete(servicePolicies)
          .where(eq(servicePolicies.id, scopeRow.id));
        await this.audit(
          tx,
          actor,
          "service_policy",
          scopeRow.id,
          "catalogue.rules_override_removed",
          { serviceId, variantId, changedFields: [...rulesFields] },
        );
        return { ok: true, value: true as const };
      },
    );
  }

  /** Read-only report; a published offer that fails is flagged, never unpublished (D6). */
  async deliverability(
    serviceId: string,
  ): Promise<CatalogueContentResult<CatalogueDeliverabilityResponse>> {
    return this.database.transaction(
      async (tx) => {
        const [service] = await tx
          .select()
          .from(services)
          .where(eq(services.id, serviceId));
        if (!service) return fail("service_not_found");
        const failures = evaluateDeliverability(
          await loadDeliverabilityInput(tx, service),
        );
        return {
          ok: true,
          value: { serviceId, deliverable: failures.length === 0, failures },
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
